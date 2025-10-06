import { TextDecoder } from 'util'

const textDecoder = new TextDecoder('utf-8', { fatal: false })

export const isTextContentType = (contentType: string | null | undefined): boolean => {
  if (!contentType) {
    return false
  }
  const lower = contentType.toLowerCase()
  return (lower.startsWith('text/') || lower.includes('json') || lower.includes('xml') || lower.includes('html') || lower.includes('form-urlencoded'))
}

export const extractContentType = (headers: Record<string, unknown> | null | undefined): string | null => {
  if (!headers) {
    return null
  }
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value !== 'string') {
      continue
    }
    if (key.toLowerCase() === 'content-type') {
      return value
    }
  }
  return null
}

const allowedControlCodes = new Set([9, 10, 13])

export const detectBinaryBody = (body: Uint8Array | null | undefined, contentType: string | null | undefined): boolean => {
  if (!body || body.length === 0) {
    return false
  }

  for (let i = 0; i < body.length; i += 1) {
    const byte = body[i]
    if (!byte) {
      continue
    }

    if (0 === byte) {
      return true
    }

    if (byte < 32 && !allowedControlCodes.has(byte)) {
      return true
    }
  }

  let decoded: string
  try {
    decoded = textDecoder.decode(body)
  } catch {
    return true
  }

  if (decoded.includes('\uFFFD')) {
    return true
  }

  let controlCount = 0
  for (let i = 0; i < decoded.length; i += 1) {
    const code = decoded.charCodeAt(i)
    if (code < 32 && !allowedControlCodes.has(code)) {
      controlCount += 1
      if (controlCount > 2) {
        return true
      }
    }
  }

  return false === isTextContentType(contentType) && controlCount > 0
}
