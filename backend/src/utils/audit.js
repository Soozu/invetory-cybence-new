export async function audit(tx, req, action, module, entityType, entityId, description) {
  return tx.activityLog.create({ data: {
    userId: req.user?.id || null,
    action, module, entityType, entityId,
    description,
    ipAddress: req.ip,
    userAgent: req.get('user-agent') || null
  } })
}
