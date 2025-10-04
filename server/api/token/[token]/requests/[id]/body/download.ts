import { defineEventHandler, createError } from 'h3'
import { getRequestFull, getToken } from '~~/server/lib/redis-db'
import { getOrCreateSession } from '~~/server/lib/session'

export default defineEventHandler(async (event) => {
  const sessionId = await getOrCreateSession(event)

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
    throw createError({ statusCode: 400, message: 'Invalid request ID' })
  }

  // Check if token exists
  const token = await getToken(sessionId, tokenId)
  if (!token) {
    throw createError({ statusCode: 404, message: 'Token not found' })
  }

  const row = await getRequestFull(sessionId, tokenId, id)
  if (!row || !row.body) {
    throw createError({ statusCode: 404, message: 'Request body not found' })
  }

  // - if we have a content type, use it
  let ext = 'bin'

  if (row.contentType) {
    event.node.res.setHeader('Content-Type', row.contentType)
    const parts = row.contentType.split('/')
    if (parts.length === 2) {
      ext = parts[1].split(';')[0] || 'bin' // Handle cases like "application/json; charset=utf-8"
    }
  }

  event.node.res.setHeader('Content-Disposition', `attachment; filename="request-${token.id}-${id}-body.${ext}"`)
  return Buffer.from(row.body)
})
