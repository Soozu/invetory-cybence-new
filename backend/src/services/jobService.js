import crypto from 'node:crypto'
import { prisma } from '../config/prisma.js'
import { expireReservations } from './reservationService.js'
import { reminderJob,stockNotificationJob } from './stockNotificationJob.js'
import { runReportSchedules } from './reportScheduleService.js'
import { cleanupSessions,runRetention } from './retentionService.js'
import { processBackup,requestBackup } from './backupService.js'
import { logEvent } from '../middleware/requestLogging.js'

export const jobStatus=new Map()
export async function withJobLease(name,work){
  const owner=crypto.randomUUID()
  try{await prisma.jobLease.upsert({where:{name},create:{name},update:{}})}catch(error){if(error.code!=='P2002')throw error}
  const claimed=await prisma.$executeRaw`UPDATE JobLease SET owner=${owner},leaseUntil=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 120 SECOND),lastRunAt=UTC_TIMESTAMP(3) WHERE name=${name} AND (leaseUntil IS NULL OR leaseUntil<=UTC_TIMESTAMP(3))`
  if(claimed!==1)return {skipped:true}
  let lost=false,beating=false
  const heartbeat=setInterval(async()=>{if(beating)return;beating=true;try{const count=await prisma.$executeRaw`UPDATE JobLease SET leaseUntil=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 120 SECOND) WHERE name=${name} AND owner=${owner} AND leaseUntil>UTC_TIMESTAMP(3)`;if(count!==1)lost=true}catch{lost=true}finally{beating=false}},30000);heartbeat.unref()
  try{
    const result=await work()
    if(lost)throw Error('Worker lease lost')
    await prisma.jobLease.updateMany({where:{name,owner},data:{lastSuccessAt:new Date(),lastError:null}})
    return {skipped:false,result}
  }catch(error){await prisma.jobLease.updateMany({where:{name,owner},data:{lastError:'Job failed. Check host configuration and operational logs.'}});logEvent('error','job_failed',{job:name,code:typeof error.code==='string'?error.code:null});throw error}
  finally{clearInterval(heartbeat);await prisma.jobLease.updateMany({where:{name,owner},data:{owner:null,leaseUntil:null}})}
}
const minute=60000
export function definitions(){
  const rows=[{name:'reservation-expiry',intervalMs:minute,run:expireReservations},{name:'reminders',intervalMs:15*minute,run:reminderJob},{name:'stock-alerts',intervalMs:60*minute,run:stockNotificationJob},{name:'report-schedules',intervalMs:minute,run:runReportSchedules},{name:'session-cleanup',intervalMs:60*minute,run:cleanupSessions},{name:'history-archive',intervalMs:60*minute,run:runRetention},{name:'backup',intervalMs:minute,run:processBackup}]
  const minutes=Number(process.env.BACKUP_INTERVAL_MINUTES||0)
  if(Number.isInteger(minutes)&&minutes>=60)rows.push({name:'backup-schedule',intervalMs:Math.min(minutes*minute,2147483647),run:async()=>{
    const last=await prisma.backupRun.findFirst({orderBy:{startedAt:'desc'},select:{startedAt:true}})
    if(last&&Date.now()-last.startedAt.getTime()<minutes*minute)return
    try{await requestBackup()}catch(error){if(error.status!==409)throw error}
  }})
  return rows
}
export async function runJob(name){const job=definitions().find(row=>row.name===name);if(!job)throw Error('Unknown job.');return withJobLease(name,job.run)}
export function startJobs(){
  if(process.env.JOBS_ENABLED==='false')return async()=>{}
  const active=new Set();let stopped=false
  const timers=definitions().map(job=>{
    const state={running:false,lastRunAt:null,lastSuccessAt:null,lastError:null};jobStatus.set(job.name,state)
    const run=()=>{if(stopped||state.running)return;state.running=true;state.lastRunAt=new Date()
      const task=withJobLease(job.name,job.run).then(r=>{if(!r.skipped){state.lastSuccessAt=new Date();state.lastError=null}}).catch(()=>{state.lastError='Job failed. Check operational logs.'}).finally(()=>{state.running=false;active.delete(task)});active.add(task)
    }
    run();const timer=setInterval(run,job.intervalMs);timer.unref();return timer
  })
  return async()=>{stopped=true;timers.forEach(clearInterval);await Promise.allSettled([...active])}
}
