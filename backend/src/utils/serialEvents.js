// Call only inside the transaction that performs the corresponding business action.
export async function recordSerialEvents(tx, ids, event, req) {
  if (!ids.length) return
  await tx.serialEvent.createMany({ data: [...new Set(ids)].map(serialNumberId => ({
    serialNumberId, ...event, userId: req?.user?.id || null
  })) })
}
