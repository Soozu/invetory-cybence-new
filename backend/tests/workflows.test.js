import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocked = vi.hoisted(() => ({
  tx: null,
  changeStock: vi.fn(),
  audit: vi.fn(),
  nextReference: vi.fn().mockResolvedValue('RCV-1')
}))
vi.mock('../src/config/prisma.js', () => ({ prisma: {} }))
vi.mock('../src/services/inventoryService.js', () => ({
  inventoryTransaction: work => work(mocked.tx), changeStock: mocked.changeStock
}))
vi.mock('../src/utils/audit.js', () => ({ audit: mocked.audit }))
vi.mock('../src/utils/references.js', () => ({ nextReference: mocked.nextReference }))

import { receiveOrder } from '../src/services/procurementService.js'
import { transitionTransfer } from '../src/services/transferService.js'
import { assignAsset, returnAsset } from '../src/services/assetService.js'
import { createProduct } from '../src/services/catalogService.js'

const req = { user: { id: 'user-1' } }

function orderFixture({ received = 0, serialized = false } = {}) {
  const line = { id: 'line-1', productId: 'product-1', quantity: 10, receivedQuantity: received,
    product: { sku: 'SSD-1', trackSerialNumbers: serialized, warrantyMonths: 24 } }
  const order = { id: 'order-1', poNumber: 'PO-1', status: 'APPROVED', warehouseId: 'warehouse-1', supplierId: 'supplier-1', createdById: 'user-1', items: [line] }
  const tx = {
    purchaseOrder: { findUnique: vi.fn().mockResolvedValue(order), update: vi.fn().mockResolvedValue({}) },
    purchaseOrderItem: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    purchaseReceipt: { create: vi.fn().mockResolvedValue({ id: 'receipt-1' }) },
    purchaseReceiptItem: { create: vi.fn().mockResolvedValue({}) },
    serialNumber: { count: vi.fn().mockResolvedValue(0), createMany: vi.fn().mockResolvedValue({ count: 2 }) },
    notification: { create: vi.fn().mockResolvedValue({}) }
  }
  mocked.tx = tx
  return { tx, line }
}

