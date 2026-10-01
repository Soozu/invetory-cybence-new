import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('dashboard client with an empty database',()=>{
  let getDashboardOverview,fetchMock
  const totals={totalProducts:0,totalInventoryUnits:0,inventoryValue:0,lowStock:0,outOfStock:0,activeSuppliers:0}
  const success=data=>new Response(JSON.stringify({success:true,data}),{status:200,headers:{'Content-Type':'application/json'}})
  beforeEach(async()=>{
    vi.resetModules()
    vi.stubEnv('VITE_API_URL','https://api.test/api')
    fetchMock=vi.fn(url=>Promise.resolve(success(url.includes('/summary')?totals:[])))
    vi.stubGlobal('fetch',fetchMock)
    ;({getDashboardOverview}=await import('../../src/services/dashboardService.js'))
  })
  afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs()})
  it('accepts real zero totals and empty activity/stock lists',async()=>{
    expect(await getDashboardOverview('')).toEqual({summary:totals,low:[],activity:[]})
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls.every(([url])=>!url.includes('warehouse='))).toBe(true)
  })
  it('preserves selected warehouse scope on every overview request',async()=>{
    await getDashboardOverview('warehouse-1')
    expect(fetchMock.mock.calls.every(([url])=>url.includes('warehouse=warehouse-1'))).toBe(true)
  })
  it('rejects missing totals instead of presenting fabricated zeros',async()=>{
    fetchMock.mockImplementation(url=>Promise.resolve(success(url.includes('/summary')?{}:[])))
    await expect(getDashboardOverview('')).rejects.toMatchObject({status:502,message:expect.stringContaining('incomplete dashboard data')})
  })
  it('surfaces failed requests so the page can offer retry',async()=>{
    fetchMock.mockImplementation(url=>Promise.resolve(url.includes('/summary')?new Response(JSON.stringify({message:'Database temporarily unavailable'}),{status:503}):success([])))
    await expect(getDashboardOverview('')).rejects.toMatchObject({status:503,message:'Database temporarily unavailable'})
  })
})
