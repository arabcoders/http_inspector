import { defineEventHandler, createError } from 'h3'
import { deleteRequest, getToken } from '~~/server/lib/redis-db'
import { getOrCreateSession } from '~~/server/lib/session'
import { publish } from '~~/server/lib/events'

export default defineEventHandler(async (event) => {
  const sessionId = await getOrCreateSession(event)
  const method = event.node.req.method?.toUpperCase() || 'GET'
  type EventParams = { params?: Record<string, string> }
  const ctx = (event.context as unknown as EventParams) || {}
  const params = ctx.params || {}
  const id = Number(params.id)
  const tokenId = params.token

  if (!tokenId) {
    throw createError({
      statusCode: 400,
      message: 'Token ID is required'
    })
  }

  if (Number.isNaN(id)) {
    throw createError({
      statusCode: 400,
      message: 'Invalid request ID'
    })
  }

  // Check if token exists
  const token = await getToken(sessionId, tokenId)
  if (!token) {
    throw createError({
      statusCode: 404,
      message: 'Token not found'
    })
  }

  if (method === 'DELETE') {
    try {
      await deleteRequest(sessionId, tokenId, id)
      publish(tokenId, { type: 'request.deleted', requestId: id })
      return { ok: true }
    } catch (err) {
      console.error('deleteRequest failed', err)
      throw createError({
        statusCode: 500,
        message: 'Failed to delete request'
      })
    }
  }

  throw createError({
    statusCode: 405,
    message: 'Method not allowed'
  })
})
