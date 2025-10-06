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
  const id = Number(params.id)
  const tokenId = params.token
  const db = useDatabase()

  if ('DELETE' !== method) {
    throw createError({ statusCode: 405, message: 'Method not allowed' })
  }

  if (!tokenId) {
    throw createError({ statusCode: 400, message: 'Token ID is required' })
  }

  if (Number.isNaN(id)) {
    throw createError({ statusCode: 400, message: 'Invalid request ID' })
  }

  const token = await db.tokens.get(sessionId, tokenId)
  if (!token) {
    throw createError({ statusCode: 404, message: 'Token not found' })
  }

  try {
    await db.requests._delete(sessionId, tokenId, id)
    useServerEvents().publish(sessionId, 'request.deleted', { token: tokenId, requestId: id })
    return { ok: true }
  } catch (err) {
    console.error('deleteRequest failed', err)
    throw createError({ statusCode: 500, message: 'Failed to delete request' })
  }
})
