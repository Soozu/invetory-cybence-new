import { Field, Select } from './ui.jsx'

export default function WarehouseAssignmentFields({ warehouses, value, onChange, administrator = false }) {
  const ids = value.warehouseIds || []
  const toggle = id => {
    const next = ids.includes(id) ? ids.filter(item => item !== id) : [...ids, id]
    onChange({ warehouseIds: next, defaultWarehouseId: next.includes(value.defaultWarehouseId) ? value.defaultWarehouseId : next[0] || '' })
  }
  return <div className="space-y-4">
    <Field label="Warehouse access">
      {administrator && <p className="mb-3 text-xs subtle">Administrators can access all warehouses. Assignments can set a preferred default.</p>}
      {warehouses.length ? <div className="grid gap-2 rounded-xl border divider p-3 sm:grid-cols-2">
        {warehouses.map(warehouse => <label key={warehouse.id} className="flex items-center gap-2 text-xs">
          <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={ids.includes(warehouse.id)} onChange={() => toggle(warehouse.id)} />
          {warehouse.name}
        </label>)}
      </div> : <p className="text-xs subtle">No warehouses configured.</p>}
      {!administrator && !ids.length && <p className="mt-2 text-xs text-amber-600">This user will have no warehouse access until a warehouse is assigned.</p>}
    </Field>
    <Field label="Default warehouse">
      <Select value={value.defaultWarehouseId || ''} onChange={defaultWarehouseId => onChange({ warehouseIds: ids, defaultWarehouseId })}
        options={warehouses.filter(warehouse => ids.includes(warehouse.id)).map(warehouse => ({ value: warehouse.id, label: warehouse.name }))}
        placeholder="No default warehouse" />
    </Field>
  </div>
}
