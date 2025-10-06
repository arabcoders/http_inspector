import { describe, it, expect } from 'vitest'
import { parseRawRequest, determineClientIp } from '../../server/lib/request-ingestion'

describe('request-ingestion shared utilities', () => {
  describe('parseRawRequest', () => {
    it('should parse a simple GET request', () => {
      const raw = 'GET /api/test HTTP/1.1\r\nHost: example.com\r\n\r\n'
      const result = parseRawRequest(raw)
      
      expect(result.method).toBe('GET')
      expect(result.url).toBe('/api/test')
      expect(result.headers).toEqual({ host: 'example.com' })
      expect(result.body).toBe('')
    })

    it('should parse a POST request with body', () => {
      const raw = 'POST /api/data HTTP/1.1\r\nHost: api.example.com\r\nContent-Type: application/json\r\n\r\n{"key":"value"}'
      const result = parseRawRequest(raw)
      
      expect(result.method).toBe('POST')
      expect(result.url).toBe('/api/data')
      expect(result.headers).toEqual({
        host: 'api.example.com',
        'content-type': 'application/json'
      })
      expect(result.body).toBe('{"key":"value"}')
    })

    it('should parse multiline body content', () => {
      const body = 'Line 1\r\nLine 2\r\nLine 3'
      const raw = `POST /test HTTP/1.1\r\nHost: example.com\r\n\r\n${body}`
      const result = parseRawRequest(raw)
      
      expect(result.body).toBe(body)
    })

    it('should normalize header names to lowercase', () => {
      const raw = 'GET /test HTTP/1.1\r\nHost: example.com\r\nContent-Type: text/plain\r\nX-Custom-Header: value\r\n\r\n'
      const result = parseRawRequest(raw)
      
      expect(result.headers).toEqual({
        host: 'example.com',
        'content-type': 'text/plain',
        'x-custom-header': 'value'
      })
    })

    it('should throw error for missing request line', () => {
      expect(() => parseRawRequest('')).toThrow('Invalid raw request: missing request line')
    })

    it('should throw error for malformed request line', () => {
      expect(() => parseRawRequest('INVALID\r\n\r\n')).toThrow('Invalid raw request: malformed request line')
    })

    it('should handle requests without body', () => {
      const raw = 'DELETE /api/resource HTTP/1.1\r\nHost: example.com\r\n\r\n'
      const result = parseRawRequest(raw)
      
      expect(result.body).toBe('')
    })

    it('should handle requests with full URLs', () => {
      const raw = 'GET http://example.com/api/test HTTP/1.1\r\nHost: example.com\r\n\r\n'
      const result = parseRawRequest(raw)
      
      expect(result.method).toBe('GET')
      expect(result.url).toBe('http://example.com/api/test')
      expect(result.headers).toEqual({ host: 'example.com' })
      expect(result.body).toBe('')
    })

    it('should handle requests with full HTTPS URLs', () => {
      const raw = 'POST https://api.example.com/webhook?token=abc HTTP/1.1\r\nHost: api.example.com\r\nContent-Type: application/json\r\n\r\n{"test":true}'
      const result = parseRawRequest(raw)
      
      expect(result.method).toBe('POST')
      expect(result.url).toBe('https://api.example.com/webhook?token=abc')
      expect(result.headers).toEqual({
        host: 'api.example.com',
        'content-type': 'application/json'
      })
      expect(result.body).toBe('{"test":true}')
    })

    it('should handle headers with spaces in values', () => {
      const raw = 'GET /test HTTP/1.1\r\nHost: example.com\r\nUser-Agent: Mozilla/5.0 (X11; Linux x86_64)\r\n\r\n'
      const result = parseRawRequest(raw)
      
      expect(result.headers['user-agent']).toBe('Mozilla/5.0 (X11; Linux x86_64)')
    })
  })

  describe('determineClientIp', () => {
    it('should extract IP from X-Forwarded-For', () => {
      const headers = { 'x-forwarded-for': '203.0.113.1, 198.51.100.1' }
      expect(determineClientIp(headers)).toBe('203.0.113.1')
    })

    it('should extract IP from X-Real-IP', () => {
      const headers = { 'x-real-ip': '203.0.113.1' }
      expect(determineClientIp(headers)).toBe('203.0.113.1')
    })

    it('should extract IP from CF-Connecting-IP', () => {
      const headers = { 'cf-connecting-ip': '203.0.113.1' }
      expect(determineClientIp(headers)).toBe('203.0.113.1')
    })

    it('should extract IP from Forwarded header', () => {
      const headers = { forwarded: 'for=203.0.113.1;proto=https' }
      expect(determineClientIp(headers)).toBe('203.0.113.1')
    })

    it('should prefer X-Forwarded-For over other headers', () => {
      const headers = {
        'x-forwarded-for': '203.0.113.1',
        'x-real-ip': '198.51.100.1',
        'cf-connecting-ip': '192.0.2.1'
      }
      expect(determineClientIp(headers)).toBe('203.0.113.1')
    })

    it('should return null if no IP headers present', () => {
      const headers = { 'content-type': 'application/json' }
      expect(determineClientIp(headers)).toBeNull()
    })

    it('should handle X-Vercel-Forwarded-For', () => {
      const headers = { 'x-vercel-forwarded-for': '203.0.113.1, 198.51.100.1' }
      expect(determineClientIp(headers)).toBe('203.0.113.1')
    })

    it('should trim whitespace from IPs', () => {
      const headers = { 'x-forwarded-for': '  203.0.113.1  ,  198.51.100.1  ' }
      expect(determineClientIp(headers)).toBe('203.0.113.1')
    })
  })
})
