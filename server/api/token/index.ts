import { defineEventHandler, createError } from 'h3'
import { useDatabase } from '~~/server/lib/db'
import { getOrCreateSession } from '~~/server/lib/session'
import { useServerEvents } from '~~/server/lib/events'

export default defineEventHandler(async (event) => {
  const sessionId = await getOrCreateSession(event)
  const method = event.node.req.method?.toUpperCase() || 'GET'
  const events = useServerEvents()
  const db = useDatabase()

  if (method === 'GET') {
    const tokens = await db.tokens.list(sessionId)
    return tokens
  }

  if (method === 'POST') {
    const token = await db.tokens.create(sessionId)
    events.publish(sessionId, 'token.created', { token: { id: token.id, createdAt: token.createdAt } })
    return { id: token.id }
  }

  if (method === 'DELETE') {
    await db.tokens.deleteAll(sessionId)
    events.publish(sessionId, 'token.cleared', {})
    return { ok: true }
  }

  throw createError({
    statusCode: 405,
    message: 'Method not allowed'
  })
})
