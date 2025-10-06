import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useFileStorage } from '../../server/lib/file-storage'
import { join } from 'path'
import { mkdirSync, rmSync, existsSync } from 'fs'
import os from 'os'

describe('file-storage security', () => {
    // -- use system temp directory for testing.
    const storage = useFileStorage(join(os.tmpdir(), 'http-inspector-test-storage'))
    const testSessionId = 'test-session-security'
    const testTokenId = 'test-token-security'

    beforeEach(() => {
        const storageDir = storage.getStorageDir()
        if (!existsSync(storageDir)) {
            mkdirSync(storageDir, { recursive: true })
        }
    })

    afterEach(() => {
        const storageDir = storage.getStorageDir()
        const sessionDir = join(storageDir, testSessionId)
        if (existsSync(sessionDir)) {
            rmSync(sessionDir, { recursive: true, force: true })
        }
    })

    describe('path traversal protection', () => {
        it('should block path traversal in relative paths', async () => {
            const maliciousPaths = [
                '../../../etc/passwd',
                '..\\..\\..\\windows\\system32\\config\\sam',
                'session/../../../sensitive.txt',
                'session/token/../../escape.bin',
            ]

            for (const maliciousPath of maliciousPaths) {
                expect(() => storage.stream(maliciousPath)).toThrow(/Security|Invalid path/)
            }
        })

        it('should block null byte injection', async () => {
            const nullBytePaths = [
                'normal\x00../../etc/passwd',
                'file.bin\x00.txt',
            ]

            for (const path of nullBytePaths) {
                expect(() => storage.stream(path)).toThrow(/Security|Invalid path/)
            }
        })

        it('should sanitize sessionId with path traversal attempts', async () => {
            const maliciousSessionIds = [
                '../../../etc',
                '..\\..\\windows',
                'session/../escape',
            ]

            for (const sessionId of maliciousSessionIds) {
                const filePath = storage.generatePath(sessionId, testTokenId, 1)
                const storageDir = storage.getStorageDir()

                // Generated path should NOT escape storage directory
                expect(filePath).toContain(storageDir)
                expect(filePath).not.toContain('/../')
                expect(filePath).not.toContain('\\..\\')
            }
        })

        it('should sanitize tokenId with path traversal attempts', async () => {
            const maliciousTokenIds = [
                '../../../sensitive',
                '..\\..\\config',
                'token/../escape',
            ]

            for (const tokenId of maliciousTokenIds) {
                const filePath = storage.generatePath(testSessionId, tokenId, 1)
                const storageDir = storage.getStorageDir()

                // Generated path should NOT escape storage directory
                expect(filePath).toContain(storageDir)
                expect(filePath).not.toContain('/../')
                expect(filePath).not.toContain('\\..\\')
            }
        })
    })

    describe('dangerous character sanitization', () => {
        it('should remove null bytes from path components', async () => {
            const sessionId = 'session\x00malicious'
            const filePath = storage.generatePath(sessionId, testTokenId, 1)

            expect(filePath).not.toContain('\x00')
        })

        it('should handle Windows-unsafe characters', async () => {
            const dangerousTokenIds = [
                'token<script>',
                'token>alert',
                'token:colon',
                'token"quote',
                'token|pipe',
                'token?query',
                'token*wild',
            ]

            for (const tokenId of dangerousTokenIds) {
                const filePath = storage.generatePath(testSessionId, tokenId, 1)

                // Should not contain dangerous characters
                expect(filePath).not.toMatch(/[<>:"|?*]/)
            }
        })

        it('should remove leading dots to prevent hidden files', async () => {
            const hiddenIds = [
                '..hidden',
                '...very-hidden',
                '.bashrc',
            ]

            for (const id of hiddenIds) {
                const filePath = storage.generatePath(id, testTokenId, 1)
                const pathParts = filePath.split('/').pop() || ''

                // Final filename should not start with dots
                expect(pathParts).not.toMatch(/^\.\./)
            }
        })
    })

    describe('path validation', () => {
        it('should ensure generated paths are within storage directory', async () => {
            const storageDir = storage.getStorageDir()
            const filePath = storage.generatePath(testSessionId, testTokenId, 1)

            // Path must be within storage directory
            expect(filePath).toContain(storageDir)
            expect(filePath.startsWith(storageDir)).toBe(true)
        })

        it('should reject absolute paths in relative path operations', async () => {
            const absolutePaths = [
                '/etc/passwd',
                '/var/log/system.log',
                'C:\\Windows\\System32\\config\\sam',
            ]

            for (const absPath of absolutePaths) {
                // Absolute paths will fail validation because they're outside storage dir
                const result = storage.stream(absPath)
                // Should return null because file doesn't exist in our storage dir
                expect(result).toBeNull()
            }
        })

        it('should normalize paths before validation', async () => {
            // These should all be blocked even with normalization tricks
            const trickyPaths = [
                './session/../../escape',
                'session/./token/../../escape',
                'session//token//..//..//escape',
            ]

            for (const path of trickyPaths) {
                expect(() => storage.stream(path)).toThrow()
            }
        })
    })

    describe('legitimate operations should work', () => {
        it('should allow valid paths to work normally', async () => {
            const testBody = Buffer.from('test security data')

            const relativePath = await storage.save(testSessionId, testTokenId, 999, testBody)
            const retrieved = await storage.read(relativePath)

            expect(retrieved).toEqual(testBody)
        })

        it('should allow alphanumeric sessionIds and tokenIds', async () => {
            const validIds = [
                'session123',
                'abc-def-ghi',
                'token_with_underscore',
                'MixedCase123',
            ]

            for (const id of validIds) {
                const filePath = storage.generatePath(id, id, 1)
                expect(filePath).toBeTruthy()
                expect(filePath).toContain(storage.getStorageDir())
            }
        })

        it('should handle standard request IDs correctly', async () => {
            const requestIds = [1, 100, 999999, 0]

            for (const id of requestIds) {
                const filePath = storage.generatePath(testSessionId, testTokenId, id)
                expect(filePath).toContain(`${id}.bin`)
            }
        })

        it('should handle negative request IDs safely', async () => {
            // Should convert to absolute value
            const filePath = storage.generatePath(testSessionId, testTokenId, -123)
            const fileName = filePath.split('/').pop() || ''
            expect(fileName).toBe('123.bin')
            expect(fileName).not.toContain('-')
        })
    })

    describe('newline character bypasses', () => {
        it('should test newline in path traversal', () => {
            const newlineAttacks = [
                '../\n../\n../etc/passwd',
                '..\n..\n..\nwindows\nsystem32',
                'session\n../../../escape',
                'session/token\n../../bypass',
                '%0a../%0a../%0aetc/passwd',  // URL encoded newline
            ]

            for (const attack of newlineAttacks) {
                console.log(`Testing newline attack: ${JSON.stringify(attack)}`)
                try {
                    const result = storage.stream(attack)
                    console.log(`  Result: ${result ? 'Stream created' : 'null'}`)

                    // Should either throw or return null (file not found)
                    expect(result).toBeNull()
                } catch (error) {
                    console.log(`  Threw error: ${(error as Error).message}`)
                    // Error is also acceptable - means it was blocked
                    expect((error as Error).message).toMatch(/Security|Invalid path/)
                }
            }
        })

        it('should test carriage return bypass', () => {
            const crAttacks = [
                '../\r../\r../etc/passwd',
                'session\r\n../../../escape',
                'token\r\nmalicious',
            ]

            for (const attack of crAttacks) {
                console.log(`Testing CR attack: ${JSON.stringify(attack)}`)
                try {
                    const result = storage.stream(attack)
                    console.log(`  Result: ${result ? 'Stream created' : 'null'}`)
                    expect(result).toBeNull()
                } catch (error) {
                    console.log(`  Threw error: ${(error as Error).message}`)
                    expect((error as Error).message).toMatch(/Security|Invalid path/)
                }
            }
        })

        it('should test mixed whitespace bypass', () => {
            const whitespaceAttacks = [
                '../ \t\n ../etc/passwd',
                'session \r\n ../escape',
                '.. / .. / .. / etc',
            ]

            for (const attack of whitespaceAttacks) {
                console.log(`Testing whitespace attack: ${JSON.stringify(attack)}`)
                try {
                    const result = storage.stream(attack)
                    console.log(`  Result: ${result ? 'Stream created' : 'null'}`)
                    expect(result).toBeNull()
                } catch (error) {
                    console.log(`  Threw error: ${(error as Error).message}`)
                    expect((error as Error).message).toMatch(/Security|Invalid path/)
                }
            }
        })

        it('should test newline in sessionId/tokenId', () => {
            const testCases = [
                { sessionId: 'session\n../../../etc', tokenId: 'token', requestId: 1 },
                { sessionId: 'session', tokenId: 'token\r\n../escape', requestId: 1 },
                { sessionId: '../\netc', tokenId: 'passwd', requestId: 1 },
            ]

            for (const { sessionId, tokenId, requestId } of testCases) {
                console.log(`Testing newline in IDs: session="${sessionId}", token="${tokenId}"`)

                const filePath = storage.generatePath(sessionId, tokenId, requestId)
                console.log(`  Generated path: ${filePath}`)

                const storageDir = storage.getStorageDir()

                // Path should be within storage directory
                expect(filePath).toContain(storageDir)
                expect(filePath.startsWith(storageDir)).toBe(true)

                // Path should not contain literal newlines or parent directory refs
                expect(filePath).not.toContain('\n')
                expect(filePath).not.toContain('\r')
                expect(filePath).not.toMatch(/\/\.\.\//g)
                expect(filePath).not.toMatch(/\\\.\.\\/g)
            }
        })

        it('should test encoded newline variations', () => {
            const encodedAttacks = [
                '%0a../%0a../%0aetc',        // URL encoded \n
                '%0d../%0d../%0detc',        // URL encoded \r
                '%0d%0a../%0d%0a../%0d%0aetc', // URL encoded \r\n
                '\x0a..\x0a..\x0aetc',       // Hex encoded \n
                '\x0d..\x0d..\x0detc',       // Hex encoded \r
            ]

            for (const attack of encodedAttacks) {
                console.log(`Testing encoded newline: ${JSON.stringify(attack)}`)
                try {
                    const result = storage.stream(attack)
                    console.log(`  Result: ${result ? 'Stream created' : 'null'}`)
                    expect(result).toBeNull()
                } catch (error) {
                    console.log(`  Threw error: ${(error as Error).message}`)
                    expect((error as Error).message).toMatch(/Security|Invalid path/)
                }
            }
        })
    })

    describe('sanitization verification', () => {
        it('should show how newlines are handled in sanitization', () => {
            const testId = 'normal\nwith\nnewlines'
            const filePath = storage.generatePath(testId, 'token', 1)

            console.log(`Input ID: ${JSON.stringify(testId)}`)
            console.log(`Generated path: ${filePath}`)

            // Newlines should be removed/sanitized
            expect(filePath).not.toContain('\n')
            expect(filePath).not.toContain('\r')
        })

        it('should show path normalization effects', () => {
            const attacks = [
                'session/../etc',
                'session/./token/../etc',
                'session\n../etc',
            ]

            for (const attack of attacks) {
                const path = storage.generatePath(attack, 'token', 1)
                console.log(`Input: ${JSON.stringify(attack)} → Output: ${path}`)

                // Should not contain parent refs or newlines
                expect(path).not.toMatch(/\/\.\.\//g)
                expect(path).not.toContain('\n')
            }
        })
    })

    describe('error handling', () => {
        it('should handle errors gracefully without exposing paths', async () => {
            try {
                storage.stream('../../../etc/passwd')
                expect.fail('Should have thrown error')
            } catch (error) {
                const errorMessage = (error as Error).message
                // Should mention security but not leak actual system paths
                expect(errorMessage).toMatch(/Security|Invalid path/)
            }
        })
    })
})
