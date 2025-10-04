import { defineEventHandler, createError } from 'h3'
import { getToken, getTokenRequests, deleteAllRequests } from '~~/server/lib/redis-db'
import { getOrCreateSession } from '~~/server/lib/session'
import { publish } from '~~/server/lib/events'

export default defineEventHandler(async (event) => {
  const sessionId = await getOrCreateSession(event)
  const method = event.node.req.method?.toUpperCase() || 'GET'
  type EventParams = { params?: Record<string, string> }
  const ctx = (event.context as unknown as EventParams) || {}
  const params = ctx.params || {}
  const tokenId = params.token
  
  if (!tokenId) {
    throw createError({
      statusCode: 400,
      message: 'Token ID is required'
    })
  }

  const tokenRow = await getToken(sessionId, tokenId)
  if (!tokenRow) {
    throw createError({
      statusCode: 404,
      message: 'Token not found'
    })
  }

  if (method === 'GET') {
    const list = await getTokenRequests(sessionId, tokenId)
    return list
  }

  if (method === 'DELETE') {
    await deleteAllRequests(sessionId, tokenId)
    publish(tokenId, { type: 'request.cleared' })
    return { ok: true }
  }

  throw createError({
    statusCode: 405,
    message: 'Method not allowed'
  })
})
