import fs from 'node:fs/promises'
import { prisma } from '../config/prisma.js'
import { env } from '../config/env.js'
import { storageStatus } from './storageService.js'
import { backupConfiguration } from './backupService.js'
export async function systemHealth(){
  let database='connected';try{await prisma.$queryRaw`SELECT 1`}catch{database='unavailable'}
  const packageInfo=JSON.parse(await fs.readFile(new URL('../../package.json',import.meta.url),'utf8').catch(()=>'{"version":"unknown"}'))
  const [storage,backups,jobs,lastBackup]=await Promise.all([storageStatus(),backupConfiguration(),prisma.jobLease.findMany({where:{name:{not:'backup-request'}},select:{name:true,leaseUntil:true,lastRunAt:true,lastSuccessAt:true,lastError:true}}).catch(()=>[]),prisma.backupRun.findFirst({orderBy:{startedAt:'desc'},select:{id:true,status:true,databaseStatus:true,uploadsStatus:true,startedAt:true,completedAt:true}}).catch(()=>null)])
  return {api:'available',database,uptimeSeconds:Math.floor(process.uptime()),nodeVersion:process.version,appVersion:packageInfo.version,environment:env.nodeEnv,storage,backups,lastBackup,workerEnabled:process.env.JOBS_ENABLED!=='false',jobs:jobs.map(job=>({...job,running:job.leaseUntil>new Date()}))}
}
