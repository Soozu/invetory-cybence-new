import { prisma } from '../config/prisma.js'

export async function ensureWarrantyNotifications(user) {
  if (user.role !== 'Administrator' && !user.permissions.includes('assets.VIEW')) return
  const setting = await prisma.systemSetting.findUnique({ where: { key: 'warrantyNotifications' } })
  if (setting?.value === 'false') return
  const now = new Date()
  const soon = new Date(now.getTime() + 30 * 86_400_000)
  const serials = await prisma.serialNumber.findMany({
    where: { warrantyEnd: { gte: now, lte: soon }, status: { not: 'DISPOSED' } },
    include: { product: { select: { name: true } } }
  })
  for (const serial of serials) {
    const dedupeKey = `warranty:${user.id}:${serial.id}`
    await prisma.notification.upsert({ where: { dedupeKey }, update: {}, create: {
      dedupeKey, userId: user.id, type: 'WARRANTY_EXPIRING', title: 'Warranty expiring soon',
      message: `${serial.product.name} (${serial.serialNumber}) warranty ends on ${serial.warrantyEnd.toISOString().slice(0, 10)}.`,
      referenceType: 'SerialNumber', referenceId: serial.id
    } })
  }
}
