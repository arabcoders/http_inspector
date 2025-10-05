import { defineEventHandler, createError, type H3Event, type EventHandlerRequest } from 'h3'
import { getRequestFull, getToken } from '~~/server/lib/redis-db'
import { getOrCreateSession } from '~~/server/lib/session'
import { detectBinaryBody, extractContentType } from '~~/shared/content'
import { parseHeaders, capitalizeHeader } from '~~/server/lib/utils'

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

  const headers = parseHeaders(row.headers as string)
  const contentType = row.contentType ?? extractContentType(headers)
  const bodyBuffer = row.body ? Buffer.from(row.body as Uint8Array) : null
  const isBinary = row.isBinary ?? detectBinaryBody(bodyBuffer ?? undefined, contentType)

  if (isBinary) {
    throw createError({ statusCode: 400, message: 'Cannot display binary content as text' })
  }

  const url = row.url || '/'
  const method = row.method || 'GET'

  // Determine the full URL - if url already contains protocol (http:// or https://), use it as-is
  // Otherwise, construct it from headers
  let fullUrl = url
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    const host = headers.host || headers.Host || 'localhost'
    const protocol = headers['x-forwarded-proto'] || 'http'
    fullUrl = `${protocol}://${host}${url}`
  }

  const statusLine = `${method} ${process.env.RAW_FULL_URL ? fullUrl : url} HTTP/1.1`
  const headerLines = Object.entries(headers).map(
    ([key, value]) => `${capitalizeHeader(key)}: ${String(value)}`
  ).join('\r\n')
  const body = bodyBuffer ? bodyBuffer.toString('utf8') : ''

  event.node.res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  return `${statusLine}\r\n${headerLines}${headerLines ? '\r\n' : ''}\r\n${body}`
})
