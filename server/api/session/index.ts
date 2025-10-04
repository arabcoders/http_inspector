import { defineEventHandler } from 'h3'
import { getOrCreateSession, getSession } from '~~/server/lib/session'

export default defineEventHandler(async (event) => {
  return await getSession(await getOrCreateSession(event))
})
