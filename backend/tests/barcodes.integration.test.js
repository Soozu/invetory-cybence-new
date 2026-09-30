import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import bcrypt from 'bcrypt'

describe.skipIf(!process.env.TEST_DATABASE_URL)('barcode lookup and scanned transfers with isolated MySQL', () => {
  let db, barcode, transfers, server, origin, f
  const suffix = Date.now().toString(36)
  const request = async (token, path, method = 'GET', body) => { const response = await fetch(`${origin}/api${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: response.status, ...(await response.json()) } }
  beforeAll(async () => {
    if (!/^techstock_test_warehouse_[a-z0-9_]+$/.test(new URL(process.env.TEST_DATABASE_URL).pathname.slice(1))) throw new Error('Unsafe test schema.')
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL; db = (await import('../src/config/prisma.js')).prisma
    barcode = await import('../src/services/barcodeService.js'); transfers = await import('../src/services/transferService.js')
    const [a,b] = await Promise.all(['A','B'].map(code => db.warehouse.create({ data: { name: `Barcode ${code} ${suffix}`, code: `BC-${code}-${suffix}` } })))
    const category = await db.category.create({ data: { name: `Barcode category ${suffix}`, slug: `bc-cat-${suffix}` } }), brand = await db.brand.create({ data: { name: `Barcode brand ${suffix}`, slug: `bc-brand-${suffix}` } })
    const product = await db.product.create({ data: { name: 'Barcode unit', sku: `BC-SKU-${suffix}`, categoryId: category.id, brandId: brand.id, trackSerialNumbers: true } })
    await db.warehouseStock.create({ data: { productId: product.id, warehouseId: a.id, quantity: 2 } })
    const serials = await Promise.all([0,1].map(index => db.serialNumber.create({ data: { productId: product.id, warehouseId: a.id, serialNumber: `BC-SERIAL-${index}-${suffix}` } })))
    const foreignSerial = await db.serialNumber.create({ data: { productId: product.id, warehouseId: b.id, serialNumber: `BC-FOREIGN-${suffix}` } })
    await db.warehouseStock.create({ data: { productId: product.id, warehouseId: b.id, quantity: 1 } })
    const asset = await db.asset.create({ data: { productId: product.id, warehouseId: b.id, assetTag: `BC-AST-${suffix}` } })
    const role = await db.role.create({ data: { name: `Barcode operator ${suffix}` } }), catalogRole = await db.role.create({ data: { name: `Barcode catalog ${suffix}` } })
    for (const [module,actions] of [['inventory',['VIEW','CREATE','EDIT','APPROVE']], ['products',['VIEW']], ['assets',['VIEW']], ['warehouses',['VIEW']]]) for (const action of actions) {
      const permission = await db.permission.upsert({ where: { module_action: { module, action } }, create: { module, action }, update: {} })
      await db.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } })
      if (module === 'products') await db.rolePermission.create({ data: { roleId: catalogRole.id, permissionId: permission.id } })
    }
    const passwordHash = await bcrypt.hash('BarcodeTest123!', 4)
    const user = await db.user.create({ data: { firstName: 'Barcode', lastName: 'Operator', email: `bc-${suffix}@barcode.test`, roleId: role.id, passwordHash, warehouseAssignments: { create: { warehouseId: a.id, isDefault: true } } } })
    const catalog = await db.user.create({ data: { firstName: 'Catalog', lastName: 'Operator', email: `bc-catalog-${suffix}@barcode.test`, roleId: catalogRole.id, passwordHash } })
    const { app } = await import('../src/app.js'); server = app.listen(0,'127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); origin = `http://127.0.0.1:${server.address().port}`
    const login = await request('', '/auth/login','POST',{email:user.email,password:'BarcodeTest123!'}), catalogLogin = await request('', '/auth/login','POST',{email:catalog.email,password:'BarcodeTest123!'})
    f = { a,b,product,serials,foreignSerial,asset,token:login.data.accessToken,catalogToken:catalogLogin.data.accessToken, req:{ user:{id:user.id,role:'Administrator'},get:()=>null } }
  },30000)
  afterAll(async()=>{if(server)await new Promise(resolve=>server.close(resolve));if(db)await db.$disconnect()})
  it('generates a stable unique product barcode under competing requests',async()=>{
    const results=await Promise.all([barcode.generateProductBarcode(f.product.id,f.req),barcode.generateProductBarcode(f.product.id,f.req)])
    expect(results[0].barcode).toBe(results[1].barcode);expect(results[0].barcode).toMatch(/^PRD-\d{8}$/)
    expect(await db.product.count({where:{barcode:results[0].barcode}})).toBe(1)
    expect((await request(f.token,`/products/${f.product.id}/barcode`,'POST')).status).toBe(403)
    const lookup=await request(f.token,`/lookup?code=${results[0].barcode}`);expect(lookup.data[0]).toMatchObject({type:'product',productId:f.product.id})
  })
  it('resolves SKU, raw/typed QR identifiers while protecting warehouses, serials and assets',async()=>{
    for(const code of [f.product.sku,`TS:product:${f.product.sku}`]) expect((await request(f.token,`/lookup?code=${encodeURIComponent(code)}`)).data[0].type).toBe('product')
    expect((await request(f.token,`/lookup?code=${f.serials[0].serialNumber}`)).data[0].type).toBe('serial')
    for(const code of [f.foreignSerial.serialNumber,f.asset.assetTag,f.b.code]) expect((await request(f.token,`/lookup?code=${code}`)).data).toEqual([])
    expect((await request(f.token,`/lookup?code=${f.product.sku}&warehouse=${f.b.id}`)).status).toBe(403)
    expect((await request(f.catalogToken,`/lookup?code=${f.serials[0].serialNumber}`)).data).toEqual([])
    expect((await request(f.catalogToken,`/lookup?code=${f.product.sku}`)).data[0].type).toBe('product')
  })
  it('returns identifier-only label payloads and validates input without leaking records',async()=>{
    const label=await request(f.token,`/labels/serial/${f.serials[0].id}`);expect(label.data.qrValue).toBe(`TS:serial:${f.serials[0].serialNumber}`)
    expect(Object.keys(label.data).sort()).toEqual(['identifier','qrValue','serialNumber','sku','title','type'].sort())
    expect((await request(f.token,`/labels/serial/${f.foreignSerial.id}`)).status).toBe(404)
    expect((await request(f.token,`/labels/asset/${f.asset.id}`)).status).toBe(404)
    expect((await request(f.catalogToken,`/labels/serial/${f.serials[0].id}`)).status).toBe(403)
    expect((await request(f.token,'/lookup?code=')).status).toBe(400)
    expect((await request(f.token,`/lookup?code=TS:serial:${f.serials[0].serialNumber}&type=product`)).status).toBe(400)
    expect((await request(f.token,`/labels/invalid/${f.product.id}`)).status).toBe(400)
  })
  it('returns ambiguous identifier matches for an explicit user choice',async()=>{
    const collision=await db.product.create({data:{name:'Identifier collision',sku:f.serials[0].serialNumber,categoryId:f.product.categoryId,brandId:f.product.brandId}})
    const result=await request(f.token,`/lookup?code=${collision.sku}`);expect(result.data.map(row=>row.type).sort()).toEqual(['product','serial'])
  })
  it('ships the exact scanned serials and rejects mismatched receiving without changing stock',async()=>{
    const transfer=await transfers.createTransfer({sourceWarehouseId:f.a.id,destinationWarehouseId:f.b.id,items:[{productId:f.product.id,quantity:1}]},f.req)
    await transfers.transitionTransfer(transfer.id,'submit',f.req);await transfers.transitionTransfer(transfer.id,'approve',f.req)
    const lineId=transfer.items[0].id
    await expect(transfers.transitionTransfer(transfer.id,'ship',f.req,{items:[{id:lineId,serialNumbers:[f.foreignSerial.serialNumber]}]})).rejects.toMatchObject({status:400})
    await transfers.transitionTransfer(transfer.id,'ship',f.req,{items:[{id:lineId,serialNumbers:[f.serials[1].serialNumber]}]})
    const shipped=await transfers.getTransfer(transfer.id,f.req.user);expect(shipped.items[0].serialSelections[0].serialNumberId).toBe(f.serials[1].id)
    await expect(transfers.transitionTransfer(transfer.id,'receive',f.req,{items:[{id:lineId,serialNumbers:[f.serials[0].serialNumber]}]})).rejects.toMatchObject({status:409})
    expect((await db.warehouseStock.findUnique({where:{productId_warehouseId:{productId:f.product.id,warehouseId:f.b.id}}})).quantity).toBe(1)
    await transfers.transitionTransfer(transfer.id,'receive',f.req,{items:[{id:lineId,serialNumbers:[f.serials[1].serialNumber]}]})
    expect((await db.serialNumber.findUnique({where:{id:f.serials[1].id}})).warehouseId).toBe(f.b.id)
    await expect(transfers.transitionTransfer(transfer.id,'receive',f.req)).rejects.toMatchObject({status:409})
  })
})
