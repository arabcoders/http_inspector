import { describe, expect, it } from 'vitest'
import { formatRequestBody, getMethodBadgeProps, selectRequest } from '~/utils/request-presentation'

describe('request selection', () => {
  const requests = [{ id: 'latest' }, { id: 'older' }]

  it('follows the latest request when none is pinned', () => {
    expect(selectRequest(requests, undefined)?.id).toBe('latest')
    expect(selectRequest([{ id: 'incoming' }, ...requests], undefined)?.id).toBe('incoming')
  })

  it('honors a deep link when newer requests arrive', () => {
    expect(selectRequest([{ id: 'incoming' }, ...requests], 'older')?.id).toBe('older')
  })

  it('falls back to the latest when the selection is missing or ambiguous', () => {
    expect(selectRequest(requests, 'deleted')?.id).toBe('latest')
    expect(selectRequest(requests, ['latest', 'older'])?.id).toBe('latest')
    expect(selectRequest([], 'older')).toBeNull()
  })
})

describe('request presentation', () => {
  it('assigns a consistent badge to known and unknown methods', () => {
    expect(getMethodBadgeProps('post')).toEqual({ color: 'success', variant: 'soft' })
    expect(getMethodBadgeProps('PROPFIND')).toEqual({ color: 'neutral', variant: 'outline' })
  })

  it('formats JSON and preserves malformed JSON as captured', () => {
    expect(formatRequestBody('{"ok":true}', 'application/problem+JSON')).toEqual({
      content: '{\n  "ok": true\n}', language: 'json',
    })
    expect(formatRequestBody('{', 'application/json')).toEqual({ content: '{', language: 'json' })
  })

  it('shows decoded form entries without dropping duplicate keys', () => {
    expect(formatRequestBody('foo=a+b&foo=c', 'application/x-www-form-urlencoded')).toEqual({
      content: 'foo=a b\nfoo=c', language: 'text',
    })
  })

  it('indents XML and keeps plain text and HTML content intact', () => {
    expect(formatRequestBody('<root><leaf /></root>', 'application/xml')).toEqual({
      content: '<root>\n  <leaf />\n</root>', language: 'xml',
    })
    expect(formatRequestBody('<b>text</b>', 'text/html')).toEqual({ content: '<b>text</b>', language: 'html' })
    expect(formatRequestBody('hello')).toEqual({ content: 'hello', language: 'text' })
  })
})
