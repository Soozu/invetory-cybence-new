import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { seedAdministrator } from './seedAdministrator.js'

const prisma = new PrismaClient()
try {
  const admin = await seedAdministrator(prisma)
  console.log(`Administrator ready: ${admin.email}. No sample inventory or additional users were created.`)
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
