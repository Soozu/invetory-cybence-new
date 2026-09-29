export const peso = value => new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP',maximumFractionDigits:0}).format(Number(value)||0)
export const number = value => new Intl.NumberFormat('en-PH').format(Number(value)||0)
export const shortDate = value => value ? new Date(value).toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'}) : '—'
export const productStatus = product => product.inactive ? 'Inactive' : product.stock-product.reserved<=0 ? 'Out of Stock' : product.stock-product.reserved<=(product.reorder||product.min) ? 'Low Stock' : 'In Stock'
export const downloadCsv = (filename,headers,rows) => {
  const escape = value => `"${String(value??'').replaceAll('"','""')}"`
  const csv = '\ufeff'+[headers,...rows].map(row=>row.map(escape).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}))
  const link = document.createElement('a'); link.href=url; link.download=filename; link.click(); URL.revokeObjectURL(url)
}
export function parseCsv(text) {
  const rows=[]; let row=[],field='',quoted=false
  for(let i=0;i<text.length;i++) { const char=text[i]; if(char==='"'&&quoted&&text[i+1]==='"'){field+='"';i++}else if(char==='"'){quoted=!quoted}else if(char===','&&!quoted){row.push(field);field=''}else if((char==='\n'||char==='\r')&&!quoted){if(char==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(cell=>cell.trim()))rows.push(row);row=[];field=''}else{field+=char} }
  row.push(field);if(row.some(cell=>cell.trim()))rows.push(row)
  const [headers,...values]=rows; if(!headers)return []
  return values.map(cells=>Object.fromEntries(headers.map((h,i)=>[h.trim().toLowerCase(),(cells[i]||'').trim()])))
}
