import { defineEventHandler, type H3Event, type EventHandlerRequest } from 'h3'
import { randomUUID } from 'crypto'
import { useServerEvents } from '~~/server/lib/events'

export default defineEventHandler((event: H3Event<EventHandlerRequest>) => {
  type EventParams = { params?: Record<string, string> }
  const ctx = (event.context as unknown as EventParams) || {}
  const params = ctx.params || {}
  const token = params.token as string | undefined
  if (!token) {
    return new Response(JSON.stringify({ error: 'token not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    })
  }
  const id = randomUUID()

  let unsubscribe: (() => void) | null = null

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: string) => controller.enqueue(`data: ${data}\n\n`)
      const sse = useServerEvents()
      unsubscribe = sse.subscribeToToken(token, { id, send })
      controller.enqueue(':ok\n\n')
    },
    cancel() {
      if (unsubscribe) {
        unsubscribe()
      }
    },
  })

  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } })
})
