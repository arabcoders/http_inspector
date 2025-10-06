import { defineEventHandler, createError, type H3Event, type EventHandlerRequest, setResponseHeader, getQuery } from 'h3'
import { useDatabase } from '~~/server/lib/db'
import { getOrCreateSession } from '~~/server/lib/session'
import { parseHeaders, capitalizeHeader } from '~~/server/lib/utils'

export default defineEventHandler(async (event: H3Event<EventHandlerRequest>) => {
  const sessionId = await getOrCreateSession(event)
  type EventParams = { params?: Record<string, string> }
  const ctx = (event.context as unknown as EventParams) || {}
  const params = ctx.params || {}
  const id = Number(params.id)
  const tokenId = params.token
  const query = getQuery(event)
  const db = useDatabase()

  if (!tokenId) {
    throw createError({ statusCode: 400, message: 'Token ID is required' })
  }

  if (Number.isNaN(id)) {
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

  const headers = parseHeaders(row.headers as string)
  const isBinary = row.isBinary ?? false

  const url = row.url || '/'
  const method = row.method || 'GET'

  let fullUrl = url
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    const host = headers.host || headers.Host || 'localhost'
    const protocol = headers['x-forwarded-proto'] || 'http'
    fullUrl = `${protocol}://${host}${url}`
  }

  const statusLine = `${method} ${process.env.RAW_FULL_URL ? fullUrl : url} HTTP/1.1`
  const headerLines = Object.entries(headers).map(
    ([key, value]) => `${capitalizeHeader(key)}: ${String(value)}`
  ).join('\r\n')

  setResponseHeader(event, 'Content-Type', 'text/plain; charset=utf-8')

  const filename = `r-${tokenId}-${id}-raw.http`
  const disposition = (isBinary || 'true' === query.download || '1' === query.download) ? 'attachment' : 'inline'
  setResponseHeader(event, 'Content-Disposition', `${disposition}; filename="${filename}"`)

  const httpHeader = `${statusLine}\r\n${headerLines}${headerLines ? '\r\n' : ''}\r\n`

  return new Promise<void>((resolve, reject) => {
    const res = event.node.res

    res.write(httpHeader, 'utf8', err => {
      if (err) {
        reject(err)
        return
      }

      if (0 === row.contentLength) {
        res.end()
        resolve()
        return
      }

      db.requests.streamBody(sessionId, tokenId, id).then(bodyStream => {
        if (!bodyStream) {
          res.end()
          resolve()
          return
        }

        bodyStream.stream.on('error', (streamErr: Error) => reject(streamErr))
        bodyStream.stream.on('end', () => {
          res.end()
          resolve()
        })
        bodyStream.stream.pipe(res, { end: false })
      }).catch(reject)
    })
  })
})
