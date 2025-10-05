import { readRawBody, defineEventHandler, type H3Event, type EventHandlerRequest } from 'h3'
import { getToken, insertRequest, getSessionIdForToken, type Token } from '~~/server/lib/redis-db'
import { useServerEvents } from '~~/server/lib/events'

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Expose-Headers': '*',
}

const selectFirstIp = (input?: string | null) => {
  if (!input) {
    return null
  }

  for (const part of input.split(',')) {
    const candidate = part.trim()
    if (candidate) {
      return candidate
    }
  }
  return null
}

const extractFromForwarded = (forwarded?: string | null) => {
  if (!forwarded) {
    return null
  }
  for (const segment of forwarded.split(',')) {
    const trimmed = segment.trim()
    const match = /for=([^;]+)/i.exec(trimmed)
    if (match?.[1]) {
      const cleaned = match[1].replace(/["[\]]/g, '').trim()
      if (cleaned) {
        return cleaned
      }
    }
  }
  return null
}

function determineClientIp(headers: Record<string, string>) {
  const forwardedFor = selectFirstIp(headers['x-forwarded-for'])
  if (forwardedFor) {
    return forwardedFor
  }

  const realIp = headers['x-real-ip'] || headers['x-client-ip'] || headers['true-client-ip']
  if (realIp) {
    return realIp
  }

  const cfIp = headers['cf-connecting-ip'] || headers['fastly-client-ip']
  if (cfIp) {
    return cfIp
  }

  const forwarded = extractFromForwarded(headers['forwarded'])
  if (forwarded) {
    return forwarded
  }

  const vercelIp = headers['x-vercel-forwarded-for']
  if (vercelIp) {
    return selectFirstIp(vercelIp)
  }
  return null
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
  const token = params.token as string | undefined
  if (!token) {
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

  const sessionId = await getSessionIdForToken(token)

  if (!sessionId) {
    event.node.res.statusCode = 404
    event.node.res.end()
    return
  }

  const tokenRow = await getToken(sessionId, token)

  if (!tokenRow) {
    event.node.res.statusCode = 404
    event.node.res.end()
    return
  }

  let buf: Buffer | null = null
  try {
    const body = await readRawBody(event, false)
    if (body) {
      buf = Buffer.isBuffer(body) ? body : Buffer.from(body)
    }
  } catch (err) {
    console.warn('failed to read body', err)
  }

  const remoteIp = process.env.TRUST_PROXY_CLIENT_IP === 'true' ? determineClientIp(headersObj) : event.node.req.socket.remoteAddress

  const created = await insertRequest(
    sessionId,
    token,
    method,
    headersObj,
    buf,
    event.node.req.url || '/api/payload/' + token,
    event.node.req.socket.remoteAddress || '127.0.0.1',
    remoteIp || event.node.req.socket.remoteAddress || '127.0.0.1'
  )

  useServerEvents().publish(sessionId, 'request.received', { token, request: created })

  const resp = await buildResponse(tokenRow)

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
