import { ok } from '../utils/http.js'
import { lookupSchema, labelSchema } from '../validators/barcodes.js'
import * as service from '../services/barcodeService.js'
export const lookup = async (req, res) => ok(res, await service.lookup(lookupSchema.parse(req.query), req.user))
export const label = async (req, res) => { const input = labelSchema.parse(req.params); ok(res, await service.labelData(input.type, input.id, req.user)) }
export const generate = async (req, res) => ok(res, await service.generateProductBarcode(req.params.id, req), 'Product barcode ready.')
