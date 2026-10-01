import 'dotenv/config'

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  trustProxy: Number(process.env.TRUST_PROXY_HOPS || 0),
  port: Number(process.env.PORT || 5000),
  frontendUrls: (process.env.FRONTEND_URL || 'http://localhost:5173,http://localhost:5174').split(',').map(url => url.trim()),
  accessSecret: process.env.JWT_ACCESS_SECRET,
  refreshSecret: process.env.JWT_REFRESH_SECRET,
  accessExpires: process.env.JWT_ACCESS_EXPIRES || '15m',
  refreshExpires: process.env.JWT_REFRESH_EXPIRES || '7d',
  cookieSecure: process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production'
}

export function validateEnvironment() {
  const missing = ['DATABASE_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'].filter(key => !process.env[key])
  if (missing.length) throw new Error(`Missing backend environment variables: ${missing.join(', ')}. Copy .env.example to .env and configure MySQL.`)
  if (env.accessSecret.length < 32 || env.refreshSecret.length < 32 || env.accessSecret === env.refreshSecret) {
    throw new Error('JWT secrets must be distinct and at least 32 characters long.')
  }
  if(!Number.isInteger(env.trustProxy)||env.trustProxy<0||env.trustProxy>5)throw new Error('TRUST_PROXY_HOPS must be an integer from 0 to 5.')
  if(process.env.JOBS_ENABLED&&!['true','false'].includes(process.env.JOBS_ENABLED))throw new Error('JOBS_ENABLED must be true or false.')
  const minutes=Number(process.env.BACKUP_INTERVAL_MINUTES||0)
  if(!Number.isInteger(minutes)||(minutes!==0&&(minutes<60||minutes>10080)))throw new Error('BACKUP_INTERVAL_MINUTES must be 0 or 60–10080.')
  if(Number(process.versions.node.split('.')[0])<22)throw new Error('Node.js 22 or newer is required.')
  for(const value of env.frontendUrls){const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('FRONTEND_URL must contain only explicit HTTP(S) origins.');if(env.nodeEnv==='production'&&url.protocol!=='https:')throw new Error('Production FRONTEND_URL requires HTTPS.')}
}
