import { uniqueNamesGenerator, adjectives, animals, colors } from 'unique-names-generator'

const generateFriendlyId = (): string => uniqueNamesGenerator({
  dictionaries: [adjectives, colors, animals],
  separator: '-',
  style: 'lowerCase',
})

export const isValidFriendlyId = (id: string): boolean => {
  if (!id) {
    return false
  }

  const parts = id.toLowerCase().split('-')

  if (parts.length < 3 || parts.length > 4) {
    return false
  }

  const [first, second, third, suffix] = parts

  const validBase = animals.includes(third) && colors.includes(second) && adjectives.includes(first)

  const validSuffix = !suffix || /^\d+$/.test(suffix)
  return validBase && validSuffix
}

/**
 * Generate a unique friendly ID with existence check.
 * Falls back to adding a numeric suffix if necessary.
 */
export const generateUniqueFriendlyId = async (checkExists: (id: string) => Promise<boolean>, maxAttempts = 10): Promise<string> => {
  for (let i = 0; i < maxAttempts; i++) {
    const id = generateFriendlyId()
    if (false === (await checkExists(id))) {
      return id
    }
  }

  for (let i = 0; i < 1000; i++) {
    const baseId = generateFriendlyId()
    const suffix = Math.floor(Math.random() * 10000)
    const candidate = `${baseId}-${suffix}`
    if (false === (await checkExists(candidate))) {
      return candidate
    }
  }

  throw new Error('Failed to generate unique friendly ID after multiple attempts')
}
