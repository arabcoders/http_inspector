/**
 * Session entity representing a user session
 */
export interface Session {
    id: string // UUID - internal primary key, also used for cookies
    friendlyId: string // User-visible friendly ID
    createdAt: Date
    lastAccessedAt: Date
}

/**
 * Token entity for webhook endpoints
 */
export interface Token {
    id: string
    friendlyId: string | null
    sessionId: string // References session.id (UUID)
    createdAt: Date
    responseEnabled: boolean
    responseStatus: number
    responseHeaders: string | null
    responseBody: string | null
}

/**
 * Request entity representing an HTTP request
 * Note: body is stored on disk at bodyPath location
 */
export interface Request {
    id: string // UUID - internal primary key
    tokenId: string // References token.id (UUID)
    sessionId: string // References session.id (UUID)
    method: string
    url: string
    headers: string // JSON string
    contentType: string
    contentLength: number
    isBinary: boolean
    clientIp: string
    remoteIp: string
    bodyPath: string | null // Relative path to body file
    createdAt: Date
}

/**
 * Key-Value store entity for persistent data
 */
export interface KeyValue {
    key: string
    value: string
    createdAt: Date
    updatedAt: Date
}

// Insert types with optional fields for database operations
export type InsertSession = Omit<Session, 'createdAt'> & { createdAt?: Date }
export type InsertToken = Omit<Token, 'createdAt' | 'responseEnabled' | 'responseStatus'> & {
    createdAt?: Date
    responseEnabled?: boolean
    responseStatus?: number
}
export type InsertRequest = Omit<Request, 'createdAt' | 'contentLength' | 'bodyPath'> & {
    contentLength?: number
    bodyPath?: string | null
    createdAt?: Date
}
export type InsertKeyValue = Omit<KeyValue, 'createdAt' | 'updatedAt'> & {
    createdAt?: Date
    updatedAt?: Date
}

// ============================================================================
// Extended/Computed Types
// ============================================================================

/**
 * Token with request count for display purposes (database type)
 */
export type TokenWithCount = Token & { _count?: { requests: number } }

/**
 * Token list item for frontend display (serialized dates)
 */
export type TokenListItem = Pick<Token, 'id' | 'friendlyId'> & {
    createdAt?: string
    _count?: { requests: number }
}

/**
 * Request summary for list display (serialized dates, without body buffer)
 */
export type RequestSummary = Omit<Request, 'body' | 'createdAt'> & {
    createdAt: string
}

/**
 * Token response configuration (subset with parsed headers)
 */
export type TokenResponseConfig = Pick<Token, 'id' | 'createdAt' | 'responseEnabled' | 'responseStatus' | 'responseBody'> & {
    responseHeaders: Record<string, string> | null
}

// ============================================================================
// API Request/Response Types
// ============================================================================

/**
 * Token creation response
 */
export type TokenCreationResponse = Pick<Token, 'id'>

/**
 * Standard API success response
 */
export type ApiSuccessResponse = { ok: true }

/**
 * Token update request body
 */
export interface TokenUpdateRequest {
    enabled?: boolean
    status?: number
    headers?: Record<string, string> | null
    body?: string | null
}

// ============================================================================
// Event System Types
// ============================================================================

/**
 * SSE connection status
 */
export type SSEConnectionStatus = 'connected' | 'connecting' | 'disconnected'

/**
 * SSE channel types
 */
export type ChannelType = 'session' | 'token'

/**
 * Subscriber interface for SSE connections
 */
export interface Subscriber {
    id: string
    send: (data: string) => void
}

/**
 * Generic SSE event payload structure
 */
export interface SSEEventPayload {
    type: string
    [key: string]: unknown
}

/**
 * Server event type map for type-safe event publishing and subscription
 */
export interface ServerEventMap {
    'request.received': { token: string; request: Request }
    'request.deleted': { token: string; requestId: string }
    'request.cleared': { token: string }
    'token.created': { token: Pick<Token, 'id' | 'friendlyId' | 'createdAt'> }
    'token.deleted': { token: { id: string } }
    'token.cleared': Record<string, never>
    'token.response.updated': { token: { id: string; responseEnabled: boolean; responseStatus: number } }
}

/**
 * Client-side SSE event map (subset of server events with serialized data)
 */
export interface SSEEventMap {
    'request.received': {
        type: 'request.received'
        token: string
        request: Record<string, unknown>
        requestId: string
    }
    'request.deleted': {
        type: 'request.deleted'
        token: string
        requestId: string
    }
    'request.cleared': {
        type: 'request.cleared'
        token: string
    }
    'token.created': {
        type: 'token.created'
        token: Pick<Token, 'id' | 'friendlyId' | 'createdAt'>
    }
    'token.deleted': {
        type: 'token.deleted'
    }
}

// Event type utilities
export type ServerEventType = keyof ServerEventMap
export type ServerEventPayload<T extends ServerEventType> = ServerEventMap[T]
export type SSEEventType = keyof SSEEventMap
export type SSEEventListener<T extends SSEEventType = SSEEventType> = (payload: SSEEventMap[T]) => void
export type SSEGenericEventListener = (payload: SSEEventPayload) => void
export type SSEStatusListener = (status: SSEConnectionStatus) => void

// ============================================================================
// Notification Types
// ============================================================================

export type NotificationVariant = 'default' | 'success' | 'error' | 'warning' | 'info'
export type NotificationType = 'toast' | 'browser'
export type ToastColor = 'success' | 'error' | 'warning' | 'info' | 'neutral' | 'primary' | 'secondary'

export interface NotificationPayload {
    title: string
    description?: string
    variant?: NotificationVariant
    color?: ToastColor
    icon?: string
    timeout?: number
    actions?: { label: string; onClick: () => void }[]
}

// ============================================================================
// UI Component Types
// ============================================================================

export type BadgeColor = 'primary' | 'neutral' | 'info' | 'success' | 'warning' | 'error'
export type BadgeVariant = 'solid' | 'soft' | 'outline' | 'subtle'

export interface MethodBadgeProps {
    color: BadgeColor
    variant: BadgeVariant
}

export interface QueryParam {
    key: string
    value: string
}

export interface HeaderParam {
    key: string
    value: string
}

export interface BodyState {
    content: string
    language: string
    isBinary: boolean
}
