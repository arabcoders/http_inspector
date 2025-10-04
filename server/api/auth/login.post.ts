import { defineEventHandler, readBody, createError, setCookie } from 'h3'
import { generateAuthToken, getTokenMaxAge } from '../../lib/jwt'
import { timingSafeEqual } from 'crypto'

function cmp(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')

  if (bufA.length !== bufB.length) {
    const dummy = Buffer.alloc(bufA.length)
    timingSafeEqual(bufA, dummy)
    return false
  }

  return timingSafeEqual(bufA, bufB)
}

export default defineEventHandler(async (event) => {
  const AUTH_USERNAME = process.env.AUTH_USERNAME?.trim()
  const AUTH_PASSWORD = process.env.AUTH_PASSWORD?.trim()
  const AUTH_REQUIRED = Boolean(AUTH_USERNAME && AUTH_PASSWORD)

  if (!AUTH_REQUIRED || !AUTH_USERNAME || !AUTH_PASSWORD) {
    throw createError({
      statusCode: 400,
      message: 'Authentication is not configured'
    })
  }

  const body = await readBody(event).catch(() => ({}))
  const { username, password } = body

  if (!username || !password) {
    throw createError({ statusCode: 400, message: 'Username and password are required' })
  }

  const usernameMatch = cmp(username, AUTH_USERNAME)
  const passwordMatch = cmp(password, AUTH_PASSWORD)

  if (!usernameMatch || !passwordMatch) {
    throw createError({ statusCode: 401, message: 'Invalid username or password' })
  }

  const token = await generateAuthToken(username)

  setCookie(event, 'auth_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: getTokenMaxAge(),
    path: '/'
  })

  return { ok: true, message: 'Login successful' }
})
