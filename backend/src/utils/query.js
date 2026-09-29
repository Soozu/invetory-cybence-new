import { HttpError } from './http.js'

export function pageQuery(query, allowedSort, defaultSort = 'createdAt') {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1)
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 20))
  const sortBy = query.sortBy || defaultSort
  if (!allowedSort.includes(sortBy)) throw new HttpError(400, `Invalid sortBy. Allowed: ${allowedSort.join(', ')}`)
  const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc'
  return { page, limit, skip: (page - 1) * limit, sortBy, sortOrder, search: String(query.search || '').trim() }
}

export async function paginate(model, { where = {}, include, select, query, allowedSort, defaultSort }) {
  const { page, limit, skip, sortBy, sortOrder } = pageQuery(query, allowedSort, defaultSort)
  const [data, total] = await Promise.all([
    model.findMany({ where, include, select, skip, take: limit, orderBy: { [sortBy]: sortOrder } }),
    model.count({ where })
  ])
  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } }
}
