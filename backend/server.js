import { app } from './src/app.js'
import { env, validateEnvironment } from './src/config/env.js'
import { prisma } from './src/config/prisma.js'

validateEnvironment()
const server = app.listen(env.port, () => console.log(`TechStock API listening on http://localhost:${env.port}`))
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
  server.close()
  await prisma.$disconnect()
  process.exit(0)
})
