import { defineEventHandler, deleteCookie, type H3Event, type EventHandlerRequest } from 'h3'

export default defineEventHandler((event: H3Event<EventHandlerRequest>) => {
  deleteCookie(event, 'auth_token', { path: '/' })
  return { ok: true, message: 'Logout successful' }
})
