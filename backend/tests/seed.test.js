import { describe, expect, it } from 'vitest'
import bcrypt from 'bcrypt'
import { seedAdministrator } from '../prisma/seedAdministrator.js'

function accessOnlyDatabase(existing = []) {
  const users = new Map(existing.map(user => [user.email, user]))
  const roles = new Map(), permissions = new Map(), grants = new Set()
  const prisma = new Proxy({
    role: { async upsert({where,create}) { if (!roles.has(where.name)) roles.set(where.name,{id:where.name,...create}); return roles.get(where.name) } },
    permission: { async upsert({where,create}) { const key=where.module_action.module+':'+where.module_action.action; if(!permissions.has(key)) permissions.set(key,{id:key,...create}); return permissions.get(key) } },
    rolePermission: { async createMany({data}) { for(const grant of data) grants.add(grant.roleId+':'+grant.permissionId) } },
    user: { async upsert({where,create,update}) { if(!users.has(where.email)) users.set(where.email,{id:'admin',...create}); else Object.assign(users.get(where.email),update); return users.get(where.email) } }
  }, { get(target,key) { if(!(key in target)) throw Error('Seed attempted to access business data: '+String(key)); return target[key] } })
  return {prisma,users,grants}
}

describe('administrator-only database bootstrap', () => {
  it('creates one administrator with a hashed configured password and no business writes', async () => {
    const db=accessOnlyDatabase()
    const admin=await seedAdministrator(db.prisma,{SEED_ADMIN_EMAIL:'OWNER@EXAMPLE.TEST',SEED_ADMIN_PASSWORD:'BootstrapTest123!'})
    expect([...db.users.keys()]).toEqual(['owner@example.test'])
    expect(admin.roleId).toBe('Administrator')
    expect(admin.warehouseId).toBeUndefined()
    expect(admin.passwordHash).not.toBe('BootstrapTest123!')
    expect(await bcrypt.compare('BootstrapTest123!',admin.passwordHash)).toBe(true)
  })
  it('reruns without creating accounts or replacing existing credentials/profile', async () => {
    const db=accessOnlyDatabase([{id:'existing',email:'owner@example.test',firstName:'Existing',passwordHash:'existing-password-hash',roleId:'Administrator'},{id:'member',email:'member@example.test',passwordHash:'member-password-hash',roleId:'Viewer'}])
    const before=structuredClone([...db.users.values()])
    const config={SEED_ADMIN_EMAIL:'owner@example.test',SEED_ADMIN_PASSWORD:'UnusedNewPassword123!'}
    await seedAdministrator(db.prisma,config)
    const grants=db.grants.size
    await seedAdministrator(db.prisma,config)
    expect([...db.users.values()]).toEqual(before)
    expect(db.grants.size).toBe(grants)
  })
})
