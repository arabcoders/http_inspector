import { defineEventHandler, readBody, createError, type H3Event, type EventHandlerRequest } from 'h3'
import { getToken } from '~~/server/lib/db'
import { getOrCreateSession } from '~~/server/lib/session'
import { ingestRequest, parseRawRequest } from '~~/server/lib/request-ingestion'

export default defineEventHandler(async (event: H3Event<EventHandlerRequest>) => {
    const sessionId = await getOrCreateSession(event)
    type EventParams = { params?: Record<string, string> }
    const ctx = (event.context as unknown as EventParams) || {}
    const params = ctx.params || {}
    const tokenId = params.token

    if (!tokenId) {
        throw createError({ statusCode: 400, message: 'Token ID is required' })
    }

    const token = await getToken(sessionId, tokenId)
    if (!token) {
        throw createError({ statusCode: 404, message: 'Token not found' })
    }

    const body = await readBody(event).catch(() => null)

    if (!body || 'string' !== typeof body.raw) {
        throw createError({ statusCode: 400, message: 'Invalid request body. Expected { raw: string }' })
    }

    const rawText = body.raw as string

    // Parse the raw request
    let parsed: ReturnType<typeof parseRawRequest>
    try {
        parsed = parseRawRequest(rawText)
    } catch (err) {
        throw createError({
            statusCode: 400,
            message: `Failed to parse raw request: ${err instanceof Error ? err.message : 'Unknown error'}`
        })
    }

    const bodyBuffer = parsed.body ? Buffer.from(parsed.body, 'utf8') : null
    const fallbackIp = event.node.req.socket?.remoteAddress || '127.0.0.1'
    const created = await ingestRequest(
        sessionId,
        tokenId,
        parsed.method,
        parsed.headers,
        bodyBuffer,
        parsed.url,
        fallbackIp,
        body.clientIp || null,
        body.remoteIp || null
    )

    return {
        ok: true,
        request: { id: created.id, method: created.method, url: created.url, createdAt: created.createdAt }
    }
})
