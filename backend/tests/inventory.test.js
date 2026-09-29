import { describe, expect, it, vi } from 'vitest'
import { adjustmentSchema } from '../src/validators/inventory.js'
import { changeStock, validateSerials } from '../src/services/inventoryService.js'

function stockFixture(quantity = 5, reservedQuantity = 1) {
  const balance = { id: 'balance-1', quantity, reservedQuantity }
  const movements = []
  const tx = {
    product: { findUnique: vi.fn(async () => ({ id: 'product-1', name: 'Router', sku: 'NET-1', status: 'ACTIVE', reorderPoint: 0, minimumStock: 0 })) },
    warehouse: { findUnique: vi.fn(async () => ({ id: 'warehouse-1', name: 'Main', status: 'ACTIVE' })) },
    warehouseStock: {
      upsert: vi.fn(async () => balance),
      findUnique: vi.fn(async () => ({ ...balance })),
      updateMany: vi.fn(async ({ where, data }) => {
        if (where.quantity !== balance.quantity || where.reservedQuantity !== balance.reservedQuantity) return { count: 0 }
        balance.quantity = data.quantity
        return { count: 1 }
      })
    },
    stockMovement: { create: vi.fn(async ({ data }) => { movements.push(data); return data }) }
  }
  return { tx, balance, movements }
}

describe('inventory business rules', () => {
  it('records stock in and stock out with the matching movement history', async () => {
    const { tx, balance, movements } = stockFixture()
    const base = { productId: 'product-1', warehouseId: 'warehouse-1', referenceNumber: 'ADJ-1', userId: 'user-1' }
    await changeStock(tx, { ...base, delta: 3, type: 'STOCK_IN' })
    await changeStock(tx, { ...base, delta: -2, type: 'STOCK_OUT' })
    expect(balance.quantity).toBe(6)
    expect(movements.map(item => [item.previousQuantity, item.newQuantity, item.quantity])).toEqual([[5, 8, 3], [8, 6, -2]])
  })

  it('rejects stock out that would consume reserved units and writes no movement', async () => {
    const { tx, balance, movements } = stockFixture(5, 2)
    await expect(changeStock(tx, { productId: 'product-1', warehouseId: 'warehouse-1', delta: -4, type: 'STOCK_OUT', referenceNumber: 'ADJ-2', userId: 'user-1' })).rejects.toMatchObject({ status: 400 })
    expect(balance.quantity).toBe(5)
    expect(movements).toHaveLength(0)
  })

  it('requires one unique serial per serialized unit', async () => {
    const tx = { serialNumber: { count: vi.fn().mockResolvedValue(2) } }
    const product = { id: 'product-1', trackSerialNumbers: true }
    await expect(validateSerials(tx, product, 'warehouse-1', 2, ['A', 'B'])).rejects.toMatchObject({ status: 409 })
    tx.serialNumber.count.mockResolvedValue(0)
    await expect(validateSerials(tx, product, 'warehouse-1', 2, ['A', 'A'])).rejects.toMatchObject({ status: 400 })
    await expect(validateSerials(tx, product, 'warehouse-1', 2, ['A'])).rejects.toMatchObject({ status: 400 })
    await expect(validateSerials(tx, product, 'warehouse-1', 2, ['A', 'B'])).resolves.toBeUndefined()
  })

  it('allows a correction to zero but rejects zero units for regular adjustments', () => {
    const input = { productId: 'p', warehouseId: 'w', type: 'CORRECTION', quantity: 0, reason: 'Cycle count' }
    expect(adjustmentSchema.safeParse(input).success).toBe(true)
    expect(adjustmentSchema.safeParse({ ...input, type: 'STOCK_IN' }).success).toBe(false)
  })
})
