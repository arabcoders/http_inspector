import { createError, defineEventHandler, type H3Event, type EventHandlerRequest } from 'h3'
import { formatRequest, resolveLLMToken } from '~~/server/lib/llm-api'

export default defineEventHandler(async (event: H3Event<EventHandlerRequest>) => {
  if ((event.node.req.method?.toUpperCase() || 'GET') !== 'GET') {
    throw createError({ statusCode: 405, message: 'Method not allowed' })
  }
  type EventContextParams = { params?: Record<string, string> }
  const requestId = (event.context as EventContextParams)?.params?.request
  if (!requestId) {
    throw createError({ statusCode: 400, message: 'Request parameter is required' })
  }
  const { db, token } = await resolveLLMToken(event)
  const request = await db.requests.get(token.sessionId, token.id, requestId)
  if (!request) {
    throw createError({ statusCode: 404, message: 'Request not found' })
  }
  return await formatRequest(request, db)
})
