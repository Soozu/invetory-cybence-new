export async function audit(tx, req, action, module, entityType, entityId, description, scope = {}) {
  return tx.activityLog.create({ data: {
    userId: req.user?.id || null,
    action, module, entityType, entityId,
    description,
    warehouseId: scope.warehouseId || null,
    relatedWarehouseId: scope.relatedWarehouseId || null,
    ipAddress: req.ip,
    userAgent: req.get('user-agent') || null
  } })
}
