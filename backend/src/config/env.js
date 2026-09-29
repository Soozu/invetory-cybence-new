import 'dotenv/config'

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
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
}
