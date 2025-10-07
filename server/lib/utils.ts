const validateUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Check if a string is a valid UUID
 * 
 * @param str - Input string
 * 
 * @returns True if valid UUID, false otherwise
 */
export const isUUID = (str: string): boolean => validateUUID.test(str)

/**
 * Capitalize HTTP header name
 * 
 * @param header - Header name
 * 
 * @returns Capitalized header name
 */
export const capitalizeHeader = (header: string): string => {
    return header.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join('-')
}

/**
 * Parse JSON string to object safely.
 * 
 * @param raw - Raw JSON string
 * 
 * @returns Parsed object or empty object if parsing fails
 */
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