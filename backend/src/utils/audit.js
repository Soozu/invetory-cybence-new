import { safeAuditChanges } from './auditChanges.js'
export async function audit(tx, req, action, module, entityType, entityId, description, scope = {}) {
  const changes=safeAuditChanges(entityType,scope.before,scope.after)
  return tx.activityLog.create({ data: {
    userId: req.user?.id || null,
    action, module, entityType, entityId,
    description,
    ...(changes===null?{}:{changes}),
    warehouseId: scope.warehouseId || null,
    relatedWarehouseId: scope.relatedWarehouseId || null,
    ipAddress: req.ip,
    userAgent: req.get('user-agent') || null
  } })
}
