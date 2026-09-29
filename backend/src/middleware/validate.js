export const validate = schema => (req, res, next) => {
  req.validated = schema.parse(req.body)
  next()
}
