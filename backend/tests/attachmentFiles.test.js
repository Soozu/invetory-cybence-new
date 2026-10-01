import { describe, expect, it } from 'vitest'
import { validateAttachmentFile, safeFileName, attachmentPolicy } from '../src/services/attachmentFiles.js'
import { attachmentAction, attachmentTarget } from '../src/validators/attachments.js'
// Small stored ZIP builder for synthetic OOXML fixtures; never extracts real user files.
export function officeFixture(extension, extra = []) {
  const crc = buffer => { let n=0xffffffff; for(const byte of buffer){n^=byte; for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0)} return (n^0xffffffff)>>>0 }
  const main = extension==='docx'?'word/document.xml':'xl/workbook.xml', contentType=extension==='docx'?'wordprocessingml.document.main+xml':'spreadsheetml.sheet.main+xml'
  const entries=[['[Content_Types].xml',`<Types><Override PartName="/${main}" ContentType="application/vnd.openxmlformats-officedocument.${contentType}"/></Types>`],['_rels/.rels','<Relationships/>'],[main,extension==='docx'?'<document><body/></document>':'<workbook><sheets/></workbook>'],...extra]
  const locals=[], centrals=[]; let offset=0
  for(const [name,text] of entries) {
    const b=Buffer.from(text), nameBytes=Buffer.from(name), h=Buffer.alloc(30), c=Buffer.alloc(46)
    h.writeUInt32LE(0x04034b50);h.writeUInt16LE(20,4);h.writeUInt32LE(crc(b),14);h.writeUInt32LE(b.length,18);h.writeUInt32LE(b.length,22);h.writeUInt16LE(nameBytes.length,26)
    c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt32LE(crc(b),16);c.writeUInt32LE(b.length,20);c.writeUInt32LE(b.length,24);c.writeUInt16LE(nameBytes.length,28);c.writeUInt32LE(offset,42)
    locals.push(h,nameBytes,b);centrals.push(c,nameBytes);offset+=h.length+nameBytes.length+b.length
  }
  const directory=Buffer.concat(centrals), end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16)
  return Buffer.concat([...locals,directory,end])
}
export const pdfFixture = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n')
const file=(originalname,mimetype,buffer=pdfFixture)=>({originalname,mimetype,buffer})
describe('document upload validation',()=>{
  it('accepts matched PDF and PNG signatures',async()=>{ expect(await validateAttachmentFile(file('inspection.pdf','application/pdf'))).toMatchObject({fileName:'inspection.pdf',mimeType:'application/pdf'});expect(await validateAttachmentFile(file('photo.png','image/png',Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY9sAAAAASUVORK5CYII=','base64')))).toMatchObject({mimeType:'image/png'}) })
  it('accepts structurally inspected DOCX and XLSX archives',async()=>{for(const extension of ['docx','xlsx'])expect((await validateAttachmentFile(file(`evidence.${extension}`,extension==='docx'?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',officeFixture(extension)))).fileName).toBe(`evidence.${extension}`)})
  it('rejects spoofed content, MIME, extensions and empty files',async()=>{for(const upload of [file('fake.pdf','application/pdf',Buffer.from('<script>alert(1)</script>')),file('fake.png','image/png'),file('file.pdf','text/html'),file('file.exe','application/pdf'),file('empty.pdf','application/pdf',Buffer.alloc(0))])await expect(validateAttachmentFile(upload)).rejects.toHaveProperty('status',400)})
  it('rejects paths, control characters and oversized names',()=>{for(const name of ['../secret.pdf','folder\\file.pdf','x\r\ny.pdf','.hidden.pdf','a'.repeat(181),'a.pdf '])expect(()=>safeFileName(name)).toThrow()})
  it('rejects macro, external, encoded external, embedded and invalid Office documents',async()=>{
    const mime='application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    for(const extra of [[['word/vbaProject.bin','macro']],[['word/_rels/document.xml.rels','<Relationships><Relationship TargetMode="External" Target="https://example.invalid"/></Relationships>']],[['word/_rels/document.xml.rels','<Relationships><Relationship TargetMode="Exter&#110;al" Target="https://example.invalid"/></Relationships>']],[['word/embeddings/item.bin','payload']],[['broken.xml','<broken>']],[['entity.xml','<!DOCTYPE x [<!ENTITY e SYSTEM "file:///x">]><x>&e;</x>']]])await expect(validateAttachmentFile(file('bad.docx',mime,officeFixture('docx',extra)))).rejects.toHaveProperty('status',400)
    await expect(validateAttachmentFile(file('bad.docx',mime,Buffer.from('PKbad')))).rejects.toHaveProperty('status',400)
  })
  it('enforces size and a configured subset of allowlisted formats',async()=>{const oldSize=process.env.ATTACHMENT_MAX_BYTES,oldTypes=process.env.ATTACHMENT_ALLOWED_TYPES;try{process.env.ATTACHMENT_MAX_BYTES='5';await expect(validateAttachmentFile(file('large.pdf','application/pdf'))).rejects.toHaveProperty('status',413);process.env.ATTACHMENT_MAX_BYTES='1000';process.env.ATTACHMENT_ALLOWED_TYPES='png';await expect(validateAttachmentFile(file('disabled.pdf','application/pdf'))).rejects.toHaveProperty('status',400);process.env.ATTACHMENT_ALLOWED_TYPES='exe';expect(()=>attachmentPolicy()).toThrow()}finally{if(oldSize===undefined)delete process.env.ATTACHMENT_MAX_BYTES;else process.env.ATTACHMENT_MAX_BYTES=oldSize;if(oldTypes===undefined)delete process.env.ATTACHMENT_ALLOWED_TYPES;else process.env.ATTACHMENT_ALLOWED_TYPES=oldTypes}})
  it('requires explicit entity allowlists, versions and archive reasons',()=>{expect(attachmentTarget.safeParse({entityType:'__proto__',entityId:'x'}).success).toBe(false);expect(attachmentAction.safeParse({notes:'reason'}).success).toBe(false)})
})
