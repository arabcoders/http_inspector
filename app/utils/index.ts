export const copyText = async (text: string): Promise<boolean> => {
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // fallthrough to legacy fallback
    }
  }

  if (typeof document !== 'undefined') {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'absolute'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)
    textarea.select()
    try {
      const successful = document.execCommand('copy')
      document.body.removeChild(textarea)
      return successful
    } catch {
      document.body.removeChild(textarea)
      return false
    }
  }
  return false
}

export const shortSlug = (id: string) => {
  if (!id) {
    return ''
  }

  if (id.length <= 12) {
    return id
  }

  return `${id.slice(0, 8)}…${id.slice(-4)}`
}

export const formatDate = (iso?: string) => {
  try {
    if (!iso) {
      return ''
    }
    return new Date(iso).toLocaleString()
  } catch {
    return ''
  }
}