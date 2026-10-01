import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { testAccessToken } from './sessionFixture.js'

describe.skipIf(!process.env.TEST_DATABASE_URL)('release regressions in disposable MySQL', () => {
  let db, auth, server, origin, role, category, brand, passwordHash, sequence = 0
  const stamp = Date.now().toString(36), password = 'ReleaseTest123!'
  const grants = ['inventory.VIEW', 'inventory.EDIT', 'products.VIEW', 'reports.VIEW', 'reservations.VIEW', 'reservations.CREATE']
  beforeAll(async () => {
    if (!/^\/techstock_test_warehouse_[a-z0-9]+$/.test(new URL(process.env.TEST_DATABASE_URL).pathname)) throw Error('Unsafe release fixture schema')
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
    db = (await import('../src/config/prisma.js')).prisma; auth = await import('../src/services/authService.js')
    passwordHash = await bcrypt.hash(password, 4)
    role = await db.role.create({ data: { name: 'Release operator ' + stamp } })
    for (const grant of grants) {
      const [module, action] = grant.split('.'), p = await db.permission.upsert({ where: { module_action: { module, action } }, create: { module, action }, update: {} })
      await db.rolePermission.create({ data: { roleId: role.id, permissionId: p.id } })
    }
    category = await db.category.create({ data: { name: 'Release ' + stamp, slug: 'release-' + stamp } })
    brand = await db.brand.create({ data: { name: 'Release ' + stamp, slug: 'release-' + stamp } })
    server = (await import('../src/app.js')).app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); origin = `http://127.0.0.1:${server.address().port}`
  }, 30000)
  afterAll(async () => { if (server) await new Promise(resolve => server.close(resolve)); if (db) await db.$disconnect() })
  async function fixture(serialized = false, quantity = 5) {
    const key = stamp + '-' + (++sequence)
    const warehouse = await db.warehouse.create({ data: { name: 'Release ' + key, code: 'RL-' + key } })
    const user = await db.user.create({ data: { firstName: 'Release', lastName: key, email: `release-${key}@test.invalid`, passwordHash, roleId: role.id, warehouseAssignments: { create: { warehouseId: warehouse.id, isDefault: true } } } })
    const token = await testAccessToken(db, user.id, process.env.JWT_ACCESS_SECRET)
    const product = await db.product.create({ data: { name: 'Release product ' + key, sku: 'RL-' + key, categoryId: category.id, brandId: brand.id, purchaseCost: '12.34', trackSerialNumbers: serialized } })
    const stock = await db.warehouseStock.create({ data: { productId: product.id, warehouseId: warehouse.id, quantity } })
    const serial = serialized ? await db.serialNumber.create({ data: { serialNumber: 'RL-SERIAL-' + key, productId: product.id, warehouseId: warehouse.id } }) : null
    return { user, token, claims: jwt.decode(token), warehouse, product, stock, serial }
  }
  async function http(token, route, body) {
    const r = await fetch(origin + '/api' + route, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
    return { status: r.status, body: await r.json(), headers: r.headers }
  }
  const adjustment = (f, extra = {}) => ({ productId: f.product.id, warehouseId: f.warehouse.id, type: 'STOCK_OUT', quantity: 5, reason: 'Release regression', ...extra })
  const reserve = f => ({ warehouseId: f.warehouse.id, referenceType: 'Project', referenceId: 'Release regression', items: [{ productId: f.product.id, quantity: 5 }] })
  const current = f => db.warehouseStock.findUniqueOrThrow({ where: { id: f.stock.id } })
  const sign = claims => jwt.sign(claims, process.env.JWT_ACCESS_SECRET, { algorithm: 'HS256' })

  it.each([
    ['expired token', c => ({ ...c, exp: Math.floor(Date.now() / 1000) - 1 })],
    ['not-yet-valid token', c => ({ ...c, nbf: Math.floor(Date.now() / 1000) + 60 })],
    ['missing session', c => ({ ...c, sid: undefined })],
    ['unknown session', c => ({ ...c, sid: 'unknown-release-session' })],
    ['object session', c => ({ ...c, sid: {} })],
    ['numeric subject', c => ({ ...c, sub: 123 })],
    ['object subject', c => ({ ...c, sub: {} })],
    ['missing version', c => ({ ...c, ver: undefined })],
    ['string version', c => ({ ...c, ver: '0' })],
    ['stale version', c => ({ ...c, ver: c.ver + 1 })],
    ['refresh purpose', c => ({ ...c, type: 'refresh' })],
    ['missing purpose', c => ({ ...c, type: undefined })]
  ])('rejects %s without business writes', async (name, transform) => {
    const f = await fixture(), token = sign(transform(f.claims))
    expect((await http(token, '/auth/me')).status).toBe(401)
    expect((await http(token, '/inventory/adjust', adjustment(f))).status).toBe(401)
    expect(await current(f)).toMatchObject({ quantity: 5, reservedQuantity: 0 })
    expect(await db.stockAdjustment.count({ where: { productId: f.product.id } })).toBe(0)
  })
  it('rejects a wrong signature, disallowed algorithm and another account session', async () => {
    const a = await fixture(), b = await fixture()
    for (const token of [jwt.sign(a.claims, 'incorrect-key'), jwt.sign(a.claims, process.env.JWT_ACCESS_SECRET, { algorithm: 'HS384' }), sign({ ...a.claims, sid: b.claims.sid })]) expect((await http(token, '/auth/me')).status).toBe(401)
  })
  it.each(['expired', 'revoked', 'inactive', 'version changed'])('rejects live %s state on the next read and write', async state => {
    const f = await fixture()
    if (state === 'expired') await db.session.update({ where: { id: f.claims.sid }, data: { expiresAt: new Date(Date.now() - 1000) } })
    if (state === 'revoked') await db.session.update({ where: { id: f.claims.sid }, data: { revokedAt: new Date() } })
    if (state === 'inactive') await db.user.update({ where: { id: f.user.id }, data: { status: 'INACTIVE' } })
    if (state === 'version changed') await db.user.update({ where: { id: f.user.id }, data: { authVersion: { increment: 1 } } })
    expect((await http(f.token, '/reports/catalog')).status).toBe(401); expect((await http(f.token, '/inventory/adjust', adjustment(f))).status).toBe(401)
    expect(await current(f)).toMatchObject({ quantity: 5, reservedQuantity: 0 })
  })
  it('applies live role and warehouse revocation to a retained access token', async () => {
    const f = await fixture()
    expect((await http(f.token, '/reports/data/inventory-valuation?warehouse=' + f.warehouse.id)).status).toBe(200)
    await db.userWarehouse.deleteMany({ where: { userId: f.user.id } })
    expect((await http(f.token, '/reports/data/inventory-valuation?warehouse=' + f.warehouse.id)).status).toBe(403)
    expect((await http(f.token, '/inventory/adjust', adjustment(f))).status).toBe(403)
    const emptyRole = await db.role.create({ data: { name: 'Release no grants ' + stamp } })
    await db.user.update({ where: { id: f.user.id }, data: { roleId: emptyRole.id } })
    expect((await http(f.token, '/reports/catalog')).status).toBe(403); expect((await http(f.token, '/auth/me')).status).toBe(200)
    expect(await current(f)).toMatchObject({ quantity: 5, reservedQuantity: 0 })
  })
  it('resets an expired lockout and rejects inactive account login without issuing sessions', async () => {
    const f = await fixture(), res = { cookie() {} }
    await db.user.update({ where: { id: f.user.id }, data: { failedLoginCount: 5, lockedUntil: new Date(Date.now() - 1000) } })
    await expect(auth.login({ email: f.user.email, password: 'incorrect', remember: false }, res)).rejects.toHaveProperty('status', 401)
    expect((await db.user.findUniqueOrThrow({ where: { id: f.user.id } })).failedLoginCount).toBe(1)
    await auth.login({ email: f.user.email, password, remember: false }, res)
    expect(await db.user.findUniqueOrThrow({ where: { id: f.user.id } })).toMatchObject({ failedLoginCount: 0, lockedUntil: null })
    await db.user.update({ where: { id: f.user.id }, data: { status: 'INACTIVE' } })
    const before = await db.session.count({ where: { userId: f.user.id } })
    await expect(auth.login({ email: f.user.email, password, remember: false }, res)).rejects.toHaveProperty('status', 401)
    expect(await db.session.count({ where: { userId: f.user.id } })).toBe(before)
  })
  it.each([false, true])('sets and clears the real refresh cookie with remember=%s', async remember => {
    const f = await fixture()
    const login = await http('', '/auth/login', { email: f.user.email, password, remember })
    expect(login.status).toBe(200); expect(login.headers.get('cache-control')).toBe('private, no-store')
    const cookie = login.headers.get('set-cookie')
    expect(cookie).toContain('HttpOnly'); expect(cookie).toContain('SameSite=Lax'); expect(cookie).toContain('Path=/api/auth')
    expect(cookie.includes('Expires=')).toBe(remember)
    expect(JSON.stringify(login.body)).not.toMatch(/passwordHash|refreshTokenHash|authVersion/)
    const rotated = await fetch(origin + '/api/auth/refresh', { method: 'POST', headers: { Cookie: cookie.split(';')[0] } })
    expect(rotated.status).toBe(200); expect(rotated.headers.get('cache-control')).toBe('private, no-store')
    const nextCookie = rotated.headers.get('set-cookie')
    expect(nextCookie.split(';')[0]).not.toBe(cookie.split(';')[0])
    const access = (await rotated.json()).data.accessToken
    expect(jwt.decode(access).sid).toBe(jwt.decode(login.body.data.accessToken).sid)
    const logout = await fetch(origin + '/api/auth/logout', { method: 'POST', headers: { Cookie: nextCookie.split(';')[0] } })
    expect(logout.status).toBe(200); expect(logout.headers.get('set-cookie')).toContain('Expires=Thu, 01 Jan 1970')
    expect((await http(access, '/auth/me')).status).toBe(401)
  })
  it('permits only one HTTP removal of the last five units with one adjustment, movement and audit', async () => {
    const f = await fixture(), results = await Promise.all([http(f.token, '/inventory/adjust', adjustment(f)), http(f.token, '/inventory/adjust', adjustment(f))])
    expect(results.filter(r => r.status === 201 || r.status === 200)).toHaveLength(1)
    expect(results.filter(r => [400, 409].includes(r.status))).toHaveLength(1)
    expect(await current(f)).toMatchObject({ quantity: 0, reservedQuantity: 0 })
    const rows = await db.stockAdjustment.findMany({ where: { productId: f.product.id } }); expect(rows).toHaveLength(1)
    expect(await db.stockMovement.findMany({ where: { productId: f.product.id } })).toMatchObject([{ quantity: -5, previousQuantity: 5, newQuantity: 0 }])
    expect(await db.activityLog.count({ where: { entityType: 'StockAdjustment', entityId: rows[0].id } })).toBe(1)
    const report = await http(f.token, '/reports/data/inventory-valuation?warehouse=' + f.warehouse.id)
    expect(report.status).toBe(200); expect(report.body.data[0]).toMatchObject({ quantity: 0, value: '0.00' })
  })
  it('serializes a competing reservation and physical removal without consuming held units', async () => {
    const f = await fixture(), results = await Promise.all([http(f.token, '/reservations', reserve(f)), http(f.token, '/inventory/adjust', adjustment(f))])
    expect(results.filter(r => [200, 201].includes(r.status))).toHaveLength(1); expect(results.filter(r => [400, 409].includes(r.status))).toHaveLength(1)
    const stock = await current(f)
    expect([[5, 5], [0, 0]]).toContainEqual([stock.quantity, stock.reservedQuantity])
    expect(await db.stockMovement.count({ where: { productId: f.product.id } })).toBe(1)
    expect(await db.inventoryReservation.count({ where: { warehouseId: f.warehouse.id } }) + await db.stockAdjustment.count({ where: { productId: f.product.id } })).toBe(1)
  })
  it('removes an exact serialized unit once and retains exactly one lifecycle event', async () => {
    const f = await fixture(true, 1), input = adjustment(f, { quantity: 1, serialNumbers: [f.serial.serialNumber] })
    const results = await Promise.all([http(f.token, '/inventory/adjust', input), http(f.token, '/inventory/adjust', input)])
    expect(results.filter(r => [200, 201].includes(r.status))).toHaveLength(1); expect(results.filter(r => [400, 409].includes(r.status))).toHaveLength(1)
    expect((await current(f)).quantity).toBe(0); expect((await db.serialNumber.findUniqueOrThrow({ where: { id: f.serial.id } })).status).toBe('DISPOSED')
    expect(await db.serialEvent.count({ where: { serialNumberId: f.serial.id, type: 'STOCK_REMOVED' } })).toBe(1)
  })
  it('rolls back every item, hold, movement and document when a later reservation item fails', async () => {
    const f = await fixture(), invalid = await db.product.create({ data: { name: 'Unstocked release ' + sequence, sku: 'RL-EMPTY-' + stamp + sequence, categoryId: category.id, brandId: brand.id } })
    const result = await http(f.token, '/reservations', { ...reserve(f), items: [{ productId: f.product.id, quantity: 5 }, { productId: invalid.id, quantity: 1 }] })
    expect(result.status).toBe(409); expect(await current(f)).toMatchObject({ quantity: 5, reservedQuantity: 0 })
    expect(await db.stockMovement.count({ where: { productId: f.product.id } })).toBe(0); expect(await db.inventoryReservation.count({ where: { warehouseId: f.warehouse.id } })).toBe(0)
  })
})
