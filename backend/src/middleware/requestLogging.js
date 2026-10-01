import crypto from 'node:crypto'
export function logEvent(level,event,fields={}){process.stdout.write(JSON.stringify({timestamp:new Date().toISOString(),level,event,...fields})+'\n')}
export function requestLogging(req,res,next){
  // Generate our own ID; never trust a client-supplied log field.
  req.requestId=crypto.randomUUID();res.set('X-Request-ID',req.requestId)
  const start=performance.now()
  res.once('finish',()=>logEvent(res.statusCode>=500?'error':'info','request',{requestId:req.requestId,method:req.method,route:req.route?.path||'unmatched',status:res.statusCode,durationMs:Math.round(performance.now()-start)}))
  next()
}
