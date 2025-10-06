import { defineEventHandler, createError, type H3Event, type EventHandlerRequest } from 'h3'
import { useDatabase } from '~~/server/lib/db'
import { getOrCreateSession } from '~~/server/lib/session'
import { useServerEvents } from '~~/server/lib/events'

export default defineEventHandler(async (event: H3Event<EventHandlerRequest>) => {
  const sessionId = await getOrCreateSession(event)
  const method = event.node.req.method?.toUpperCase() || 'GET'
  type EventParams = { params?: Record<string, string> }
  const ctx = (event.context as unknown as EventParams) || {}
  const params = ctx.params || {}
  const tokenId = params.token
  const events = useServerEvents()
  const db = useDatabase()

  if (true !== ['GET', 'DELETE'].includes(method)) {
    throw createError({ statusCode: 405, message: 'Method not allowed' })
  }

  if (!tokenId) {
    throw createError({ statusCode: 400, message: 'Token ID is required' })
  }

  const token = await db.tokens.get(sessionId, tokenId)
  if (!token) {
    throw createError({ statusCode: 404, message: 'Token not found' })
  }

  if ('DELETE' === method) {
    await db.requests.deleteAll(sessionId, token.id)
    events.publish(sessionId, 'request.cleared', { token: tokenId })
    return { ok: true }
  }

  return await db.requests.list(sessionId, token.id)
})
