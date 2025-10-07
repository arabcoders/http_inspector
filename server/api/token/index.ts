import { defineEventHandler, createError } from 'h3'
import { useDatabase } from '~~/server/lib/db'
import { getOrCreateSession } from '~~/server/lib/session'
import { useServerEvents } from '~~/server/lib/events'

export default defineEventHandler(async (event) => {
  const sessionId = await getOrCreateSession(event)
  const method = event.node.req.method?.toUpperCase() || 'GET'
  const events = useServerEvents()
  const db = useDatabase()

  if ('GET' === method) {
    return await db.tokens.list(sessionId)
  }

  if ('POST' === method) {
    const token = await db.tokens.create(sessionId)
    events.publish(sessionId, 'token.created', {
      token: { id: token.id, friendlyId: token.friendlyId, createdAt: token.createdAt }
    })
    return token
  }

  if ('DELETE' === method) {
    await db.tokens.deleteAll(sessionId)
    events.publish(sessionId, 'token.cleared', {})
    return { ok: true }
  }

  throw createError({ statusCode: 405, message: 'Method not allowed' })
})
