import { defineEventHandler } from 'h3'
import { randomUUID } from 'crypto'
import { useServerEvents } from '../lib/events'
import { getOrCreateSession } from '../lib/session'

export default defineEventHandler(async (event) => {
  const sessionId = await getOrCreateSession(event)
  const id = randomUUID()
  let unsubscribe: (() => void) | null = null
  const stream = new ReadableStream({
    start(controller) {
      const send = (data: string) => controller.enqueue(`data: ${data}\n\n`)
      const sse = useServerEvents()
      unsubscribe = sse.subscribeToSession(sessionId, { id, send })
      controller.enqueue(':ok\n\n')
    },
    cancel() {
      if (unsubscribe) {
        unsubscribe()
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  })
})
