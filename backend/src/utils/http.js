export class HttpError extends Error {
  constructor(status, message, errors = []) {
    super(message)
    this.status = status
    this.errors = errors
  }
}

export const ok = (res, data, message = 'OK', status = 200, extra = {}) =>
  res.status(status).json({ success: true, message, data, ...extra })

export const fail = (status, message, errors) => { throw new HttpError(status, message, errors) }

export const assert = (condition, status, message) => {
  if (!condition) throw new HttpError(status, message)
}
