import { Router } from 'express'
import { z } from 'zod'
import { authenticate } from '../middleware/auth.js'
import { requireAdmin } from '../services/sessionService.js'
import { ok } from '../utils/http.js'
import { systemHealth } from '../services/systemHealthService.js'
import * as backups from '../services/backupService.js'
import * as retention from '../services/retentionService.js'
export const systemRoutes=Router()
systemRoutes.use(authenticate,(req,res,next)=>{requireAdmin(req.user);res.set('Cache-Control','private, no-store');next()})
systemRoutes.get('/health',async(req,res)=>ok(res,await systemHealth()))
systemRoutes.get('/backups',async(req,res)=>{const {page}=z.object({page:z.coerce.number().int().min(1).max(100000).default(1)}).strict().parse(req.query);const r=await backups.listBackups(page);ok(res,r.data,'OK',200,{pagination:r.pagination,configuration:r.configuration})})
systemRoutes.post('/backups',async(req,res)=>{z.object({confirmation:z.literal('CREATE BACKUP')}).strict().parse(req.body);ok(res,await backups.requestBackup(req),'Backup queued.',202)})
systemRoutes.post('/backups/:id/verify',async(req,res)=>{z.object({}).strict().parse(req.body);const {row,manifest}=await backups.verifyBackup(req.params.id);ok(res,{id:row.id,verified:true,fileCount:manifest.files.length,manifestHash:row.manifestHash})})
systemRoutes.post('/backups/:id/restore-plan',async(req,res)=>{const {targetSchema}=z.object({targetSchema:z.string().max(64).refine(backups.restoreTarget,'Use a new techstock_restore_ schema name.')}).strict().parse(req.body);ok(res,await backups.planRestore(req.params.id,targetSchema,req),'Restore plan created.',201)})
systemRoutes.post('/restores/:id/confirm',async(req,res)=>{const {confirmation}=z.object({confirmation:z.string().max(200)}).strict().parse(req.body);ok(res,await backups.confirmRestore(req.params.id,confirmation,req))})
systemRoutes.get('/restores',async(req,res)=>{const {prisma}=await import('../config/prisma.js');ok(res,await prisma.restorePlan.findMany({orderBy:{createdAt:'desc'},take:20}))})
systemRoutes.get('/retention',async(req,res)=>ok(res,await retention.archivePreview()))
systemRoutes.put('/retention',async(req,res)=>ok(res,await retention.updateRetention(req.body,req)))
systemRoutes.post('/retention/archive',async(req,res)=>ok(res,await retention.archiveHistory(req,req.body)))
systemRoutes.post('/archive/:type/:id/restore',async(req,res)=>{z.object({}).strict().parse(req.body);ok(res,await retention.restoreHistory(req.params.type,req.params.id,req))})
