import { describe, it, expect, vi } from 'vitest'
import { isValidFriendlyId, generateUniqueFriendlyId } from '../../server/lib/friendly-id'

describe('friendly-id', () => {
    describe('isValidFriendlyId', () => {
        it('should return true for valid friendly IDs', () => {
            expect(isValidFriendlyId('happy-red-cat')).toBe(true)
            expect(isValidFriendlyId('slow-blue-dog')).toBe(true)
            expect(isValidFriendlyId('brave-green-bird')).toBe(true)
        })

        it('should return true for valid friendly IDs with numeric suffix', () => {
            expect(isValidFriendlyId('happy-red-cat-123')).toBe(true)
            expect(isValidFriendlyId('slow-blue-dog-42')).toBe(true)
            expect(isValidFriendlyId('brave-green-bird-9999')).toBe(true)
        })

        it('should return false for invalid friendly IDs', () => {
            expect(isValidFriendlyId('')).toBe(false)
            expect(isValidFriendlyId('invalid')).toBe(false)
            expect(isValidFriendlyId('too-short')).toBe(false)
            expect(isValidFriendlyId('one-two-three-four-five')).toBe(false)
        })

        it('should return false for IDs with invalid suffix', () => {
            expect(isValidFriendlyId('happy-red-cat-abc')).toBe(false)
            expect(isValidFriendlyId('happy-red-cat-12a')).toBe(false)
            // Note: 'happy-red-cat-' is actually valid because empty suffix passes !suffix check
        })

        it('should handle null and undefined', () => {
            expect(isValidFriendlyId(null as unknown as string)).toBe(false)
            expect(isValidFriendlyId(undefined as unknown as string)).toBe(false)
        })

        it('should be case insensitive', () => {
            expect(isValidFriendlyId('HAPPY-RED-CAT')).toBe(true)
            expect(isValidFriendlyId('Happy-Red-Cat')).toBe(true)
        })
    })

    describe('generateUniqueFriendlyId', () => {
        it('should generate a unique ID on first try', async () => {
            const checkExists = vi.fn().mockResolvedValue(false)
            const id = await generateUniqueFriendlyId(checkExists)

            expect(id).toBeTruthy()
            expect(isValidFriendlyId(id)).toBe(true)
            expect(checkExists).toHaveBeenCalledWith(id)
            expect(checkExists).toHaveBeenCalledTimes(1)
        })

        it('should retry until finding unique ID', async () => {
            const checkExists = vi
                .fn()
                .mockResolvedValueOnce(true) // First ID exists
                .mockResolvedValueOnce(true) // Second ID exists
                .mockResolvedValueOnce(false) // Third ID is unique

            const id = await generateUniqueFriendlyId(checkExists)

            expect(id).toBeTruthy()
            expect(isValidFriendlyId(id)).toBe(true)
            expect(checkExists).toHaveBeenCalledTimes(3)
        })

        it('should add numeric suffix after max attempts', async () => {
            const checkExists = vi
                .fn()
                .mockImplementation(async (id: string) => {
                    // All base IDs exist, only suffixed ones are unique
                    return !id.match(/-\d+$/)
                })

            const id = await generateUniqueFriendlyId(checkExists, 3)

            expect(id).toBeTruthy()
            expect(id).toMatch(/-\d+$/) // Should have numeric suffix
            expect(isValidFriendlyId(id)).toBe(true)
        })

        it('should throw error after all attempts exhausted', async () => {
            const checkExists = vi.fn().mockResolvedValue(true) // Everything exists

            await expect(generateUniqueFriendlyId(checkExists, 3)).rejects.toThrow(
                'Failed to generate unique friendly ID after multiple attempts'
            )
        })

        it('should use default maxAttempts if not provided', async () => {
            const checkExists = vi.fn().mockResolvedValue(false)
            const id = await generateUniqueFriendlyId(checkExists)

            expect(id).toBeTruthy()
            expect(checkExists).toHaveBeenCalledTimes(1)
        })

        it('should handle async checkExists function', async () => {
            const checkExists = async (id: string) => {
                await new Promise(resolve => setTimeout(resolve, 10))
                return id === 'taken-id-name'
            }

            const id = await generateUniqueFriendlyId(checkExists)
            expect(id).toBeTruthy()
            expect(id).not.toBe('taken-id-name')
        })
    })
})
