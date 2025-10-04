import jwt from 'jsonwebtoken'
import { createError } from 'h3'
import { getRedisClient } from './redis'
import { randomBytes } from 'crypto'

const JWT_EXPIRATION = '7d'
const REDIS_AUTH_SECRET_KEY = 'auth:secret'

let cachedSecret: string | null = null

const getJwtSecret = async (): Promise<string> => {
    if (cachedSecret) {
        return cachedSecret
    }

    const envSecret = process.env.AUTH_SECRET?.trim()

    if (envSecret) {
        if (envSecret.length < 32) {
            throw createError({ statusCode: 500, message: 'AUTH_SECRET must be at least 32 characters long' })
        }
        cachedSecret = envSecret
        return envSecret
    }

    try {
        const redis = getRedisClient()
        let storedSecret = await redis.get(REDIS_AUTH_SECRET_KEY)

        if (!storedSecret) {
            storedSecret = randomBytes(48).toString('base64')
            await redis.set(REDIS_AUTH_SECRET_KEY, storedSecret)
        }

        cachedSecret = storedSecret
        return storedSecret
    } catch {
        throw createError({ statusCode: 500, message: 'Failed to retrieve or generate AUTH_SECRET from Redis' })
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
    } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
            console.debug(`JWT token expired: ${error.message}`)
        } else {
            console.log(`Invalid JWT token. ${error}`)
        }
        return null
    }
}

export const getTokenMaxAge = (): number => 7 * 24 * 60 * 60
