import bcrypt from 'bcrypt'
import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { prisma } from '../config/prisma.js'
import { env } from '../config/env.js'
import { HttpError } from '../utils/http.js'
import { publicUser } from '../middleware/auth.js'

const userInclude = { role: { include: { permissions: { include: { permission: true } } } } }
const refreshHash = token => crypto.createHash('sha256').update(token).digest('hex')
const refreshCookie = { httpOnly: true, secure: env.cookieSecure, sameSite: 'lax', path: '/api/auth' }

export async function issueSession(user, res, remember = false) {
  const accessToken = jwt.sign({ sub: user.id }, env.accessSecret, { expiresIn: env.accessExpires, algorithm: 'HS256' })
  const refreshToken = jwt.sign({ sub: user.id, jti: crypto.randomUUID(), remember }, env.refreshSecret, { expiresIn: env.refreshExpires, algorithm: 'HS256' })
  const expiry = new Date(jwt.decode(refreshToken).exp * 1000)
  await prisma.refreshToken.create({ data: { userId: user.id, tokenHash: refreshHash(refreshToken), expiresAt: expiry } })
  res.cookie('techstock_refresh', refreshToken, { ...refreshCookie, ...(remember ? { expires: expiry } : {}) })
  return { accessToken, user: publicUser(user) }
}

export async function login({ email, password, remember }, res) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() }, include: userInclude })
  if (!user || user.status !== 'ACTIVE' || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new HttpError(401, 'Invalid email or password.')
  }
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
  return issueSession(user, res, remember)
}

export async function refresh(req, res) {
  const token = req.cookies?.techstock_refresh
  if (!token) throw new HttpError(401, 'Session expired. Please sign in again.')
  let payload
  try { payload = jwt.verify(token, env.refreshSecret, { algorithms: ['HS256'] }) }
  catch { throw new HttpError(401, 'Session expired. Please sign in again.') }
  const old = await prisma.refreshToken.findUnique({ where: { tokenHash: refreshHash(token) } })
  if (!old || old.revokedAt || old.expiresAt < new Date() || old.userId !== payload.sub) throw new HttpError(401, 'Session expired. Please sign in again.')
  const user = await prisma.user.findUnique({ where: { id: payload.sub }, include: userInclude })
  if (!user || user.status !== 'ACTIVE') throw new HttpError(401, 'Account is inactive or unavailable.')
  await prisma.refreshToken.update({ where: { id: old.id }, data: { revokedAt: new Date() } })
  return issueSession(user, res, Boolean(payload.remember))
}

export async function logout(req, res) {
  const token = req.cookies?.techstock_refresh
  if (token) await prisma.refreshToken.updateMany({ where: { tokenHash: refreshHash(token), revokedAt: null }, data: { revokedAt: new Date() } })
  res.clearCookie('techstock_refresh', refreshCookie)
}

export async function changePassword(userId, currentPassword, newPassword, res) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) throw new HttpError(400, 'Current password is incorrect.')
  const passwordHash = await bcrypt.hash(newPassword, 12)
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })
  ])
  res.clearCookie('techstock_refresh', refreshCookie)
}
