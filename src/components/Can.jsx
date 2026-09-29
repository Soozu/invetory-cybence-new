import { useInventory } from '../context/InventoryContext.jsx'
import { can } from '../lib/permissions.js'

export default function Can({ permission, children, fallback = null }) {
  const { user } = useInventory()
  return can(user, permission) ? children : fallback
}
