import { Button } from './ui.jsx'
export default function ServerPagination({pagination,page,onChange,disabled=false}){
  if(!pagination)return null
  return <div className="flex flex-wrap items-center gap-3 border-t divider p-4"><Button size="sm" variant="secondary" disabled={disabled||page<=1} onClick={()=>onChange(page-1)}>Previous</Button><span className="text-xs subtle">Page {page} of {Math.max(1,pagination.totalPages)} · {pagination.total} records</span><Button size="sm" variant="secondary" disabled={disabled||page>=pagination.totalPages} onClick={()=>onChange(page+1)}>Next</Button></div>
}
