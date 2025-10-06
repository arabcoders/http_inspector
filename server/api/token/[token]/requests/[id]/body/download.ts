import { defineEventHandler, createError, type H3Event, type EventHandlerRequest, setResponseHeader, getQuery } from 'h3'
import { extractContentType } from '~~/shared/content'
import { useDatabase } from '~~/server/lib/db'
import { getOrCreateSession } from '~~/server/lib/session'
import { parseHeaders } from '~~/server/lib/utils'

export default defineEventHandler(async (event: H3Event<EventHandlerRequest>) => {
  const sessionId = await getOrCreateSession(event)
  const db = useDatabase()

  type EventParams = { params?: Record<string, string> }
  const ctx = (event.context as unknown as EventParams) || {}
  const params = ctx.params || {}
  const id = params.id
  const tokenId = params.token
  const query = getQuery(event)

  if (!tokenId) {
    throw createError({ statusCode: 400, message: 'Token ID is required' })
  }

  if (!id) {
    throw createError({ statusCode: 400, message: 'Invalid request ID' })
  }

  const token = await db.tokens.get(sessionId, tokenId)
  if (!token) {
    throw createError({ statusCode: 404, message: 'Token not found' })
  }

  const row = await db.requests.get(sessionId, tokenId, id)
  if (!row) {
    throw createError({ statusCode: 404, message: 'Request not found' })
  }

  if (0 === row.contentLength) {
    throw createError({ statusCode: 404, message: 'Request body not found' })
  }

  let ext = 'bin'
  const headers = parseHeaders(row.headers as string)
  const contentType = row.contentType ?? extractContentType(headers)

  if (contentType) {
    setResponseHeader(event, 'Content-Type', contentType)
    const parts = contentType.split('/')
    if (parts.length === 2) {
      ext = parts[1].split(';')[0] || 'bin'
      if (ext.length > 5) {
        ext = 'bin'
      }
    }
  }

  const filename = `r-${tokenId}-${id}-body.${ext}`
  const isBinary = row.isBinary ?? false
  const disposition = (isBinary || 'true' === query.download || '1' === query.download) ? 'attachment' : 'inline'
  setResponseHeader(event, 'Content-Disposition', `${disposition}; filename="${filename}"`)

  const bodyStream = await db.requests.streamBody(sessionId, tokenId, id)
  if (!bodyStream) {
    throw createError({ statusCode: 404, message: 'Request body not found' })
  }

  return new Promise<void>((resolve, reject) => {
    const res = event.node.res
    bodyStream.stream.on('error', (streamErr: Error) => reject(streamErr))
    bodyStream.stream.on('end', () => {
      res.end()
      resolve()
    })
    bodyStream.stream.pipe(res, { end: false })
  })
})
