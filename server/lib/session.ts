import { nanoid } from 'nanoid'
import { getDb } from '../db'
import { sessions } from '../db/schema'
import type { Session } from '~~/shared/types'
import type { H3Event } from 'h3'
import { getCookie, setCookie } from 'h3'
import { generateUniqueFriendlyId, isValidFriendlyId } from './friendly-id'
import { eq } from 'drizzle-orm'

const SESSION_COOKIE_NAME = 'http_inspector_session'
const SESSION_MAX_AGE = 30 * 24 * 60 * 60 // 30 days in seconds

export type { Session }

export const getOrCreateSession = async (event: H3Event): Promise<string> => {
  const existingSessionId = getCookie(event, SESSION_COOKIE_NAME)

  if (existingSessionId) {
    const db = getDb()
    const result = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, existingSessionId))
      .limit(1)

    if (result.length) {
      // Update last accessed time
      await db
        .update(sessions)
        .set({ lastAccessedAt: new Date() })
        .where(eq(sessions.id, existingSessionId))

      return existingSessionId
    }
  }

  // Create new session
  const sessionId = nanoid()
  const db = getDb()
  const now = new Date()

  const friendlyId = await generateUniqueFriendlyId(async id => {
    const result = await db
      .select()
      .from(sessions)
      .where(eq(sessions.friendlyId, id))
      .limit(1)
    return result.length > 0
  })

  await db.insert(sessions).values({
    id: sessionId,
    friendlyId,
    createdAt: now,
    lastAccessedAt: now,
  })

  setCookie(event, SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  })

  return sessionId
}

export const getSessionFromCookie = (event: H3Event): string | null => {
  return getCookie(event, SESSION_COOKIE_NAME) || null
}

export const setSession = async (event: H3Event, sessionIdOrFriendly: string): Promise<boolean> => {
  const db = getDb()
  let sessionId = sessionIdOrFriendly

  // If it's a friendly ID, look up the technical session ID
  if (true === isValidFriendlyId(sessionIdOrFriendly)) {
    const result = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.friendlyId, sessionIdOrFriendly))
      .limit(1)

    if (!result.length) {
      return false
    }

    sessionId = result[0].id
  }

  // Verify session exists
  const result = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1)

  if (!result.length) {
    return false
  }

  // Update last accessed time
  await db.update(sessions).set({ lastAccessedAt: new Date() }).where(eq(sessions.id, sessionId))

  setCookie(event, SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  })

  return true
}

export const getSession = async (sessionId: string): Promise<Session | null> => {
  const db = getDb()

  const result = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1)

  return result.length ? result[0] : null
}

export const deleteSession = async (event: H3Event): Promise<void> => {
  const sessionId = getCookie(event, SESSION_COOKIE_NAME)

  if (!sessionId) {
    return
  }

  const db = getDb()

  // Cascade delete will handle tokens and requests automatically
  await db.delete(sessions).where(eq(sessions.id, sessionId))

  // Clear the cookie
  setCookie(event, SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })
}
