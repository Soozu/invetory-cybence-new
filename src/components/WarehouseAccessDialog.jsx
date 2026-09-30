import { useState } from 'react'
import { useInventory } from '../context/InventoryContext.jsx'
import WarehouseAssignmentFields from './WarehouseAssignmentFields.jsx'
import { Button, Modal } from './ui.jsx'

export default function WarehouseAccessDialog({ account, onClose }) {
  const { warehouses, setUserWarehouses, isMutating } = useInventory()
  const [value, setValue] = useState({ warehouseIds: account.warehouseIds || [], defaultWarehouseId: account.defaultWarehouseId || '' })
  const submit = async event => {
    event.preventDefault()
    if (await setUserWarehouses(account.id, value)) onClose()
  }
  return <Modal open onOpenChange={open => !open && onClose()} title="Warehouse access" description={`Manage warehouse assignments for ${account.name}.`}>
    <form onSubmit={submit} className="space-y-5">
      <WarehouseAssignmentFields warehouses={warehouses} value={value} onChange={setValue} administrator={account.role === 'Administrator'} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" loading={isMutating} disabled={isMutating}>{isMutating ? 'Saving…' : 'Save access'}</Button>
      </div>
    </form>
  </Modal>
}
