import { createError, defineEventHandler, type H3Event, type EventHandlerRequest } from 'h3'
import { formatRequestSummary, resolveLLMToken } from '~~/server/lib/llm-api'

export default defineEventHandler(async (event: H3Event<EventHandlerRequest>) => {
  if ((event.node.req.method?.toUpperCase() || 'GET') !== 'GET') {
    throw createError({ statusCode: 405, message: 'Method not allowed' })
  }
  const { db, token } = await resolveLLMToken(event)
  const requests = (await db.requests.list(token.sessionId, token.id)).map(formatRequestSummary)
  return { requests, total: requests.length }
})
