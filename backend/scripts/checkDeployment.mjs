import { validateEnvironment,env } from '../src/config/env.js'
import { prisma } from '../src/config/prisma.js'
import { storageStatus } from '../src/services/storageService.js'
import { backupConfiguration } from '../src/services/backupService.js'
try{
  validateEnvironment();await prisma.$queryRaw`SELECT 1`
  const migrations=await prisma.$queryRaw`SELECT migration_name,finished_at,rolled_back_at FROM _prisma_migrations ORDER BY started_at`
  if(migrations.some(row=>!row.finished_at&&!row.rolled_back_at))throw Error('Unfinished database migration exists.')
  const storage=await storageStatus(),backup=await backupConfiguration()
  if(storage.status==='unavailable')throw Error('Upload storage is unavailable.')
  if(Number(process.env.BACKUP_INTERVAL_MINUTES||0)>0&&!backup.configured)throw Error('Scheduled backups require configured MySQL tools and storage.')
  console.log(JSON.stringify({configuration:'valid',environment:env.nodeEnv,database:'connected',successfulMigrations:migrations.filter(r=>r.finished_at&&!r.rolled_back_at).length,storage,backup,workerEnabled:process.env.JOBS_ENABLED!=='false'}))
}catch(error){console.error(error.message);process.exitCode=1}finally{await prisma.$disconnect()}
