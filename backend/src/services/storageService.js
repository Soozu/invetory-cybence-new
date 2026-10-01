import fs from 'node:fs/promises'
import path from 'node:path'
import { HttpError } from '../utils/http.js'

export function storageRoot(){
  const root=path.resolve(process.env.ATTACHMENT_STORAGE_DIR||'.private-storage/attachments'),publicRoot=path.resolve('uploads')
  if(root===publicRoot||root.startsWith(publicRoot+path.sep))throw Error('Attachments must be outside public uploads.')
  return root
}
export function storageProvider(){
  const provider=(process.env.ATTACHMENT_STORAGE_PROVIDER||'LOCAL').toUpperCase()
  if(provider!=='LOCAL')throw new HttpError(503,'Configured file storage provider is unavailable.')
  return provider
}
async function localFile(key){
  if(!/^[a-f0-9-]{36}\.bin$/.test(key))throw new HttpError(500,'Attachment storage reference is invalid.')
  const root=storageRoot();await fs.mkdir(root,{recursive:true,mode:0o700})
  if((await fs.lstat(root)).isSymbolicLink())throw Error('Private storage must not be a symbolic link.')
  const real=await fs.realpath(root),file=path.join(real,key)
  try{if((await fs.lstat(file)).isSymbolicLink())throw new HttpError(500,'Attachment storage reference is invalid.')}catch(error){if(error.code!=='ENOENT')throw error}
  return file
}
const local={
  async upload(key,buffer){await fs.writeFile(await localFile(key),buffer,{flag:'wx',mode:0o600})},
  async read(key){try{return await fs.readFile(await localFile(key))}catch(error){if(error.code==='ENOENT')throw new HttpError(404,'Attachment file is unavailable. Contact an administrator.');throw error}},
  async delete(key){await fs.unlink(await localFile(key)).catch(error=>{if(error.code!=='ENOENT')throw error})},
  // Authorization and integrity remain in attachmentService before this route is used.
  getUrl(id){return `/api/attachments/files/${encodeURIComponent(id)}`}
}
export function storageFor(provider=storageProvider()){
  if(provider!=='LOCAL')throw new HttpError(503,'Attachment storage provider is unavailable.')
  return local
}
export async function storageStatus(){
  try{storageProvider();const root=storageRoot();const stat=await fs.lstat(root);if(!stat.isDirectory()||stat.isSymbolicLink())return {provider:'LOCAL',status:'unavailable'};await fs.access(root,fs.constants.R_OK|fs.constants.W_OK);return {provider:'LOCAL',status:'available'}}
  catch(error){return {provider:(process.env.ATTACHMENT_STORAGE_PROVIDER||'LOCAL').toUpperCase(),status:error.code==='ENOENT'?'not_initialized':'unavailable'}}
}
