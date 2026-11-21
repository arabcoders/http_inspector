import type { MethodBadgeProps } from '~~/shared/types'

const methodColors: Record<string, MethodBadgeProps['color']> = {
    GET: 'info',
    POST: 'success',
    PUT: 'warning',
    PATCH: 'primary',
    DELETE: 'error',
}

/** Use the same method badge in request history and detail views. */
export const getMethodBadgeProps = (method: string): MethodBadgeProps => {
    const key = method.toUpperCase()
    return Object.hasOwn(methodColors, key)
        ? { color: methodColors[key] ?? 'neutral', variant: 'soft' }
        : { color: 'neutral', variant: 'outline' }
}

/** Honor a valid deep link; otherwise show the most recent request. */
export const selectRequest = <T extends { id: string }>(requests: readonly T[], query: unknown): T | null =>
    ('string' === typeof query ? requests.find(request => request.id === query) : undefined) ?? requests[0] ?? null

const formatXml = (xml: string): string => {
    let depth = 0
    return xml.replace(/>\s*</g, '>\n<').split('\n').map((line) => {
        if (line.startsWith('</')) {
            depth = Math.max(0, depth - 1)
        }
        const formatted = `${'  '.repeat(depth)}${line}`
        if (/^<[\w:.-]+(?:\s[^>]*)?>$/.test(line) && !line.endsWith('/>')) {
            depth += 1
        }
        return formatted
    }).join('\n')
}

/** Format known textual bodies for display without changing or evaluating their content. */
export const formatRequestBody = (text: string, contentType = ''): { content: string; language: string } => {
    const type = contentType.toLowerCase()
    if (type.includes('json')) {
        try {
            return { content: JSON.stringify(JSON.parse(text), null, 2), language: 'json' }
        } catch {
            return { content: text, language: 'json' }
        }
    }
    if (type.includes('xml')) {
        return { content: formatXml(text), language: 'xml' }
    }
    if (type.includes('html')) {
        return { content: text, language: 'html' }
    }
    if (type.includes('x-www-form-urlencoded')) {
        return {
            content: Array.from(new URLSearchParams(text), ([key, value]) => `${key}=${value}`).join('\n'),
            language: 'text',
        }
    }
    return { content: text, language: 'text' }
}
