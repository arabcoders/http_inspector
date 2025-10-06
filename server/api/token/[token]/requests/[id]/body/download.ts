import { defineEventHandler, createError, type H3Event, type EventHandlerRequest, setResponseHeader, getQuery } from 'h3'
import { extractContentType } from '~~/shared/content'
import { getRequest, getRequestBody, getToken } from '~~/server/lib/db'
import { getOrCreateSession } from '~~/server/lib/session'
import { parseHeaders } from '~~/server/lib/utils'
import { Readable } from 'stream'

export default defineEventHandler(async (event: H3Event<EventHandlerRequest>) => {
  const sessionId = await getOrCreateSession(event)

  type EventParams = { params?: Record<string, string> }
  const ctx = (event.context as unknown as EventParams) || {}
  const params = ctx.params || {}
  const id = Number(params.id)
  const tokenId = params.token
  const query = getQuery(event)

  if (!tokenId) {
    throw createError({ statusCode: 400, message: 'Token ID is required' })
  }

  if (Number.isNaN(id)) {
    throw createError({ statusCode: 400, message: 'Invalid request ID' })
  }

  const token = await getToken(sessionId, tokenId)
  if (!token) {
    throw createError({ statusCode: 404, message: 'Token not found' })
  }

  const row = await getRequest(sessionId, tokenId, id)
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

  const body = await getRequestBody(sessionId, tokenId, id)
  if (!body) {
    throw createError({ statusCode: 404, message: 'Request body not found' })
  }

  return new Promise<void>((resolve, reject) => {
    const res = event.node.res
    const stream = Readable.from(Buffer.from(body))
    stream.on('error', (streamErr) => reject(streamErr))
    stream.on('end', () => {
      res.end()
      resolve()
    })
    stream.pipe(res, { end: false })
  })
})
