import { mkdir, writeFile, readFile, unlink, rm } from 'fs/promises'
import { createReadStream, existsSync } from 'fs'
import { join, dirname, resolve, normalize, sep } from 'path'
import type { ReadStream } from 'fs'

/**
 * File-based storage for request bodies
 * 
 * Stores request bodies as files on disk in organized directory structure:
 * {storage-dir}/{sessionId}/{tokenId}/{requestId}.bin
 * 
 * @param path - Base storage directory (optional, defaults to ./var)
 */
export const useFileStorage = (path: string | undefined = undefined) => {
    const basePath = path || process.env.STORAGE_PATH || join(process.cwd(), 'var')

    /**
     * Get the base storage directory
     * 
     * @returns Absolute path to storage directory
     */
    const getStorageDir = (): string => resolve(join(basePath, 'files'))

    /**
     * Validate that a path is within the storage directory
     * Prevents path traversal attacks (LFI/directory traversal)
     * 
     * @param filePath - Absolute file path to validate
     * 
     * @throws Error if path is outside storage directory
     * @returns Normalized absolute path
     */
    const validatePath = (filePath: string): string => {
        const storageDir = getStorageDir()
        const normalizedPath = resolve(normalize(filePath))

        // Ensure the resolved path is within storage directory
        if (!normalizedPath.startsWith(storageDir + sep) && normalizedPath !== storageDir) {
            throw new Error(`[FileStorage] Security: Path traversal attempt blocked: ${filePath}`)
        }

        return normalizedPath
    }

    /**
     * Sanitize path component to remove dangerous characters
     * 
     * @param component - Path component to sanitize
     * 
     * @returns Sanitized string safe for filesystem use
     */
    const sanitizePathComponent = (component: string): string => {
        // Ensure we have a string
        const str = String(component)
        
        // Remove null bytes, path traversal sequences, newlines, and other dangerous chars
        return str
            .replace(/\0/g, '')     // Null bytes
            .replace(/\n/g, '')     // Line feeds (LF)
            .replace(/\r/g, '')     // Carriage returns (CR)
            .replace(/\t/g, '')     // Tabs
            .replace(/\.\./g, '')   // Parent directory references
            .replace(/[<>:"|?*]/g, '') // Windows-unsafe chars
            .replace(/^\.+/, '')    // Leading dots
            .trim()
    }

    /**
     * Generate file path for a request body
     * 
     * @param sessionId - Session ID (UUID)
     * @param tokenId - Token ID (user-visible token string)
     * @param requestId - Request ID (UUID)
     * 
     * @returns Absolute file path (validated)
     */
    const generatePath = (sessionId: string, tokenId: string, requestId: string): string => {
        const storageDir = getStorageDir()

        const safeSessionId = sanitizePathComponent(sessionId)
        const safeTokenId = sanitizePathComponent(tokenId)
        const safeRequestId = sanitizePathComponent(requestId)

        const filePath = join(storageDir, safeSessionId, safeTokenId, `${safeRequestId}.bin`)

        // Validate the generated path
        return validatePath(filePath)
    }

    /**
     * Convert absolute path to relative path from storage dir
     * 
     * @param absolutePath - Absolute file path
     * 
     * @returns Relative path from storage directory
     */
    const toRelativePath = (absolutePath: string): string => {
        const storageDir = getStorageDir()
        const validated = validatePath(absolutePath)
        return validated.substring(storageDir.length + 1)
    }

    /**
     * Convert relative path to absolute path (with security validation)
     * 
     * @param relativePath - Relative path from storage directory
     * 
     * @throws Error if path traversal detected
     * @returns Validated absolute file path
     */
    const toAbsolutePath = (relativePath: string): string => {
        const storageDir = getStorageDir()

        // Check for obvious path traversal attempts
        if (relativePath.includes('..') || relativePath.includes('\0')) {
            throw new Error(`[FileStorage] Security: Invalid path detected: ${relativePath}`)
        }

        const filePath = join(storageDir, relativePath)

        // Validate the resulting path is within storage dir
        return validatePath(filePath)
    }

    /**
     * Ensure storage directory exists
     * 
     * @returns Promise that resolves when directory is ready
     */
    const ensureStorageDir = async (): Promise<void> => {
        const storageDir = getStorageDir()
        if (false === existsSync(storageDir)) {
            await mkdir(storageDir, { recursive: true })
        }
    }

    /**
     * Save request body to disk
     * 
     * @param sessionId - Session ID (UUID)
     * @param tokenId - Token ID (user-visible token string)
     * @param requestId - Request ID (UUID)
     * @param body - Request body buffer
     * 
     * @returns Relative file path (relative to storage dir)
     */
    const save = async (
        sessionId: string,
        tokenId: string,
        requestId: string,
        body: Buffer
    ): Promise<string> => {
        const filePath = generatePath(sessionId, tokenId, requestId)
        const dir = dirname(filePath)

        await mkdir(dir, { recursive: true })
        await writeFile(filePath, body)

        return toRelativePath(filePath)
    }

    /**
     * Read request body from disk into memory
     * 
     * @param relativePath - Relative path from storage directory
     * 
     * @throws Error if path traversal detected
     * @returns Buffer or null if not found
     */
    const read = async (relativePath: string): Promise<Buffer | null> => {
        const filePath = toAbsolutePath(relativePath)

        if (false === existsSync(filePath)) {
            return null
        }

        return await readFile(filePath)
    }

    /**
     * Create a read stream for request body
     * More efficient for large files - streams data instead of loading into memory
     * 
     * @param relativePath - Relative path from storage directory
     * 
     * @throws Error if path traversal detected
     * @returns ReadStream or null if file not found
     */
    const stream = (relativePath: string): ReadStream | null => {
        const filePath = toAbsolutePath(relativePath)

        if (false === existsSync(filePath)) {
            return null
        }

        return createReadStream(filePath)
    }

    /**
     * Delete request body file from disk
     * 
     * @param relativePath - Relative path from storage directory
     * 
     * @returns Promise that resolves when file is deleted
     */
    const _delete = async (relativePath: string): Promise<void> => {
        try {
            const filePath = toAbsolutePath(relativePath)

            if (true === existsSync(filePath)) {
                await unlink(filePath)
            }
        } catch (error) {
            console.error('[FileStorage] Error deleting file:', error)
        }
    }

    /**
     * Delete all request bodies for a session
     * 
     * @param sessionId - Session ID
     * 
     * @returns Promise that resolves when directory is deleted
     */
    const deleteSession = async (sessionId: string): Promise<void> => {
        try {
            const storageDir = getStorageDir()
            const sessionDir = join(storageDir, sessionId)

            if (true === existsSync(sessionDir)) {
                await rm(sessionDir, { recursive: true, force: true })
            }
        } catch (error) {
            console.error('[FileStorage] Error deleting session:', error)
        }
    }

    /**
     * Delete all request bodies for a token
     * 
     * @param sessionId - Session ID
     * @param tokenId - Token ID
     * 
     * @returns Promise that resolves when directory is deleted
     */
    const deleteToken = async (sessionId: string, tokenId: string): Promise<void> => {
        try {
            const storageDir = getStorageDir()
            const tokenDir = join(storageDir, sessionId, tokenId)

            if (true === existsSync(tokenDir)) {
                await rm(tokenDir, { recursive: true, force: true })
            }
        } catch (error) {
            console.error('[FileStorage] Error deleting token:', error)
        }
    }

    /**
     * Check if a file exists
     * 
     * @param relativePath - Relative path from storage directory
     * 
     * @returns true if file exists, false otherwise
     */
    const exists = (relativePath: string): boolean => {
        try {
            const filePath = toAbsolutePath(relativePath)
            return existsSync(filePath)
        } catch {
            return false
        }
    }

    return {
        ensureStorageDir,
        save,
        read,
        stream,
        delete: _delete,
        deleteSession,
        deleteToken,
        exists,
        // Expose for advanced usage
        getStorageDir,
        generatePath,
    }
}

