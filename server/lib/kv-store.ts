import { getDb } from '../db'
import { keyValueStore } from '../db/schema'
import { eq } from 'drizzle-orm'

export const useKVStore = (dbFile?: string) => {
    const db = getDb(dbFile)

    /**
     * Normalize a key by trimming whitespace and converting to lowercase
     * 
     * @param key The key to normalize
     * 
     * @returns The normalized key
     */
    const normalizeKey = (key: string) => key.trim().toLowerCase()

    /**
     * Get a value from the key-value store with automatic deserialization
     * 
     * @template T The expected type of the value
     * @param key The key to retrieve
     * 
     * @returns The value associated with the key, or null if not found
     */
    const get = async <T = unknown>(key: string): Promise<T | null> => {
        key = normalizeKey(key)
        const result = await db
            .select({ value: keyValueStore.value })
            .from(keyValueStore)
            .where(eq(keyValueStore.key, key)).limit(1)

        if (!result.length) {
            return null
        }

        try {
            return JSON.parse(result[0].value) as T
        } catch {
            // If parsing fails, return as string (for backward compatibility)
            return result[0].value as T
        }
    };

    /**
     * Get a raw string value without deserialization
     * 
     * @param key The key to retrieve
     * 
     * @returns The raw string value associated with the key, or null if not found
     */
    const getRaw = async (key: string): Promise<string | null> => {
        key = normalizeKey(key)
        const result = await db
            .select({ value: keyValueStore.value })
            .from(keyValueStore)
            .where(eq(keyValueStore.key, key))
            .limit(1)

        return result.length ? result[0].value : null
    }

    /**
     * Set a value in the key-value store with automatic serialization
     * 
     * @template T The type of the value to store
     * @param key The key to set
     * @param value The value to store (will be JSON-stringified if not a string)
     * 
     * @returns void
     */
    const set = async <T = unknown>(key: string, value: T): Promise<void> => {
        key = normalizeKey(key)
        const now = new Date()
        const serializedValue = typeof value === 'string' ? value : JSON.stringify(value)

        // Use INSERT OR REPLACE to handle both insert and update
        await db
            .insert(keyValueStore)
            .values({
                key,
                value: serializedValue,
                createdAt: now,
                updatedAt: now,
            })
            .onConflictDoUpdate({
                target: keyValueStore.key,
                set: {
                    value: serializedValue,
                    updatedAt: now,
                },
            })
    };

    /**
     * Delete a key from the key-value store
     * 
     * @param key The key to delete
     */
    const _delete = async (key: string): Promise<void> => {
        await db.delete(keyValueStore).where(eq(keyValueStore.key, normalizeKey(key)))
    }

    /**
     * Check if a key exists in the key-value store
     * 
     * @param key The key to check
     * 
     * @returns true if the key exists, false otherwise
     */
    const has = async (key: string): Promise<boolean> => {
        return (await db
            .select({ value: keyValueStore.value })
            .from(keyValueStore)
            .where(eq(keyValueStore.key, normalizeKey(key)))
            .limit(1)).length > 0
    };

    /**
     * Get all keys from the key-value store
     * 
     * @returns Array of all keys
     */
    const getAllKeys = async (): Promise<string[]> => {
        const result = await db
            .select({ key: keyValueStore.key })
            .from(keyValueStore)

        return result.map(row => row.key)
    }

    /**
     * Get all key-value pairs with automatic deserialization
     * 
     * @template T The expected type of the values
     * 
     * @returns Record of all key-value pairs
     */
    const getAll = async <T = unknown>(): Promise<Record<string, T>> => {
        const result = await db
            .select({ key: keyValueStore.key, value: keyValueStore.value })
            .from(keyValueStore)

        return result.reduce((acc, row) => {
            try {
                acc[row.key] = JSON.parse(row.value) as T
            } catch {
                // If parsing fails, store as string
                acc[row.key] = row.value as T
            }
            return acc
        }, {} as Record<string, T>)
    };

    return { get, getRaw, set, delete: _delete, has, getAllKeys, getAll, }
}
