import { defineEventHandler } from 'h3'
import { randomUUID } from 'crypto'
import { subscribeToSession, unsubscribeFromSession } from '../lib/events'
import { getOrCreateSession } from '../lib/session'

export default defineEventHandler(async (event) => {
  const sessionId = await getOrCreateSession(event)
  const id = randomUUID()

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: string) => controller.enqueue(`data: ${data}\n\n`)
      subscribeToSession(sessionId, { id, send })
      controller.enqueue(':ok\n\n')
    },
    cancel() {
      unsubscribeFromSession(sessionId, id)
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  })
})
