import { readRawBody, defineEventHandler, type H3Event, type EventHandlerRequest } from 'h3'
import { useDatabase } from '~~/server/lib/db'
import type { Token } from '~~/shared/types'
import { ingestRequest } from '~~/server/lib/request-ingestion'

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Expose-Headers': '*',
}

const buildResponse = async (tokenRow: Token | null, allowBody = true) => {
  if (!tokenRow || !tokenRow.responseEnabled) {
    return { status: 200, headers: {} as Record<string, string>, body: null }
  }

  const status = tokenRow.responseStatus ?? 200
  const headers: Record<string, string> = {}

  if (tokenRow.responseHeaders) {
    try {
      const parsed = JSON.parse(tokenRow.responseHeaders) as Record<string, string>
      for (const [key, value] of Object.entries(parsed || {})) {
        if (!key) continue
        headers[key] = String(value)
      }
    } catch (err) {
      console.warn('failed to parse response headers', err)
    }
  }

  const body = allowBody ? tokenRow.responseBody ?? '' : null
  const hasBody = allowBody && body !== null && body !== undefined

  if (!hasBody || body === '') {
    return { status, headers, body: null }
  }
  return { status, headers, body }
}

export default defineEventHandler(async (event: H3Event<EventHandlerRequest>) => {
  const method = event.node.req.method?.toUpperCase() || 'GET'
  type EventContextParams = { params?: Record<string, string> }
  const ctx = (event.context as unknown as EventContextParams) || {}
  const params = ctx.params || {}
  const tokenId = params.token as string | undefined
  const db = useDatabase()
  
  if (!tokenId) {
    event.node.res.statusCode = 404
    event.node.res.end('not found')
    return
  }

  const headersObj: Record<string, string> = {}
  for (const [k, v] of Object.entries(event.node.req.headers || {})) {
    if (typeof v === 'string') {
      headersObj[k] = v
    }
    else if (Array.isArray(v)) {
      headersObj[k] = v.join(',')
    }
  }

  if (method === 'OPTIONS') {
    const res = event.node.res
    for (const [k, v] of Object.entries(CORS_HEADERS)) {
      res.setHeader(k, v)
    }
    res.statusCode = 204
    res.end()
    return
  }

  const sessionId = await db.tokens.getSessionId(tokenId)

  if (!sessionId) {
    event.node.res.statusCode = 404
    event.node.res.end()
    return
  }

  const userToken = await db.tokens.get(sessionId, tokenId)

  if (!userToken) {
    event.node.res.statusCode = 404
    event.node.res.end()
    return
  }

  let buf: Buffer | null = null
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    try {
      const body = await readRawBody(event, false)
      if (body) {
        buf = Buffer.isBuffer(body) ? body : Buffer.from(body)
      }
    } catch (err) {
      console.warn('failed to read body', err)
    }
  }

  // Ingest the request and publish events
  await ingestRequest(
    sessionId,
    userToken.id,
    method,
    headersObj,
    buf,
    event.node.req.url || '/api/payload/' + tokenId,
    event.node.req.socket.remoteAddress || '127.0.0.1'
  )

  const resp = await buildResponse(userToken)

  for (const [k, v] of Object.entries(CORS_HEADERS)) {
    event.node.res.setHeader(k, v)
  }

  for (const [k, v] of Object.entries(resp.headers || {})) {
    event.node.res.setHeader(k, v)
  }

  event.node.res.statusCode = resp.status || 200

  if (resp.body) {
    event.node.res.end(resp.body)
  }
  else event.node.res.end()
})
