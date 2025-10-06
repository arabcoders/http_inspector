import { insertRequest } from './db'
import type { Request } from '~~/shared/types'
import { useServerEvents } from './events'

const selectFirstIp = (input?: string | null) => {
    if (!input) {
        return null
    }

    for (const part of input.split(',')) {
        const candidate = part.trim()
        if (candidate) {
            return candidate
        }
    }
    return null
}

const extractFromForwarded = (forwarded?: string | null) => {
    if (!forwarded) {
        return null
    }
    for (const segment of forwarded.split(',')) {
        const trimmed = segment.trim()
        const match = /for=([^;]+)/i.exec(trimmed)
        if (match?.[1]) {
            const cleaned = match[1].replace(/["[\]]/g, '').trim()
            if (cleaned) {
                return cleaned
            }
        }
    }
    return null
}

export function determineClientIp(headers: Record<string, string>) {
    const forwardedFor = selectFirstIp(headers['x-forwarded-for'])
    if (forwardedFor) {
        return forwardedFor
    }

    const realIp = headers['x-real-ip'] || headers['x-client-ip'] || headers['true-client-ip']
    if (realIp) {
        return realIp
    }

    const cfIp = headers['cf-connecting-ip'] || headers['fastly-client-ip']
    if (cfIp) {
        return cfIp
    }

    const forwarded = extractFromForwarded(headers['forwarded'])
    if (forwarded) {
        return forwarded
    }

    const vercelIp = headers['x-vercel-forwarded-for']
    if (vercelIp) {
        return selectFirstIp(vercelIp)
    }
    return null
}

/**
 * Core logic for ingesting a request into the system.
 * 
 * @param sessionId The session ID associated with the token
 * @param tokenId The token ID used for this request
 * @param method HTTP method (e.g., GET, POST)
 * @param headers HTTP headers as a key-value map
 * @param body Optional request body as a Buffer
 * @param url The full URL of the request
 * @param fallbackClientIp The fallback client IP if no headers provide one
 * @param overrideClientIp Optional override for client IP (e.g., from ingest endpoint)
 * @param overrideRemoteIp Optional override for remote IP (e.g., from ingest endpoint)
 * 
 * @returns The created Request record
 */
export async function ingestRequest(
    sessionId: string,
    tokenId: string,
    method: string,
    headers: Record<string, string>,
    body: Buffer | null,
    url: string,
    fallbackClientIp: string,
    overrideClientIp?: string | null,
    overrideRemoteIp?: string | null
): Promise<Request> {
    const trustProxy = 'true' === process.env.TRUST_PROXY_CLIENT_IP

    const clientIp = overrideClientIp || fallbackClientIp
    const remoteIp = overrideRemoteIp || (trustProxy ? determineClientIp(headers) : null) || clientIp

    const created = await insertRequest(
        sessionId,
        tokenId,
        method,
        headers,
        body,
        url,
        clientIp,
        remoteIp
    )

    useServerEvents().publish(sessionId, 'request.received', { token: tokenId, request: created })

    return created
}

/**
 * Parse raw HTTP request text in the format:
 * METHOD URL HTTP/1.1
 * 
 * Header1: Value1
 * Header2: Value2
 * 
 * Body content here
 * 
 * Supports both full URLs (http://example.com/path) and path-only URLs (/path)
 * 
 * @param rawText The full raw HTTP request text
 * 
 * @returns An object containing method, url, headers, and body
 */
export function parseRawRequest(rawText: string): { method: string, url: string, headers: Record<string, string>, body: string, } {
    const lines = rawText.split('\r\n')

    // Parse the request line (e.g., "POST /api/test HTTP/1.1" or "GET http://example.com/api/test HTTP/1.1")
    const requestLine = lines[0]
    if (!requestLine) {
        throw new Error('Invalid raw request: missing request line, possibly using LF instead of CRLF')
    }

    const requestLineParts = requestLine.match(/^(\S+)\s+(\S+)\s+HTTP\/[\d.]+$/)
    if (!requestLineParts) {
        throw new Error('Invalid raw request: malformed request line.')
    }

    const method = requestLineParts[1]
    const url = requestLineParts[2]
    
    // Note: URL can be either a path (/api/test) or a full URL (http://example.com/api/test)
    // Both formats are supported and stored as-is

    // Parse headers
    const headers: Record<string, string> = {}
    let lineIndex = 1
    let foundEmptyLine = false

    while (lineIndex < lines.length) {
        const line = lines[lineIndex]

        // Empty line marks the end of headers
        if ('' === line) {
            foundEmptyLine = true
            lineIndex++
            break
        }

        // Parse header (e.g., "Content-Type: application/json")
        const headerMatch = line.match(/^([^:]+):\s*(.*)$/)
        if (headerMatch) {
            const headerName = headerMatch[1].trim()
            const headerValue = headerMatch[2].trim()
            headers[headerName.toLowerCase()] = headerValue
        }

        lineIndex++
    }

    // Parse body (everything after the empty line)
    const body = foundEmptyLine ? lines.slice(lineIndex).join('\r\n') : ''

    return { method, url, headers, body }
}
