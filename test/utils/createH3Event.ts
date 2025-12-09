import type { H3Event } from 'h3'

// lightweight test-friendly H3 event shape that covers what our handlers use
export type TestH3Event = {
  node: {
    req: {
      method?: string
      headers?: Record<string, string>
      url?: string
      socket?: { remoteAddress?: string }
    }
    res: {
      statusCode?: number
      setHeader?: (k: string, v: string | string[]) => void
      getHeader?: (k: string) => string | string[] | undefined
      appendHeader?: (k: string, v: string) => void
      removeHeader?: (k: string) => void
      end?: (d?: unknown) => void
    }
  }
  context?: Record<string, unknown>
  cookies?: Record<string, string>  // Add cookies support
  query?: Record<string, string | string[]>  // Add query params support
  [k: string]: unknown
}

export function createH3Event(overrides?: Partial<TestH3Event> | Partial<H3Event>): H3Event {
  // Minimal H3Event-like object sufficient for our handlers in tests
  const headerStore = new Map<string, string | string[]>()
  const cookieStore: Record<string, string> = {}
  
  const base = {
    // mark as event for some libs that check this flag
    __is_event__: true,
    method: 'GET',
    node: {
      req: {
        method: 'GET',
        headers: {} as Record<string, string>,
        socket: { remoteAddress: '127.0.0.1' },
      },
      res: {
        statusCode: 0,
        setHeader: (key: string, value: string | string[]) => {
          headerStore.set(key.toLowerCase(), value)
          // Track cookies set via Set-Cookie header
          if ('set-cookie' === key.toLowerCase()) {
            const cookies = Array.isArray(value) ? value : [value]
            for (const cookie of cookies) {
              const match = cookie.match(/^([^=]+)=([^;]+)/)
              if (match) {
                cookieStore[match[1]] = match[2]
              }
            }
          }
        },
        getHeader: (key: string) => headerStore.get(key.toLowerCase()),
        appendHeader: (key: string, value: string) => {
          const normalized = key.toLowerCase()
          const existing = headerStore.get(normalized)
          if (!existing) {
            headerStore.set(normalized, value)
          } else if (Array.isArray(existing)) {
            headerStore.set(normalized, [...existing, value])
          } else {
            headerStore.set(normalized, [existing, value])
          }
        },
        removeHeader: (key: string) => {
          headerStore.delete(key.toLowerCase())
        },
        end: (_d?: unknown) => {},
      },
    },
    context: {},
    _handled: false,
  } as unknown as H3Event

  if (!overrides) return base

  const maybeTestEvent = overrides as Partial<TestH3Event>

  if (maybeTestEvent.node) {
    if (maybeTestEvent.node.req) {
      base.node.req = { ...base.node.req, ...maybeTestEvent.node.req } as typeof base.node.req
    }
    if (maybeTestEvent.node.res) {
      base.node.res = { ...base.node.res, ...maybeTestEvent.node.res } as typeof base.node.res
    }
  }

  // Handle cookies from overrides
  if (maybeTestEvent.cookies) {
    Object.assign(cookieStore, maybeTestEvent.cookies)
    // Build Cookie header from provided cookies
    const cookieHeader = Object.entries(maybeTestEvent.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ')
    if (cookieHeader) {
      base.node.req.headers = { ...base.node.req.headers, cookie: cookieHeader }
    }
  }

  // Cast to mutable to allow method assignment
  const mutableBase = base as { method: string } & typeof base
  mutableBase.method = (base.node.req.method || 'GET').toUpperCase() as typeof base.method

  // Handle query parameters from overrides
  if (maybeTestEvent.query) {
    // Store query params on the event for getQuery() to access
    Object.assign(base, { __query: maybeTestEvent.query })
  }

  const { node: _node, cookies: _cookies, query: _query, ...rest } = maybeTestEvent
  return Object.assign(mutableBase, rest, { _cookieStore: cookieStore }) as H3Event
}

export default createH3Event
