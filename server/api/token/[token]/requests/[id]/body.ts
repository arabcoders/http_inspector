import { defineEventHandler, createError, type H3Event, type EventHandlerRequest } from 'h3'
import { getRequestFull, getToken } from '~~/server/lib/redis-db'
import { getOrCreateSession } from '~~/server/lib/session'
import { detectBinaryBody, extractContentType } from '~~/shared/content'
import { parseHeaders } from '~~/server/lib/utils'

export default defineEventHandler(async (event: H3Event<EventHandlerRequest>) => {
  const sessionId = await getOrCreateSession(event)
  type EventParams = { params?: Record<string, string> }
  const ctx = (event.context as unknown as EventParams) || {}
  const params = ctx.params || {}
  const id = Number(params.id)
  const tokenId = params.token

  if (!tokenId) {
    throw createError({ statusCode: 400, message: 'Token ID is required' })
  }

  if (Number.isNaN(id)) {
    throw createError({ statusCode: 400, message: 'Invalid request ID' })
  }

  const token = await getToken(sessionId, tokenId)
  if (!token) {
    throw createError({ statusCode: 404, message: 'Token not found' })
  }

  const row = await getRequestFull(sessionId, tokenId, id)
  if (!row) {
    throw createError({ statusCode: 404, message: 'Request not found' })
  }

  const headers = parseHeaders(row.headers ?? null)
  const headerContentType = row.contentType ?? extractContentType(headers)
  const bodyBuffer = row.body ? Buffer.from(row.body) : null
  const isBinary = row.isBinary ?? detectBinaryBody(bodyBuffer ?? undefined, headerContentType)

  if (!bodyBuffer || 0 === bodyBuffer.length) {
    return { contentType: headerContentType, text: '', headers, isBinary: false }
  }

  if (isBinary) {
    const hex = bodyBuffer.toString('hex')
    return { contentType: headerContentType, hex, headers, isBinary: true }
  }

  const text = bodyBuffer.toString('utf8')
  return { contentType: headerContentType, text, headers, isBinary: false }
})
