import { defineEventHandler, getCookie, type H3Event, type EventHandlerRequest } from 'h3'
import { verifyAuthToken } from '../../lib/jwt'

export default defineEventHandler(async (event: H3Event<EventHandlerRequest>) => {
  const AUTH_USERNAME = process.env.AUTH_USERNAME?.trim()
  const AUTH_PASSWORD = process.env.AUTH_PASSWORD?.trim()

  if (false === Boolean(AUTH_USERNAME && AUTH_PASSWORD)) {
    return { authenticated: true, required: false }
  }

  const token = getCookie(event, 'auth_token')

  if (!token) {
    return { authenticated: false, required: true }
  }

  const username = await verifyAuthToken(token)

  if (!username) {
    return { authenticated: false, required: true }
  }

  return { authenticated: true, required: true, username: username }
})
