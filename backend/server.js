import { app } from './src/app.js'
import { env, validateEnvironment } from './src/config/env.js'
import { prisma } from './src/config/prisma.js'
import { startJobs } from './src/services/jobService.js'
import { logEvent } from './src/middleware/requestLogging.js'

validateEnvironment()
const server = app.listen(env.port, () => logEvent('info','server_started',{port:env.port,environment:env.nodeEnv}))
const stopJobs = startJobs()
let stopping=false
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
  if(stopping)return;stopping=true
  logEvent('info','server_stopping',{signal})
  const deadline=setTimeout(()=>process.exit(1),30000);deadline.unref()
  await Promise.all([new Promise(resolve=>server.close(resolve)),stopJobs()])
  await prisma.$disconnect();clearTimeout(deadline);process.exit(0)
})
