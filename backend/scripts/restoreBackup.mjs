import 'dotenv/config'
import { executeRestore } from '../src/services/backupService.js'
import { prisma } from '../src/config/prisma.js'
const [, ,flag,id,...extra]=process.argv
try{if(flag!=='--plan'||!id||extra.length)throw Error('Usage: npm run backup:restore -- --plan <confirmed-plan-id>');console.log(JSON.stringify(await executeRestore(id)))}catch(error){console.error(error.message);process.exitCode=1}finally{await prisma.$disconnect()}
