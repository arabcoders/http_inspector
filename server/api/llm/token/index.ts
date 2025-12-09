import { defineEventHandler, createError } from 'h3'
import { useDatabase } from '~~/server/lib/db'
import { ensureLLMSession, LLM_SESSION_ID } from '~~/server/lib/session'

/**
 * LLM Token Management
 * 
 * POST /api/llm/token - Create a new token
 */
export default defineEventHandler(async (event) => {
  const method = event.node.req.method?.toUpperCase() || 'POST'

  if ('POST' !== method) {
    throw createError({ statusCode: 405, message: 'Method not allowed' })
  }

  // Ensure the LLM session exists
  await ensureLLMSession()

  const db = useDatabase()
  const token = await db.tokens.create(LLM_SESSION_ID)

  // Build payload URL
  const host = event.node.req.headers.host || 'localhost:3000'
  const protocol = event.node.req.headers['x-forwarded-proto'] || 'http'
  const baseUrl = `${protocol}://${host}`
  const payloadUrl = `${baseUrl}/api/payload/${token.friendlyId || token.id}`

  return {
    ...token,
    payloadUrl,
  }
})
