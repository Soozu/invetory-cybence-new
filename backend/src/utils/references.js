export async function nextReference(tx, key, prefix, digits = 5) {
  const counter = await tx.counter.upsert({
    where: { key }, create: { key, value: 1 }, update: { value: { increment: 1 } }
  })
  return `${prefix}-${String(counter.value).padStart(digits, '0')}`
}
