import jwt from 'jsonwebtoken'
import { createError } from 'h3'
import { randomBytes } from 'crypto'
import { useKVStore } from './kv-store'

const JWT_EXPIRATION = '7d'

let cachedSecret: string | null = null

/**
 * Retrieve or generate the JWT secret key
 * 
 * @param dbFile Optional database file path for testing
 * @returns secret key string
 */
const getJwtSecret = async (dbFile?: string): Promise<string> => {
  if (cachedSecret) {
    return cachedSecret
  }

  try {
    const kv = useKVStore(dbFile)
    const AUTH_SECRET_KEY = 'auth:secret'

    let storedSecret = await kv.get<string>(AUTH_SECRET_KEY)

    if (!storedSecret) {
      storedSecret = randomBytes(48).toString('base64')
      await kv.set(AUTH_SECRET_KEY, storedSecret)
    }

    cachedSecret = storedSecret
    return storedSecret
  } catch (error) {
    console.error('Failed to retrieve or generate auth secret.', error)
    throw createError({ statusCode: 500, message: 'Failed to retrieve or generate auth secret' })
  }
}

/**
 * Generate a JWT for the given username
 * 
 * @param username Username to include in the token
 * @param dbFile Optional database file path for testing
 * @returns JWT string
 */
export const generateAuthToken = async (username: string, dbFile?: string): Promise<string> => {
  return jwt.sign({ username, type: 'auth' }, await getJwtSecret(dbFile), {
    algorithm: 'HS256',
    expiresIn: JWT_EXPIRATION,
    issuer: 'http-inspector',
    subject: username,
  })
}

/**
 * Verify a JWT and return the username if valid
 * Returns null if invalid or expired
 * @param token JWT string to verify
 * @param dbFile Optional database file path for testing
 * @returns username or null
 */
export const verifyAuthToken = async (token: string, dbFile?: string): Promise<string | null> => {
  try {
    const secret = await getJwtSecret(dbFile)

    const decoded = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      issuer: 'http-inspector'
    }) as jwt.JwtPayload

    if ('auth' !== decoded.type || 'string' !== typeof decoded.sub) {
      return null
    }

    return decoded.sub
  } catch {
    return null
  }
}

/**
 * Reset the cached secret (for testing purposes)
 */
export const resetCachedSecret = () => { cachedSecret = null }

/**
 * Get max age in seconds for auth tokens
 * Used for setting cookie expiration
 */
export const getTokenMaxAge = (): number => 7 * 24 * 60 * 60