describe('procurement, transfer, and asset workflows', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.nextReference.mockResolvedValue('RCV-1')
  })

  it('records partial receiving and increases warehouse stock', async () => {
    const { tx } = orderFixture()
    const result = await receiveOrder('order-1', { items: [{ purchaseOrderItemId: 'line-1', quantity: 6 }] }, req)
    expect(result.status).toBe('PARTIAL')
    expect(tx.purchaseOrderItem.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { receivedQuantity: { increment: 6 } } }))
    expect(mocked.changeStock).toHaveBeenCalledWith(tx, expect.objectContaining({ delta: 6, type: 'PURCHASE_RECEIVING' }))
    expect(tx.purchaseOrder.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'PARTIAL' } }))
    expect(tx.purchaseReceiptItem.create).toHaveBeenCalledOnce()
  })

  it('rejects receiving beyond the remaining order quantity', async () => {
    orderFixture({ received: 8 })
    await expect(receiveOrder('order-1', { items: [{ purchaseOrderItemId: 'line-1', quantity: 3 }] }, req)).rejects.toMatchObject({ status: 400 })
    expect(mocked.changeStock).not.toHaveBeenCalled()
  })

  it('requires distinct serials matching the received quantity', async () => {
    const { tx } = orderFixture({ serialized: true })
    await expect(receiveOrder('order-1', { items: [{ purchaseOrderItemId: 'line-1', quantity: 2, serialNumbers: ['SN-A'] }] }, req)).rejects.toMatchObject({ status: 400 })
    await expect(receiveOrder('order-1', { items: [{ purchaseOrderItemId: 'line-1', quantity: 2, serialNumbers: ['SN-A', 'SN-A'] }] }, req)).rejects.toMatchObject({ status: 400 })
    await receiveOrder('order-1', { items: [{ purchaseOrderItemId: 'line-1', quantity: 2, serialNumbers: ['SN-A', 'SN-B'] }] }, req)
    expect(tx.serialNumber.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.arrayContaining([expect.objectContaining({ serialNumber: 'SN-A' }), expect.objectContaining({ serialNumber: 'SN-B' })]) }))
  })

  it('rejects a serial number already recorded in another receipt', async () => {
    const { tx } = orderFixture({ serialized: true })
    tx.serialNumber.count.mockResolvedValue(1)
    await expect(receiveOrder('order-1', { items: [{ purchaseOrderItemId: 'line-1', quantity: 1, serialNumbers: ['SN-USED'] }] }, req)).rejects.toMatchObject({ status: 409 })
    expect(tx.purchaseReceipt.create).not.toHaveBeenCalled()
    expect(mocked.changeStock).not.toHaveBeenCalled()
  })

  it('removes stock when shipped and adds stock when received', async () => {
    const transfer = { id: 'transfer-1', transferNumber: 'TRF-1', status: 'APPROVED', sourceWarehouseId: 'source', destinationWarehouseId: 'destination', requestedById: 'user-1', destinationWarehouse: { name: 'Destination' }, items: [{ id: 'item-1', productId: 'product-1', quantity: 4, product: { trackSerialNumbers: false }, serialSelections: [] }] }
    const tx = {
      stockTransfer: { findUnique: vi.fn().mockImplementation(async () => transfer), update: vi.fn().mockResolvedValue({}) },
      stockTransferItem: { update: vi.fn().mockResolvedValue({}) },
      notification: { create: vi.fn().mockResolvedValue({}) }
    }
    mocked.tx = tx
    await transitionTransfer('transfer-1', 'ship', req)
    expect(mocked.changeStock).toHaveBeenCalledWith(tx, expect.objectContaining({ warehouseId: 'source', delta: -4, type: 'TRANSFER_OUT' }))
    transfer.status = 'IN_TRANSIT'
    await transitionTransfer('transfer-1', 'receive', req)
    expect(mocked.changeStock).toHaveBeenCalledWith(tx, expect.objectContaining({ warehouseId: 'destination', delta: 4, type: 'TRANSFER_IN' }))
    expect(tx.stockTransferItem.update).toHaveBeenCalledWith(expect.objectContaining({ data: { receivedQuantity: 4 } }))
  })

  it('preserves assignment history when an asset is returned', async () => {
    const asset = { id: 'asset-1', assetTag: 'AST-1', status: 'AVAILABLE', serialNumberId: 'serial-1' }
    const tx = {
      asset: {
        findUnique: vi.fn().mockImplementation(async () => asset),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }), update: vi.fn().mockResolvedValue({})
      },
      assetAssignment: {
        create: vi.fn().mockResolvedValue({ id: 'assignment-1' }),
        findFirst: vi.fn().mockResolvedValue({ id: 'assignment-1', status: 'ACTIVE' }),
        update: vi.fn().mockResolvedValue({})
      },
      serialNumber: { update: vi.fn().mockResolvedValue({}) }
    }
    mocked.tx = tx
    await assignAsset('asset-1', { assignedTo: 'Alex Rivera', department: 'IT' }, req)
    expect(tx.assetAssignment.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ assignedTo: 'Alex Rivera' }) }))
    asset.status = 'ASSIGNED'
    await returnAsset('asset-1', {}, req)
    expect(tx.assetAssignment.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'RETURNED' }) }))
    expect(tx.assetAssignment).not.toHaveProperty('delete')
    expect(tx.serialNumber.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'AVAILABLE' } }))
  })

  it('propagates duplicate SKU conflicts from the catalog write', async () => {
    mocked.tx = { product: { create: vi.fn().mockRejectedValue(Object.assign(new Error('duplicate'), { code: 'P2002' })) } }
    await expect(createProduct({ name: 'Router', sku: 'NET-1' }, req)).rejects.toMatchObject({ code: 'P2002' })
  })

  it('creates a product with its SKU and an audit entry', async () => {
    const product = { id: 'product-2', sku: 'NET-2' }
    const create = vi.fn().mockResolvedValue(product)
    mocked.tx = { product: { create } }
    await expect(createProduct({ name: 'Router', sku: 'NET-2' }, req)).resolves.toBe(product)
    expect(create).toHaveBeenCalledWith({ data: { name: 'Router', sku: 'NET-2', barcode: null } })
    expect(mocked.audit).toHaveBeenCalledWith(mocked.tx, req, 'CREATED', 'Products', 'Product', product.id, expect.stringContaining(product.sku))
  })
})
