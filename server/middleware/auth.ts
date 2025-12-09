import { defineEventHandler, getCookie, sendRedirect, createError, type H3Event, type EventHandlerRequest } from 'h3'
import { verifyAuthToken } from '../lib/jwt'

export default defineEventHandler(async (event: H3Event<EventHandlerRequest>) => {
  const AUTH_USERNAME = process.env.AUTH_USERNAME?.trim()
  const AUTH_PASSWORD = process.env.AUTH_PASSWORD?.trim()

  if (false === Boolean(AUTH_USERNAME && AUTH_PASSWORD)) {
    return
  }

  const pathname = event.path || event.node?.req.url || ''

    const PUBLIC_PATHS = [
    '/_nuxt/',
    '/static/',
    '/apple-touch-icon.png',
    '/favicon-96x96.png',
    '/favicon.ico',
    '/favicon.svg',
    '/robots.txt',
    '/manifest.webmanifest',
    '/web-app-manifest-192x192.png',
    '/api/payload/',
    '/api/llm',
    '/api/auth/',
    '/login',
  ]

  for (const publicPath of PUBLIC_PATHS) {
    if (pathname.startsWith(publicPath)) {
      return
    }
  }

  const token = getCookie(event, 'auth_token')

  if (!token) {
    return redirectOrUnauthorized(event, pathname)
  }

  const username = await verifyAuthToken(token)
  if (!username) {
    return redirectOrUnauthorized(event, pathname)
  }
})

const redirectOrUnauthorized = (event: H3Event<EventHandlerRequest>, pathname: string) => {
  if (!pathname.startsWith('/api/')) {
    return sendRedirect(event, `/login?returnUrl=${encodeURIComponent(pathname)}`, 302)
  }

  throw createError({
    statusCode: 401,
    message: 'Unauthorized - Please login to access this resource'
  })
}
