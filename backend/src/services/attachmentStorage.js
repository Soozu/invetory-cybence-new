import { storageFor } from './storageService.js'
export const storeAttachment=(key,buffer)=>storageFor().upload(key,buffer)
export const readAttachment=(key,provider='LOCAL')=>storageFor(provider).read(key)
// Only uncommitted files owned by a failed upload are removed. Archive retains bytes.
export const removeUncommittedAttachment=key=>storageFor().delete(key)
