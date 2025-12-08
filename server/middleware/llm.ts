import { defineEventHandler, createError, type H3Event } from 'h3'

/**
 * Middleware to check if LLM endpoints are enabled
 * 
 * This middleware should be applied to all /api/llm/* routes
 * to ensure they are only accessible when ENABLE_LLM_ENDPOINT is set to 'true'
 */
export default defineEventHandler((event: H3Event) => {
  const path = event.path || event.node.req.url || ''
  
  if (!path.startsWith('/api/llm')) {
    return
  }

  const enabled = 'true' === process.env.ENABLE_LLM_ENDPOINT
  
  if (!enabled) {
    throw createError({
      statusCode: 404,
      message: 'Not Found',
    })
  }
})
