import { defineEventHandler } from 'h3'
import { randomUUID } from 'crypto'
import { subscribeToToken, unsubscribeFromToken } from '~~/server/lib/events'

export default defineEventHandler((event) => {
  type EventParams = { params?: Record<string, string> }
  const ctx = (event.context as unknown as EventParams) || {}
  const params = ctx.params || {}
  const token = params.token as string | undefined
  if (!token) {
    return new Response(JSON.stringify({ error: 'token not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
  }
  const id = randomUUID()

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: string) => controller.enqueue(`data: ${data}\n\n`)
      subscribeToToken(token, { id, send })
      controller.enqueue(':ok\n\n')
    },
    cancel() {
      unsubscribeFromToken(token, id)
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  })
})
