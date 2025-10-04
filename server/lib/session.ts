import { nanoid } from 'nanoid'
import { getRedisClient, KEYS, TTL } from './redis'
import type { H3Event } from 'h3'
import { getCookie, setCookie } from 'h3'
import { generateUniqueFriendlyId, isValidFriendlyId } from './friendly-id'

const SESSION_COOKIE_NAME = 'http_inspector_session'

export type Session = {
  id: string
  friendlyId: string
  createdAt: string
  lastAccessedAt: string
}

export const getOrCreateSession = async (event: H3Event): Promise<string> => {
  const existingSessionId = getCookie(event, SESSION_COOKIE_NAME)

  if (existingSessionId) {
    const redis = getRedisClient()
    const sessionExists = await redis.exists(KEYS.session(existingSessionId))

    if (sessionExists) {
      await redis.hset(KEYS.session(existingSessionId), 'lastAccessedAt', new Date().toISOString())
      await redis.expire(KEYS.session(existingSessionId), TTL.SESSION)
      return existingSessionId
    }
  }

  const sessionId = nanoid()
  const redis = getRedisClient()
  const now = new Date().toISOString()

  const friendlyId = await generateUniqueFriendlyId(async id => {
    return 1 === (await redis.exists(KEYS.friendlyIdLookup(id)))
  })

  await redis.hset(KEYS.session(sessionId), {
    id: sessionId,
    friendlyId,
    createdAt: now,
    lastAccessedAt: now,
  })

  await redis.setex(KEYS.friendlyIdLookup(friendlyId), TTL.SESSION, sessionId)
  await redis.expire(KEYS.session(sessionId), TTL.SESSION)
  setCookie(event, SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: TTL.SESSION,
    path: '/',
  })

  return sessionId
}

export const getSessionFromCookie = (event: H3Event): string | null => {
  return getCookie(event, SESSION_COOKIE_NAME) || null
}

export const setSession = async (event: H3Event, sessionIdOrFriendly: string): Promise<boolean> => {
  const redis = getRedisClient()

  let sessionId = sessionIdOrFriendly

  if (true === isValidFriendlyId(sessionIdOrFriendly)) {
    // Look up technical session ID
    const technicalId = await redis.get(KEYS.friendlyIdLookup(sessionIdOrFriendly))
    if (!technicalId) {
      return false
    }
    sessionId = technicalId
  }

  const sessionExists = await redis.exists(KEYS.session(sessionId))

  if (!sessionExists) {
    return false
  }

  await redis.hset(KEYS.session(sessionId), 'lastAccessedAt', new Date().toISOString())
  await redis.expire(KEYS.session(sessionId), TTL.SESSION)

  const sessionData = await redis.hgetall(KEYS.session(sessionId))
  if (sessionData.friendlyId) {
    await redis.expire(KEYS.friendlyIdLookup(sessionData.friendlyId), TTL.SESSION)
  }

  setCookie(event, SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: TTL.SESSION,
    path: '/',
  })

  return true
}

export const getSession = async (sessionId: string): Promise<Session | null> => {
  const redis = getRedisClient()
  const data = await redis.hgetall(KEYS.session(sessionId))

  if (!data.id) {
    return null
  }

  return {
    id: data.id,
    friendlyId: data.friendlyId || 'unknown',
    createdAt: data.createdAt,
    lastAccessedAt: data.lastAccessedAt,
  }
}

export const deleteSession = async (event: H3Event, sessionId: string): Promise<void> => {
  const redis = getRedisClient()

  const sessionData = await redis.hgetall(KEYS.session(sessionId))

  if (sessionData.friendlyId) {
    await redis.del(KEYS.friendlyIdLookup(sessionData.friendlyId))
  }

  await redis.del(KEYS.session(sessionId))

  setCookie(event, SESSION_COOKIE_NAME, '', {
    maxAge: 0,
    sameSite: 'lax',
    path: '/',
  })
}
