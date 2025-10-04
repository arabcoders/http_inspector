import { defineEventHandler, createError } from 'h3'
import { getUserTokens, createToken, deleteAllTokens } from '~~/server/lib/redis-db'
import { getOrCreateSession } from '~~/server/lib/session'
import { publishGlobal } from '~~/server/lib/events'

export default defineEventHandler(async (event) => {
  const sessionId = await getOrCreateSession(event)
  const method = event.node.req.method?.toUpperCase() || 'GET'

  if (method === 'GET') {
    const tokens = await getUserTokens(sessionId)
    return tokens
  }

  if (method === 'POST') {
    const token = await createToken(sessionId)
    publishGlobal(sessionId, { type: 'token.created', token: { id: token.id, createdAt: token.createdAt } })
    return { id: token.id }
  }

  if (method === 'DELETE') {
    await deleteAllTokens(sessionId)
    publishGlobal(sessionId, { type: 'token.cleared' })
    return { ok: true }
  }

  throw createError({
    statusCode: 405,
    message: 'Method not allowed'
  })
})
