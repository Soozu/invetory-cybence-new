import { app } from './src/app.js'
import { env, validateEnvironment } from './src/config/env.js'
import { prisma } from './src/config/prisma.js'
import { startJobs } from './src/services/jobService.js'

validateEnvironment()
const server = app.listen(env.port, () => console.log(`TechStock API listening on http://localhost:${env.port}`))
const stopJobs = startJobs()
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
  server.close()
  stopJobs()
  await prisma.$disconnect()
  process.exit(0)
})
