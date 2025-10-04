import { defineEventHandler, getCookie } from 'h3'
import { verifyAuthToken } from '../lib/jwt'
import type { ServerResponse } from 'http'

export default defineEventHandler(async (event) => {
  const AUTH_USERNAME = process.env.AUTH_USERNAME?.trim()
  const AUTH_PASSWORD = process.env.AUTH_PASSWORD?.trim()

  if (false === Boolean(AUTH_USERNAME && AUTH_PASSWORD)) {
    return
  }

  const { req, res } = event.node
  const pathname = req.url || ''

  const PUBLIC_PATHS = [
    '/_nuxt/',
    '/static/',
    '/favicon.ico',
    '/robots.txt',
    '/manifest.webmanifest',
    '/api/payload/',
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
    redirectOrUnauthorized(pathname, res)
    return
  }

  const username = await verifyAuthToken(token)

  if (!username) {
    redirectOrUnauthorized(pathname, res)
    return
  }
})

function redirectOrUnauthorized(pathname: string, res: ServerResponse) {
  if (!pathname.startsWith('/api/')) {
    res.statusCode = 302
    res.setHeader('Location', `/login?returnUrl=${encodeURIComponent(pathname)}`)
    res.end()
    return
  }

  res.statusCode = 401
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({
    statusCode: 401,
    message: 'Unauthorized - Please login to access this resource'
  }))
}
