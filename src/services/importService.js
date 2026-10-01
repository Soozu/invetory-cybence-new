import { apiRequest } from '../lib/api.js'
export const importTypes = [
  {type:'Products',label:'Products',module:'products',action:'CREATE',help:'Required: sku, name, categorySlug, brandSlug, purchaseCost. Optional tracking flag: true or false. Use existing category and brand slugs and supplier codes.'},
  {type:'Suppliers',label:'Suppliers',module:'suppliers',action:'CREATE',help:'Required: supplierCode, companyName. Codes must be unique. Optional email must be valid.'},
  {type:'OpeningStock',label:'Opening stock',module:'inventory',action:'EDIT',scoped:true,help:'Required: sku, warehouseCode, quantity. Only products with no balance or movement history in this warehouse qualify. Serialized units require serialNumbers separated by semicolons.'},
  {type:'SerialNumbers',label:'Serial numbers',module:'inventory',action:'EDIT',scoped:true,help:'Required: sku, warehouseCode, serialNumber. Registers existing unreserved units without increasing stock. Earlier history and warranty dates remain unknown.'},
  {type:'Assets',label:'Company assets',module:'assets',action:'CREATE',scoped:true,help:'Required: sku, warehouseCode. Serialized products also require serialNumber. Each row consumes one available warehouse unit. Optional purchaseDate uses YYYY-MM-DD.'}
]
export const listImports = params => apiRequest('/imports',{params})
export const referenceCodes = (type,kind,params) => apiRequest(`/imports/reference-codes/${type}/${kind}`,{params})
export const getImport = (id,params) => apiRequest(`/imports/${encodeURIComponent(id)}`,{params})
export const previewImport = (type,file,requestKey,warehouseId) => { const body=new FormData();body.append('file',file);body.append('requestKey',requestKey);if(warehouseId)body.append('warehouseId',warehouseId);return apiRequest(`/imports/preview/${type}`,{method:'POST',body}) }
export const importAction = (id,action,body) => apiRequest(`/imports/${encodeURIComponent(id)}/${action}`,{method:'POST',body})
export async function downloadImport(path,name) {
  const blob=await apiRequest(`/imports/${path}`,{responseType:'blob'}),url=URL.createObjectURL(blob),link=document.createElement('a')
  link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)
}
