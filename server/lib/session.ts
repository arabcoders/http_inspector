import { randomUUID } from 'crypto'
import { getDb } from '../db'
import { sessions } from '../db/schema'
import type { Session } from '~~/shared/types'
import type { H3Event } from 'h3'
import { getCookie, setCookie } from 'h3'
import { generateUniqueFriendlyId, isValidFriendlyId } from './friendly-id'
import { eq } from 'drizzle-orm'

const SESSION_COOKIE_NAME = 'session'
const SESSION_MAX_AGE = 30 * 24 * 60 * 60 // 30 days in seconds

/**
 * Static session ID for LLM API operations
 * This session is used for all LLM-created tokens to keep them separate from user sessions
 */
export const LLM_SESSION_ID = '00000000-0000-0000-0000-000000000000'
export const LLM_SESSION_FRIENDLY_ID = 'llm-api'

export const getOrCreateSession = async (event: H3Event): Promise<string> => {
  const existingSessionId = getCookie(event, SESSION_COOKIE_NAME)

  if (existingSessionId) {
    // Prevent using the static LLM session via cookie
    if (existingSessionId === LLM_SESSION_ID) {
      // Create a new session instead
      const id = randomUUID()
      const db = getDb()
      const now = new Date()

      const friendlyId = await generateUniqueFriendlyId(async friendlyIdCandidate => {
        const result = await db
          .select()
          .from(sessions)
          .where(eq(sessions.friendlyId, friendlyIdCandidate))
          .limit(1)
        return result.length > 0
      })

      await db.insert(sessions).values({
        id,
        friendlyId,
        createdAt: now,
        lastAccessedAt: now,
      })

      setCookie(event, SESSION_COOKIE_NAME, id, {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: SESSION_MAX_AGE,
        path: '/',
      })

      return id
    }

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

      return result[0].id
    }
  }

  // Create new session
  const id = randomUUID()
  const db = getDb()
  const now = new Date()

  const friendlyId = await generateUniqueFriendlyId(async friendlyIdCandidate => {
    const result = await db
      .select()
      .from(sessions)
      .where(eq(sessions.friendlyId, friendlyIdCandidate))
      .limit(1)
    return result.length > 0
  })

  await db.insert(sessions).values({
    id,
    friendlyId,
    createdAt: now,
    lastAccessedAt: now,
  })

  setCookie(event, SESSION_COOKIE_NAME, id, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  })

  return id
}

export const getSessionFromCookie = (event: H3Event): string | null => {
  return getCookie(event, SESSION_COOKIE_NAME) || null
}

export const setSession = async (event: H3Event, friendlyId: string): Promise<boolean> => {
  const db = getDb()

  if (false === isValidFriendlyId(friendlyId)) {
    return false
  }

  // Prevent setting the static LLM session via cookie
  if (friendlyId === LLM_SESSION_FRIENDLY_ID) {
    return false
  }

  const result = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.friendlyId, friendlyId))
    .limit(1)

  if (!result.length) {
    return false
  }

  const sessionId = result[0].id

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
  const cookieSessionId = getCookie(event, SESSION_COOKIE_NAME)

  if (!cookieSessionId) {
    return
  }

  const db = getDb()

  // The cookie contains the session id (UUID)
  await db.delete(sessions).where(eq(sessions.id, cookieSessionId))

  // Clear the cookie
  setCookie(event, SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })
}

/**
 * Ensure the static LLM session exists in the database
 * 
 * This should be called when the LLM API is accessed to ensure
 * the special LLM session is available
 */
export const ensureLLMSession = async (): Promise<void> => {
  const db = getDb()
  
  const result = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, LLM_SESSION_ID))
    .limit(1)
  
  if (result.length) {
    // Update last accessed time
    await db
      .update(sessions)
      .set({ lastAccessedAt: new Date() })
      .where(eq(sessions.id, LLM_SESSION_ID))
    return
  }
  
  // Create the LLM session
  const now = new Date()
  await db.insert(sessions).values({
    id: LLM_SESSION_ID,
    friendlyId: LLM_SESSION_FRIENDLY_ID,
    createdAt: now,
    lastAccessedAt: now,
  })
}

