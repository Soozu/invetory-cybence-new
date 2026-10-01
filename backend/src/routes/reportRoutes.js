import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import { get } from '../controllers/reportController.js'
import { accessibleReports } from '../services/reportCatalog.js'
import { enhancedReport } from '../services/enhancedReportService.js'
import { savedReports,saveReport,archiveReport } from '../services/savedReportService.js'
import { ok } from '../utils/http.js'

export const reportRoutes = Router()
reportRoutes.use(authenticate, authorize('reports', 'VIEW'))
reportRoutes.get('/catalog', (req,res)=>ok(res,accessibleReports(req.user)))
reportRoutes.get('/data/:kind',async(req,res)=>res.json({success:true,...await enhancedReport(req.params.kind,req.query,req.user)}))
reportRoutes.get('/export/:kind',authorize('reports','EXPORT'),async(req,res)=>{res.set('Cache-Control','private, no-store');res.json({success:true,...await enhancedReport(req.params.kind,req.query,req.user)})})
reportRoutes.get('/saved',async(req,res)=>ok(res,await savedReports(req.user)))
reportRoutes.post('/saved',async(req,res)=>ok(res,await saveReport(null,req.body,req.user),'Report configuration saved.',201))
reportRoutes.put('/saved/:id',async(req,res)=>ok(res,await saveReport(req.params.id,req.body,req.user),'Report configuration saved.'))
reportRoutes.post('/saved/:id/archive',async(req,res)=>ok(res,await archiveReport(req.params.id,req.body,req.user),'Report configuration archived.'))
for (const kind of ['inventory-summary', 'stock-movement', 'low-stock', 'out-of-stock', 'inventory-valuation', 'warehouse-stock', 'supplier-purchases', 'assets', 'warranties']) {
  reportRoutes.get(`/${kind}`, (req, res, next) => { req.params.kind = kind; next() }, get)
}
