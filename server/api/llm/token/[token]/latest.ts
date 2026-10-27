import { createError, defineEventHandler, type H3Event, type EventHandlerRequest } from 'h3'
import { formatRequest, resolveLLMToken } from '~~/server/lib/llm-api'

export default defineEventHandler(async (event: H3Event<EventHandlerRequest>) => {
  if ((event.node.req.method?.toUpperCase() || 'GET') !== 'GET') {
    throw createError({ statusCode: 405, message: 'Method not allowed' })
  }
  const { db, token } = await resolveLLMToken(event)
  const request = (await db.requests.list(token.sessionId, token.id))[0]
  if (!request) {
    throw createError({ statusCode: 404, message: 'No requests found for this token' })
  }
  return await formatRequest(request, db)
})
