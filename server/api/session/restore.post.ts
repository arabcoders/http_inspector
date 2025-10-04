import { defineEventHandler, readBody } from 'h3'
import { setSession } from '~~/server/lib/session'
import { isValidFriendlyId } from '~~/server/lib/friendly-id'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()

  if (!config.sessionRestoreEnabled) {
    throw createError({
      statusCode: 403,
      message: 'Session restoration is disabled',
    })
  }

  const body = await readBody(event)
  const { sessionId } = body

  if (!sessionId || typeof sessionId !== 'string') {
    throw createError({
      statusCode: 400,
      message: 'sessionId is required',
    })
  }

  // Validate session ID format (alphanumeric 16-32 chars OR friendly format word-word-word)
  const isTechnicalId = /^[a-zA-Z0-9_-]{16,32}$/.test(sessionId)
  const isFriendlyId = isValidFriendlyId(sessionId)

  if (!isTechnicalId && !isFriendlyId) {
    throw createError({
      statusCode: 400,
      message: 'Invalid session ID format. Use either technical ID or friendly ID (e.g., famous-amethyst-panda)',
    })
  }

  const success = await setSession(event, sessionId)

  if (!success) {
    throw createError({
      statusCode: 404,
      message: 'Session not found or expired',
    })
  }

  return { success: true, sessionId }
})
