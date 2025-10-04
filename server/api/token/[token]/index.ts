import { defineEventHandler, readBody, createError } from 'h3'
import { getToken, updateToken, deleteToken } from '~~/server/lib/redis-db'
import { getOrCreateSession } from '~~/server/lib/session'
import { publishGlobal } from '~~/server/lib/events'

export default defineEventHandler(async (event) => {
  const sessionId = await getOrCreateSession(event)
  const method = event.node.req.method?.toUpperCase() || 'GET'
  const tokenId = event.context.params?.token
  
  if (!tokenId) {
    throw createError({
      statusCode: 400,
      message: 'Token ID is required'
    })
  }

  if (method === 'GET') {
    const token = await getToken(sessionId, tokenId)
    if (!token) {
      throw createError({
        statusCode: 404,
        message: 'Token not found'
      })
    }
    
    let headers = null
    if (token.responseHeaders) {
      try {
        headers = JSON.parse(token.responseHeaders)
      } catch {
        headers = null
      }
    }
    
    return {
      id: token.id,
      createdAt: token.createdAt,
      responseEnabled: token.responseEnabled,
      responseStatus: token.responseStatus,
      responseHeaders: headers,
      responseBody: token.responseBody ?? null,
    }
  }

  if (method === 'PATCH') {
    const token = await getToken(sessionId, tokenId)
    if (!token) {
      throw createError({
        statusCode: 404,
        message: 'Token not found'
      })
    }
    
    const body = (await readBody(event).catch(() => ({}))) as unknown
    const payload = body as Record<string, unknown>
    const enabled = Boolean(payload.enabled)
    const status = Number(payload.status ?? 200)
    const headers = (payload.headers as unknown) as Record<string, string> | null
    const responseBody = (payload.body as unknown) as string | null
    
    await updateToken(sessionId, tokenId, {
      responseEnabled: enabled,
      responseStatus: status,
      responseHeaders: headers ? JSON.stringify(headers) : null,
      responseBody,
    })
    
    publishGlobal(sessionId, { type: 'token.response.updated', token: { id: tokenId, responseEnabled: enabled, responseStatus: status } })
    return { ok: true }
  }

  if (method === 'DELETE') {
    const token = await getToken(sessionId, tokenId)
    if (!token) {
      throw createError({
        statusCode: 404,
        message: 'Token not found'
      })
    }
    
    await deleteToken(sessionId, tokenId)
    publishGlobal(sessionId, { type: 'token.deleted', token: { id: tokenId } })
    return { ok: true }
  }

  throw createError({
    statusCode: 405,
    message: 'Method not allowed'
  })
})