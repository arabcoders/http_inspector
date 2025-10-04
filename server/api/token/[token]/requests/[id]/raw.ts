import { defineEventHandler, createError } from 'h3'
import { getRequestFull, getToken } from '~~/server/lib/redis-db'
import { getOrCreateSession } from '~~/server/lib/session'
import { detectBinaryBody, extractContentType } from '~~/shared/content'

function parseHeaders(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}

function capitalizeHeader(header: string): string {
  return header
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('-')
}

export default defineEventHandler(async event => {
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

  const row = await getRequestFull(sessionId, tokenId, id)
  if (!row) {
    throw createError({
      statusCode: 404,
      message: 'Request not found'
    })
  }

  const headers = parseHeaders(row.headers as string)
  const contentType = row.contentType ?? extractContentType(headers)
  const bodyBuffer = row.body ? Buffer.from(row.body as Uint8Array) : null
  const isBinary = row.isBinary ?? detectBinaryBody(bodyBuffer ?? undefined, contentType)

  if (isBinary) {
    throw createError({
      statusCode: 400,
      message: 'Cannot display binary content as text'
    })
  }

  const url = row.url || '/'
  const method = row.method || 'GET'

  // Construct full URL with protocol and host for tools like sqlmap
  const host = headers.host || headers.Host || 'localhost'
  const protocol = headers['x-forwarded-proto'] || 'http'
  const fullUrl = `${protocol}://${host}${url}`

  const statusLine = `${method} ${process.env.RAW_FULL_URL ? fullUrl : url} HTTP/1.1`
  const headerLines = Object.entries(headers)
    .map(([key, value]) => `${capitalizeHeader(key)}: ${String(value)}`)
    .join('\r\n')
  const body = bodyBuffer ? bodyBuffer.toString('utf8') : ''

  event.node.res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  return `${statusLine}\r\n${headerLines}${headerLines ? '\r\n' : ''}\r\n${body}`
})
