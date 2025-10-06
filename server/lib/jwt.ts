import jwt from 'jsonwebtoken'
import { createError } from 'h3'
import { randomBytes } from 'crypto'
import { useKVStore } from './kv-store'

const JWT_EXPIRATION = '7d'

let cachedSecret: string | null = null

const getJwtSecret = async (): Promise<string> => {
  if (cachedSecret) {
    return cachedSecret
  }

  try {
    const kv = useKVStore()
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

export const generateAuthToken = async (username: string): Promise<string> => {
  return jwt.sign({ username, type: 'auth' }, await getJwtSecret(), {
    algorithm: 'HS256',
    expiresIn: JWT_EXPIRATION,
    issuer: 'http-inspector',
    subject: username,
  })
}

export const verifyAuthToken = async (token: string): Promise<string | null> => {
  try {
    const secret = await getJwtSecret()

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

export const getTokenMaxAge = (): number => 7 * 24 * 60 * 60
