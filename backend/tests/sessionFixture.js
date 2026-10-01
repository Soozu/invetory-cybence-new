import jwt from 'jsonwebtoken'
import crypto from 'node:crypto'
// Call only in the disposable integration schema; never use real login credentials.
export async function testAccessToken(db,userId,secret){
  if(!/^\/techstock_test_warehouse_[a-z0-9]+$/.test(new URL(process.env.TEST_DATABASE_URL).pathname))throw Error('Unsafe session fixture schema')
  const user=await db.user.findUniqueOrThrow({where:{id:userId},select:{authVersion:true}})
  const session=await db.session.create({data:{userId,authVersion:user.authVersion,refreshTokenHash:crypto.randomBytes(32).toString('hex'),expiresAt:new Date(Date.now()+3600000)}})
  return jwt.sign({sid:session.id,ver:user.authVersion,type:'access'},secret,{subject:userId,expiresIn:'1h'})
}
