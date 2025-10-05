import { defineEventHandler, type H3Event, type EventHandlerRequest } from 'h3'
import { getOrCreateSession, getSession } from '~~/server/lib/session'

export default defineEventHandler(async (event: H3Event<EventHandlerRequest>) => {
  return await getSession(await getOrCreateSession(event))
})
