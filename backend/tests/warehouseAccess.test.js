import { describe, expect, it } from 'vitest'
import { getAccessibleWarehouseIds, canAccessWarehouse, requireWarehouseAccess, applyWarehouseScope, warehouseWhere, requireTransferAccess } from '../src/services/warehouseAccessService.js'

const staff = { id: 'staff', role: 'Warehouse Staff', warehouseIds: ['A', 'B'] }
const administrator = { id: 'admin', role: 'Administrator', warehouseIds: [] }

describe('warehouse authorization policy', () => {
  it('allows multiple assigned warehouses and rejects every other warehouse', () => {
    expect(canAccessWarehouse(staff, 'A')).toBe(true)
    expect(canAccessWarehouse(staff, 'B')).toBe(true)
    expect(() => requireWarehouseAccess(staff, 'C')).toThrow('access to this warehouse')
  })
  it('gives administrators unrestricted scope', () => {
    expect(getAccessibleWarehouseIds(administrator)).toBeNull()
    expect(canAccessWarehouse(administrator, 'C')).toBe(true)
    expect(applyWarehouseScope({ status: 'ACTIVE' }, administrator)).toEqual({ status: 'ACTIVE' })
  })
  it('does not grant access from a legacy default alone or a missing identity', () => {
    expect(canAccessWarehouse({ role: 'Viewer', warehouseId: 'A' }, 'A')).toBe(false)
    expect(getAccessibleWarehouseIds({ role: 'Viewer' })).toEqual([])
    expect(canAccessWarehouse(undefined, 'A')).toBe(false)
  })
  it('intersects caller filters instead of allowing them to replace scope', () => {
    expect(applyWarehouseScope({ OR: [{ warehouseId: 'C' }, { status: 'ACTIVE' }] }, staff)).toEqual({
      AND: [{ OR: [{ warehouseId: 'C' }, { status: 'ACTIVE' }] }, { warehouseId: { in: ['A', 'B'] } }]
    })
    expect(() => warehouseWhere(staff, 'C')).toThrow('access to this warehouse')
  })
  it('separates source operations from destination receiving', () => {
    const transfer = { sourceWarehouseId: 'A', destinationWarehouseId: 'C' }
    expect(() => requireTransferAccess(staff, transfer, 'ship')).not.toThrow()
    expect(() => requireTransferAccess(staff, transfer, 'receive')).toThrow('access to this warehouse')
    const receiver = { role: 'Warehouse Staff', warehouseIds: ['C'] }
    expect(() => requireTransferAccess(receiver, transfer, 'receive')).not.toThrow()
    expect(() => requireTransferAccess(receiver, transfer, 'approve')).toThrow('access to this warehouse')
    expect(() => requireTransferAccess({ warehouseIds: ['D'] }, transfer)).toThrow('access to this transfer')
  })
})
