import { Button, Card, EmptyState } from './ui.jsx'

export default function ServerTable({ rows, columns, pagination, onPage, disabled = false, emptyTitle, emptyDescription }) {
  return <Card className="overflow-hidden">
    {!rows.length ? <EmptyState title={emptyTitle} description={emptyDescription}/> : <div className="overflow-x-auto"><table className="w-full text-left text-[13px]">
      <thead><tr className="table-head">{columns.map(column => <th key={column.key} className="px-4 py-3 text-xs font-bold">{column.label}</th>)}</tr></thead>
      <tbody>{rows.map(row => <tr key={row.id} className="table-row border-t">{columns.map(column => <td key={column.key} className="px-4 py-4 align-top">{column.render ? column.render(row) : row[column.key] ?? '—'}</td>)}</tr>)}</tbody>
    </table></div>}
    <div className="flex flex-wrap items-center justify-between gap-3 border-t divider p-4 text-xs subtle"><span>{pagination.total} records · Page {pagination.page} of {Math.max(1, pagination.totalPages)}</span><div className="flex gap-2"><Button variant="secondary" size="sm" disabled={disabled || pagination.page <= 1} onClick={() => onPage(pagination.page - 1)}>Previous</Button><Button variant="secondary" size="sm" disabled={disabled || pagination.page >= pagination.totalPages} onClick={() => onPage(pagination.page + 1)}>Next</Button></div></div>
  </Card>
}
