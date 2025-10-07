import { defineEventHandler, readBody, createError, type H3Event, type EventHandlerRequest } from 'h3'
import { useDatabase } from '~~/server/lib/db'
import { getOrCreateSession } from '~~/server/lib/session'
import { useServerEvents } from '~~/server/lib/events'

export default defineEventHandler(async (event: H3Event<EventHandlerRequest>) => {
  const sessionId = await getOrCreateSession(event)
  const method = event.node.req.method?.toUpperCase() || 'GET'
  const tokenId = event.context.params?.token
  const events = useServerEvents()
  const db = useDatabase()

  if (true !== ['GET', 'PATCH', 'DELETE'].includes(method)) {
    throw createError({ statusCode: 405, message: 'Method not allowed' })
  }

  if (!tokenId) {
    throw createError({ statusCode: 400, message: 'Token ID is required' })
  }

  const token = await db.tokens.get(sessionId, tokenId)
  if (!token) {
    throw createError({ statusCode: 404, message: 'Token not found' })
  }

  if ('DELETE' === method) {
    await db.tokens._delete(sessionId, tokenId)
    events.publish(sessionId, 'token.deleted', { token: { id: token.id } })
    return { ok: true }
  }

  if ('PATCH' === method) {
    const body = (await readBody(event).catch(() => ({}))) as unknown
    const payload = body as Record<string, unknown>
    const enabled = Boolean(payload.enabled)
    const status = Number(payload.status ?? 200)
    const headers = (payload.headers as unknown) as Record<string, string> | null
    const responseBody = (payload.body as unknown) as string | null

    await db.tokens.update(sessionId, tokenId, {
      responseEnabled: enabled,
      responseStatus: status,
      responseHeaders: headers ? JSON.stringify(headers) : null,
      responseBody,
    })

    events.publish(sessionId, 'token.response.updated', {
      token: {
        id: token.id,
        responseEnabled: enabled,
        responseStatus: status
      }
    })
    return { ok: true }
  }

  let headers = null
  if (token.responseHeaders) {
    try {
      headers = JSON.parse(token.responseHeaders)
    } catch {
      headers = null
    }
  }

  return { ...token, responseHeaders: headers, } as Omit<typeof token, 'responseHeaders'> & { responseHeaders: Record<string, string> | null }
})