import { defineEventHandler, readBody, type H3Event, type EventHandlerRequest } from 'h3'
import { setSession } from '~~/server/lib/session'
import { isValidFriendlyId } from '~~/server/lib/friendly-id'

export default defineEventHandler(async (event: H3Event<EventHandlerRequest>) => {
  if (true !== useRuntimeConfig().sessionRestoreEnabled) {
    throw createError({ statusCode: 403, message: 'Session restoration is disabled' })
  }
  const body = await readBody(event)
  const { sessionId } = body

  if (!sessionId || 'string' !== typeof sessionId) {
    throw createError({ statusCode: 400, message: 'sessionId is required' })
  }

  if (false === isValidFriendlyId(sessionId)) {
    throw createError({
      statusCode: 400,
      message: 'Invalid session ID format. Use (e.g., famous-amethyst-panda)',
    })
  }

  const success = await setSession(event, sessionId)

  if (!success) {
    throw createError({ statusCode: 404, message: 'Session not found or expired' })
  }

  return { success: true, sessionId }
})
