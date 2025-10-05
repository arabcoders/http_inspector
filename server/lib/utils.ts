export const capitalizeHeader = (header: string): string => {
    return header.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join('-')
}

export const parseHeaders = (raw: string | null): Record<string, unknown> => {
    if (!raw) {
        return {}
    }

    try {
        const parsed = JSON.parse(raw) as Record<string, unknown>
        return parsed
    } catch {
        return {}
    }
}