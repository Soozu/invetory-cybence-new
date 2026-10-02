import * as auth from '../validators/auth.js'
import * as catalog from '../validators/catalog.js'
import * as inventory from '../validators/inventory.js'
import * as procurement from '../validators/procurement.js'
import * as transfers from '../validators/transfers.js'
import * as assets from '../validators/assets.js'
import * as reports from '../validators/reporting.js'
import { sessionPublicIpSchema } from '../validators/session.js'
import { reportCatalog } from './reportCatalog.js'
import { retentionSchema } from './retentionService.js'

// Describe the existing Zod boundary without introducing a second validation stack.
export function describeSchema(schema){
  const d=schema?._def;if(!d)return {}
  switch(d.typeName){
    case 'ZodEffects':return {...describeSchema(d.schema),description:'Additional business refinements apply; validation errors identify the field.'}
    case 'ZodOptional':return describeSchema(d.innerType)
    case 'ZodNullable':return {anyOf:[describeSchema(d.innerType),{type:'null'}]}
    case 'ZodDefault':return {...describeSchema(d.innerType),default:d.defaultValue()}
    case 'ZodObject':{const shape=d.shape(),required=Object.entries(shape).filter(([,v])=>!v.isOptional()).map(([k])=>k);return {type:'object',properties:Object.fromEntries(Object.entries(shape).map(([k,v])=>[k,describeSchema(v)])),...(required.length?{required}:{}),additionalProperties:d.unknownKeys==='passthrough'}}
    case 'ZodString':{const value={type:'string'};for(const check of d.checks||[]){if(check.kind==='min')value.minLength=check.value;if(check.kind==='max')value.maxLength=check.value;if(['email','uuid','datetime','url'].includes(check.kind))value.format={datetime:'date-time',url:'uri'}[check.kind]||check.kind}return value}
    case 'ZodNumber':{const value={type:d.checks?.some(c=>c.kind==='int')?'integer':'number'};for(const c of d.checks||[]){if(c.kind==='min')value.minimum=c.value;if(c.kind==='max')value.maximum=c.value}return value}
    case 'ZodBoolean':return {type:'boolean'}
    case 'ZodEnum':return {type:'string',enum:d.values}
    case 'ZodLiteral':return {const:d.value}
    case 'ZodArray':return {type:'array',items:describeSchema(d.type),...(d.minLength?{minItems:d.minLength.value}:{}),...(d.maxLength?{maxItems:d.maxLength.value}:{})}
    case 'ZodUnion':return {anyOf:d.options.map(describeSchema)}
    case 'ZodRecord':return {type:'object',additionalProperties:describeSchema(d.valueType)}
    default:return {}
  }
}
export function openApi(){
  const paths={},schemas={Success:{type:'object',required:['success','data'],properties:{success:{const:true},message:{type:'string'},data:{},pagination:{$ref:'#/components/schemas/Pagination'}}},Error:{type:'object',required:['success','message','errors'],properties:{success:{const:false},message:{type:'string'},errors:{type:'array',items:{type:'object',properties:{field:{type:'string'},message:{type:'string'}}}}}},Pagination:{type:'object',properties:{page:{type:'integer',minimum:1},limit:{type:'integer',minimum:1,maximum:100},total:{type:'integer'},totalPages:{type:'integer'}}}}
  const bodySchemas={...auth,...catalog,...inventory,...procurement,...transfers,...assets,...reports,retentionSchema,sessionPublicIpSchema}
  for(const [name,value]of Object.entries(bodySchemas))if(value?._def)schemas[name]=describeSchema(value)
  const pagination=['page','limit','search','sortBy','sortOrder'].map(name=>({name,in:'query',required:false,schema:name==='page'||name==='limit'?{type:'integer',minimum:1,...(name==='limit'?{maximum:100}:{})}:{type:'string'},description:name==='sortBy'?'Allowed sort fields depend on the resource.':name==='sortOrder'?'asc or desc.':undefined}))
  function add(path,method,tag,summary,{permission,body,paged=false,publicRoute=false,admin=false,description,parameters=[],created=false}={}){
    const paging=paged?pagination.filter(p=>path.startsWith('/sessions')||path.startsWith('/report-schedules')||path==='/system/backups'?p.name==='page':path.startsWith('/reports/')?p.name!=='search':true):[]
    const params=[...Array.from(path.matchAll(/\{(\w+)\}/g),m=>({name:m[1],in:'path',required:true,schema:{type:'string'}})),...paging,...parameters]
    const operation={tags:[tag],summary,operationId:method+'_'+path.replace(/[^a-zA-Z0-9]+/g,'_'),description:description||'Current module permissions, document state and warehouse access are checked by the backend. Decimal monetary values are serialized as exact strings.',security:publicRoute?[]:[{BearerAuth:[]}],...(params.length?{parameters:params}:{}),responses:{[created?'201':'200']:{description:'Success',content:{'application/json':{schema:{$ref:'#/components/schemas/Success'}}}},...Object.fromEntries([400,401,403,404,409,429,500,503].map(code=>[code,{description:{400:'Validation failed',401:'Authentication required or session expired',403:'Permission or warehouse access denied',404:'Record unavailable',409:'State, revision or concurrent update conflict',429:'Rate limit reached',500:'Internal error',503:'Dependency unavailable'}[code],content:{'application/json':{schema:{$ref:'#/components/schemas/Error'}}}}]))}}
    if(permission)operation['x-permissions']=permission
    if(admin)operation['x-administrator-only']=true
    if(body)operation.requestBody={required:true,content:{'application/json':{schema:typeof body==='string'?{$ref:'#/components/schemas/'+body}:body}}}
    paths[path]={...paths[path],[method]:operation};return operation
  }
  const health=add('/health','get','Monitoring','Public database readiness',{publicRoute:true,description:'Returns status/database; HTTP 503 when MySQL is unavailable. No private topology or secrets.'})
  const healthResponse={
    description:'Database readiness',
    content:{'application/json':{schema:{type:'object',required:['success','status','database'],properties:{success:{type:'boolean'},status:{enum:['healthy','degraded']},database:{enum:['connected','unavailable']}}}}}
  }
  health.responses['200']=healthResponse;health.responses['503']=healthResponse
  add('/auth/login','post','Authentication','Sign in',{publicRoute:true,body:'loginSchema',description:'Five failed attempts lock the account for 15 minutes. Returns a memory-only access token and an HTTP-only refresh cookie. The error does not identify account existence.'})
  add('/auth/refresh','post','Authentication','Atomically rotate refresh cookie',{publicRoute:true,description:'Send techstock_refresh cookie. Rotates its hash within the same session. Replayed, revoked and expired cookies return 401. Legacy valid cookies convert once.'}).security=[{RefreshCookie:[]}]
  add('/auth/logout','post','Authentication','Revoke cookie session',{publicRoute:true})
  add('/auth/me','get','Authentication','Current authenticated account')
  add('/auth/change-password','post','Authentication','Change password and revoke all sessions',{body:'changePasswordSchema'})
  for(const [resource,tag,schema]of [['products','Catalog','productSchema'],['categories','Catalog','categorySchema'],['brands','Catalog','brandSchema'],['suppliers','Procurement','supplierSchema'],['warehouses','Warehouses','warehouseSchema']]){
    add('/'+resource,'get',tag,'List '+resource,{permission:resource+'.VIEW',paged:true})
    add('/'+resource+'/{id}','get',tag,'Get '+resource+' record',{permission:resource+'.VIEW'})
    add('/'+resource,'post',tag,'Create '+resource,{permission:resource+'.CREATE',body:schema,created:true})
    add('/'+resource+'/{id}','put',tag,'Update '+resource,{permission:resource+'.EDIT',body:resource==='products'?'productUpdateSchema':describeSchema(catalog[schema].partial())})
    add('/'+resource+'/{id}','delete',tag,'Delete unused '+resource+' record',{permission:resource+'.DELETE',description:'Historical references prevent deletion. Products with history must be archived.'})
  }
  for(const resource of ['stocks','movements'])add('/inventory/'+resource,'get','Inventory','List scoped '+resource,{permission:'inventory.VIEW',paged:true})
  add('/inventory/adjust','post','Inventory','Record transactional stock adjustment',{permission:'inventory.EDIT',body:'adjustmentSchema',description:'CORRECTION quantity is the target physical count; other quantities are positive deltas interpreted by type. Exact serials required for serialized units. Holds and source ownership are enforced.'})
  add('/serial-numbers','get','Inventory','List serials',{permission:'inventory.VIEW',paged:true})
  add('/serial-numbers/{id}','get','Inventory','Serial provenance and current state',{permission:'inventory.VIEW'})
  add('/serial-numbers/{id}/events','get','Inventory','Serial event history',{permission:'inventory.VIEW',paged:true})
  for(const resource of ['purchase-orders','transfers','assets']){
    const tag={assets:'Assets',transfers:'Transfers','purchase-orders':'Procurement'}[resource],module={assets:'assets',transfers:'inventory','purchase-orders':'purchasing'}[resource],schema={assets:'assetSchema',transfers:'transferSchema','purchase-orders':'purchaseOrderSchema'}[resource]
    add('/'+resource,'get',tag,'List '+resource,{permission:module+'.VIEW',paged:true});add('/'+resource+'/{id}','get',tag,'Get '+resource,{permission:module+'.VIEW'});add('/'+resource,'post',tag,'Create '+resource,{permission:module+'.CREATE',body:schema,created:true});add('/'+resource+'/{id}','put',tag,'Update '+resource,{permission:module+'.EDIT',body:resource==='assets'?'assetUpdateSchema':schema})
  }
  for(const action of ['submit','approve','cancel'])add('/purchase-orders/{id}/'+action,'post','Procurement',action+' purchase order',{permission:'purchasing.'+(action==='approve'?'APPROVE':action==='submit'?'CREATE':'EDIT')})
  add('/purchase-orders/{id}/receive','post','Procurement','Receive exact purchase units',{permission:'purchasing.EDIT',body:'receivingSchema'})
  for(const action of ['submit','approve','ship','receive','cancel'])add('/transfers/{id}/'+action,'post','Transfers',action+' transfer',{permission:'inventory.'+(action==='approve'?'APPROVE':'EDIT'),...(action==='ship'||action==='receive'?{body:'transferScanSchema'}:{})})
  add('/transfers/{id}/arrivals','post','Transfers','Record partial or final arrival',{permission:'inventory.EDIT',body:'transferArrivalSchema'})
  for(const action of ['investigate','resolve'])add('/transfers/{id}/discrepancies/{discrepancyId}/'+action,'post','Transfers',action+' recorded discrepancy',{permission:'inventory.'+(action==='resolve'?'APPROVE':'EDIT'),body:'transferResolutionSchema'})
  for(const action of ['assign','handover','return','inspect','retire','dispose'])add('/assets/{id}/'+action,'post','Assets',action+' asset',{permission:'assets.'+(action==='dispose'?'DELETE':'EDIT'),body:{assign:'assignmentSchema',handover:'handoverSchema',return:'returnSchema',inspect:'actionSchema',retire:'actionSchema',dispose:'actionSchema'}[action]})
  add('/maintenance','get','Assets','List maintenance history',{permission:'assets.VIEW',paged:true});add('/maintenance','post','Assets','Schedule maintenance',{permission:'assets.CREATE',body:'maintenanceSchema',created:true})
  for(const path of ['/receipts','/receipts/{id}'])add(path,'get','Procurement','Read actual purchase receipts',{permission:'purchasing.VIEW',paged:path==='/receipts'})
  add('/reports/catalog','get','Reports','Available report types, source grants, filters and columns',{permission:'reports.VIEW'})
  for(const type of ['data','export']){
    const op=add('/reports/'+type+'/{kind}','get','Reports',type==='data'?'Generate a real report page':'Fetch one page for Excel/PDF export',{permission:type==='export'?['reports.VIEW','reports.EXPORT','native source VIEW']:['reports.VIEW','native source VIEW'],paged:true,parameters:['warehouse','category','brand','supplier','dateFrom','dateTo','columns'].map(name=>({name,in:'query',schema:{type:'string'},description:'Only filters declared for the selected report type are accepted.'})),description:'Reports use a flattened envelope: success, data, columns, pagination, basis, generatedAt, filters, sortBy, sortOrder, canExport. Current valuation; recorded movement-based aging. Export is one page, not all records.'})
    op.parameters.find(p=>p.name==='kind').schema.enum=Object.keys(reportCatalog)
    op.responses['200'].content['application/json'].schema={type:'object',properties:{success:{const:true},data:{type:'array',items:{type:'object'}},columns:{type:'array',items:{type:'object'}},pagination:{$ref:'#/components/schemas/Pagination'},basis:{type:'string'},generatedAt:{type:'string',format:'date-time'}}}
  }
  add('/reports/saved','get','Reports','Own saved configurations',{permission:'reports.VIEW'});add('/reports/saved','post','Reports','Save configuration',{body:'savedReportSchema',permission:'reports.VIEW',created:true});add('/reports/saved/{id}','put','Reports','Update owned configuration with revision',{body:'savedReportSchema',permission:'reports.VIEW'})
  add('/sessions','get','Sessions','Own active session metadata',{paged:true});add('/sessions/{id}/revoke','post','Sessions','Revoke owned session immediately',{body:{type:'object',additionalProperties:false}});add('/sessions/others/revoke','post','Sessions','Keep current session; revoke others',{body:{type:'object',additionalProperties:false}})
  add('/sessions/current/public-ip','put','Sessions','Report browser public IP for the current session',{body:'sessionPublicIpSchema',description:'Optional, unverified browser-reported public IPv4/IPv6 metadata with a server timestamp. sessionId must match the authenticated session. Does not change the server-observed ipAddress, audit IP, proxy trust, authorization or rate limiting.'})
  add('/sessions/users/{userId}','get','Sessions','Administrator account sessions',{admin:true,paged:true});add('/sessions/users/{userId}/revoke','post','Sessions','Administrator revoke all',{admin:true,body:{type:'object',required:['confirmation'],properties:{confirmation:{const:'REVOKE ALL SESSIONS'}},additionalProperties:false}});add('/sessions/users/{userId}/unlock','post','Sessions','Clear temporary lockout',{admin:true,body:{type:'object',additionalProperties:false}})
  for(const resource of ['health','backups','restores','retention'])add('/system/'+resource,'get','Operations','Administrator '+resource,{admin:true,paged:resource==='backups'})
  add('/system/backups','post','Operations','Queue database and upload backup',{admin:true,body:{type:'object',required:['confirmation'],properties:{confirmation:{const:'CREATE BACKUP'}},additionalProperties:false}}).responses['202']={description:'Backup queued; poll registry for separate database/upload completion.'}
  for(const action of ['verify','restore-plan'])add('/system/backups/{id}/'+action,'post','Operations',action+' backup',{admin:true,body:action==='verify'?{type:'object',additionalProperties:false}:{type:'object',required:['targetSchema'],properties:{targetSchema:{type:'string',pattern:'^techstock_restore_[a-z0-9_]{1,46}$'}},additionalProperties:false}})
  add('/system/restores/{id}/confirm','post','Operations','Confirm offline new-schema restore',{admin:true,body:{type:'object',required:['confirmation'],properties:{confirmation:{type:'string',maxLength:200}},additionalProperties:false},description:'Exact phrase from restore-plan response; expires after 30 minutes. This returns an offline CLI command, never runs a restore over HTTP.'})
  add('/system/retention','put','Operations','Save versioned retention policy',{admin:true,body:'retentionSchema'})
  add('/system/retention/archive','post','Operations','Archive using saved revision',{admin:true,body:{type:'object',required:['expectedRevision','confirmation'],properties:{expectedRevision:{type:'integer'},confirmation:{const:'ARCHIVE HISTORY'}},additionalProperties:false}})
  add('/report-schedules','get','Reports','Own saved report schedules');add('/report-schedules','post','Reports','Schedule a 100-row report snapshot',{created:true,body:{type:'object',required:['savedReportId','intervalDays'],properties:{savedReportId:{type:'string'},intervalDays:{type:'integer',minimum:1,maximum:365}},additionalProperties:false}})
  add('/report-schedules/{id}','put','Reports','Enable/disable or reschedule',{body:{type:'object',required:['expectedRevision','intervalDays','enabled'],properties:{expectedRevision:{type:'integer',minimum:1},intervalDays:{type:'integer',minimum:1,maximum:365},enabled:{type:'boolean'}},additionalProperties:false}})
  add('/report-schedules/{id}/runs','get','Reports','Own run metadata',{paged:true});add('/report-schedules/runs/{id}','get','Reports','Read generated snapshot after current source/scope authorization')
  add('/docs','get','Operations','Protected OpenAPI specification',{admin:true})
  add('/docs/openapi.json','get','Operations','Raw protected OpenAPI JSON',{admin:true}).responses['200']={description:'OpenAPI 3.1 document',content:{'application/json':{schema:{type:'object',required:['openapi','info','paths']}}}}
  delete paths['/system/backups'].post.responses['200']
  paths['/system/backups/{id}/restore-plan'].post.responses['201']=paths['/system/backups/{id}/restore-plan'].post.responses['200'];delete paths['/system/backups/{id}/restore-plan'].post.responses['200']
  return {openapi:'3.1.0',info:{title:'TechStock Inventory API',version:'0.2.0',description:'Implemented core API contracts. Monetary values are exact decimal strings. Bearer access tokens are held in memory; refresh tokens rotate through an HTTP-only cookie. Module and warehouse authorization is authoritative on every request. Additional advanced workflow contracts are documented in the repository feature docs.'},servers:[{url:'/api'}],security:[{BearerAuth:[]}],paths,components:{securitySchemes:{BearerAuth:{type:'http',scheme:'bearer',bearerFormat:'JWT'},RefreshCookie:{type:'apiKey',in:'cookie',name:'techstock_refresh'}},schemas},'x-report-catalog':reportCatalog}
}
