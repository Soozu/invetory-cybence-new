export function errorText(error){
  const details=Array.isArray(error?.errors)?error.errors.map(item=>item.message).filter(Boolean).join(' '):''
  return details?`${error.message} ${details}`:error?.message||'The request failed. Please try again.'
}
