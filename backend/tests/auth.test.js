import bcrypt from 'bcrypt'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocked = vi.hoisted(() => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    session: { create: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn()
  }
}))
vi.mock('../src/config/prisma.js', () => ({ prisma: mocked.prisma }))
vi.mock('../src/config/env.js', () => ({ env: {
  accessSecret: 'test_access_secret_longer_than_32_characters',
  refreshSecret: 'test_refresh_secret_longer_than_32_characters',
  accessExpires: '15m', refreshExpires: '7d', cookieSecure: false
} }))

import { login } from '../src/services/authService.js'
import { authorize } from '../src/middleware/auth.js'

describe('authentication and permissions', () => {
  beforeEach(() => { vi.clearAllMocks(); mocked.prisma.$transaction.mockImplementation(fn=>fn(mocked.prisma)) })

  it('issues a token and HTTP-only refresh cookie for a correct password', async () => {
    mocked.prisma.user.findUnique.mockResolvedValue({
      id: 'user-1', firstName: 'Test', lastName: 'Admin', email: 'test@example.com',
      passwordHash: await bcrypt.hash('correct-password', 4), status: 'ACTIVE',
      authVersion:0, failedLoginCount:0,
      roleId: 'role-1', role: { name: 'Administrator', permissions: [] }
    })
    mocked.prisma.user.update.mockResolvedValue({})
    mocked.prisma.session.create.mockResolvedValue({})
    const res = { cookie: vi.fn() }
    const session = await login({ email: 'TEST@example.com', password: 'correct-password', remember: false }, res)
    expect(session.accessToken).toBeTypeOf('string')
    expect(session.user.email).toBe('test@example.com')
    expect(session.user).not.toHaveProperty('passwordHash')
    expect(res.cookie).toHaveBeenCalledWith('techstock_refresh', expect.any(String), expect.objectContaining({ httpOnly: true, path: '/api/auth' }))
    expect(res.cookie.mock.calls[0][2]).not.toHaveProperty('expires')
  })

  it('rejects an invalid password without creating a refresh token', async () => {
    mocked.prisma.user.findUnique.mockResolvedValue({
      id: 'user-1', passwordHash: await bcrypt.hash('correct-password', 4), status: 'ACTIVE', failedLoginCount:0
    })
    await expect(login({ email: 'test@example.com', password: 'wrong-password' }, { cookie: vi.fn() })).rejects.toMatchObject({ status: 401 })
    expect(mocked.prisma.session.create).not.toHaveBeenCalled()
  })

  it('rejects a role without permission and allows an administrator', () => {
    const next = vi.fn()
    expect(() => authorize('products', 'CREATE')({ user: { role: 'Viewer', permissions: ['products.VIEW'] } }, {}, next)).toThrow('permission')
    authorize('products', 'CREATE')({ user: { role: 'Administrator', permissions: [] } }, {}, next)
    expect(next).toHaveBeenCalledOnce()
  })
})
