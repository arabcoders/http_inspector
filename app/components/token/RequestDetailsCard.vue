<template>
  <UCard>
    <template #header>
      <button type="button" class="w-full flex items-center justify-between text-left" @click="isOpen = !isOpen">
        <div class="flex flex-col gap-1">
          <span class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Request details
          </span>
          <span class="text-sm font-medium text-gray-900 dark:text-gray-100">
            Inspect headers, query parameters, and the stored body.
          </span>
        </div>
        <UIcon :name="isOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
          class="h-5 w-5 text-gray-500 dark:text-gray-400" />
      </button>
    </template>

    <div v-if="!request && isOpen" class="p-8 text-center text-gray-500 dark:text-gray-400">
      Select a request to view details.
    </div>

    <div v-else-if="isOpen && request" class="space-y-6 p-4 border-t border-gray-200 dark:border-gray-700">
      <div class="flex flex-wrap items-center gap-3">
        <UBadge v-bind="getMethodBadgeProps(request.method)" class="uppercase tracking-wide" size="md">
          {{ request.method }}
        </UBadge>

        <UBadge color="neutral" variant="outline" size="md">
          #{{ request.id }}
        </UBadge>

        <template v-if="clientIp">
          <UTooltip text="Copy client IP">
            <UBadge color="neutral" variant="subtle" size="md" role="button"
              class="flex items-center gap-1 select-none cursor-pointer" @click="handleCopyIp">
              <UIcon name="i-lucide-network" class="h-3 w-3" />
              {{ clientIp }}
            </UBadge>
          </UTooltip>
          <ULink :to="`https://who.is/whois-ip/ip-address/${clientIp}`" external target="_blank"
            class="text-xs text-primary underline-offset-2 hover:underline">
            Whois
          </ULink>
        </template>

        <UTooltip v-if="request.url" text="Copy full request URL">
          <UBadge color="neutral" variant="subtle" size="sm" class="flex items-center gap-1 select-none cursor-pointer"
            role="button" @click="handleCopyUrl">
            <UIcon name="i-lucide-link" class="h-3 w-3" />
            {{ request.url }}
          </UBadge>
        </UTooltip>
      </div>

      <div class="space-y-4">
        <div class="grid gap-3 lg:grid-cols-2">
          <UCard class="h-full">
            <template #header>
              <div class="flex w-full items-center gap-3 cursor-pointer select-none" role="button"
                @click="isQueryOpen = !isQueryOpen">
                <div class="flex flex-1 flex-col gap-0.5">
                  <span class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Query params
                  </span>
                  <span class="text-xs text-gray-500 dark:text-gray-400">{{ queryParams.length }} entries</span>
                </div>
                <div class="flex items-center gap-1">
                  <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-copy"
                    :disabled="!queryParams.length" @click.stop="copyAllQueryParams()" />
                  <UIcon :name="isQueryOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                    class="h-5 w-5 text-gray-400" />
                </div>
              </div>
            </template>

            <div v-if="isQueryOpen" class="space-y-3 border-t border-gray-200 px-0 py-3 dark:border-gray-800">
              <div v-if="!queryParams.length" class="px-4 text-xs text-gray-500 dark:text-gray-400">
                None present on this request.
              </div>
              <ul v-else class="divide-y divide-gray-200 px-0 dark:divide-gray-800">
                <li v-for="(param, index) in queryParams" :key="`${param.key}-${index}`"
                  class="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 transition-colors odd:bg-gray-50/70 dark:odd:bg-gray-800/40 hover:bg-primary-50/60 dark:hover:bg-primary-900/25">
                  <div class="grid grid-cols-[minmax(0,0.45fr)_minmax(0,1fr)] items-center gap-3">
                    <span class="font-medium truncate">
                      {{ param.key }}
                    </span>
                    <div class="flex items-center gap-2 min-w-0">
                      <button type="button"
                        class="flex-1 min-w-0 text-left text-gray-600 transition-colors hover:text-primary dark:text-gray-400"
                        @click="toggleKV(param.key, index)">
                        <span class="block"
                          :class="isExpanded(param.key, index) ? 'whitespace-normal break-all' : 'truncate'">
                          {{ param.value }}
                        </span>
                      </button>
                      <UButton variant="ghost" size="xs" icon="i-lucide-copy" aria-label="Copy query value"
                        @click.stop="copyText(param.value)" />
                    </div>
                  </div>
                </li>
              </ul>
            </div>
          </UCard>

          <UCard class="h-full">
            <template #header>
              <div class="flex w-full items-center gap-3 cursor-pointer select-none" role="button"
                @click="isHeadersOpen = !isHeadersOpen">
                <div class="flex flex-1 flex-col gap-0.5">
                  <span class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Headers
                  </span>
                  <span class="text-xs text-gray-500 dark:text-gray-400">{{ headers.length }} entries</span>
                </div>
                <div class="flex items-center gap-1">
                  <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-copy" :disabled="!headers.length"
                    @click.stop="copyAllHeaders()" />
                  <UIcon :name="isHeadersOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                    class="h-5 w-5 text-gray-400" />
                </div>
              </div>
            </template>

            <div v-if="isHeadersOpen" class="space-y-3 border-t border-gray-200 px-0 py-3 dark:border-gray-800">
              <div v-if="!headers.length" class="px-4 text-xs text-gray-500 dark:text-gray-400">
                No headers captured.
              </div>
              <ul v-else class="divide-y divide-gray-200 px-0 dark:divide-gray-800">
                <li v-for="(header, index) in headers" :key="`${header.key}-${index}`"
                  class="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 transition-colors odd:bg-gray-50/70 dark:odd:bg-gray-800/40 hover:bg-primary-50/60 dark:hover:bg-primary-900/25">
                  <div class="grid grid-cols-[minmax(0,0.45fr)_minmax(0,1fr)] items-center gap-3">
                    <span class="font-medium truncate">
                      {{ formatHeaderName(header.key) }}
                    </span>
                    <div class="flex items-center gap-2 min-w-0">
                      <button type="button"
                        class="flex-1 min-w-0 text-left text-gray-600 transition-colors hover:text-primary dark:text-gray-400"
                        @click="toggleKV(header.key, index)">
                        <span class="block"
                          :class="isExpanded(header.key, index) ? 'whitespace-normal break-all' : 'truncate'">
                          {{ header.value }}
                        </span>
                      </button>
                      <UButton variant="ghost" size="xs" icon="i-lucide-copy" aria-label="Copy header value"
                        @click.stop="copyText(header.value)" />
                    </div>
                  </div>
                </li>
              </ul>
            </div>
          </UCard>
        </div>
      </div>

      <section>
        <UCard>
          <template #header>
            <button type="button" class="w-full flex items-center justify-between text-left" @click="toggleBody">
              <div class="flex flex-col gap-1">
                <span class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Body
                </span>
                <span class="text-xs text-gray-500 dark:text-gray-400">
                  {{ bodySummary }}
                </span>
              </div>
              <div class="flex items-center gap-1">
                <div class="flex justify-end">
                  <UTooltip v-if="isBinary || bodyState" text="Download body">
                    <UButton type="button" variant="ghost" color="neutral" size="xs" icon="i-lucide-download"
                      @click.stop="navigateTo(`/api/token/${tokenId}/requests/${request.id}/body/download`, { external: true })" />
                  </UTooltip>
                </div>
                <UIcon :name="isBodyOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                  class="h-5 w-5 text-gray-500 dark:text-gray-400" />
              </div>
            </button>
          </template>

          <div v-if="isBodyOpen" class="space-y-4 p-4 border-t border-gray-200 dark:border-gray-700">
            <div
              class="max-h-[40vh] overflow-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
              <div v-if="bodyLoading"
                class="flex h-40 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                Loading body…
              </div>
              <div v-else-if="isBinary || bodyState?.isBinary"
                class="flex h-40 flex-col items-center justify-center gap-2 p-4 text-sm text-gray-500 dark:text-gray-400">
                <UIcon name="i-lucide-download" class="h-6 w-6" />
                <span>Binary body preview is not supported.</span>
              </div>
              <div v-else-if="!bodyState"
                class="flex h-40 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                Select a request to view body.
              </div>
              <CodeHighlight v-else :code="bodyState.content" :language="bodyState.language" />
            </div>
          </div>
        </UCard>
      </section>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import { computed, watch, ref } from 'vue'
import { copyText } from '~/utils'
import { notify } from '~/composables/useNotificationBridge'
import CodeHighlight from '~/components/CodeHighlight.vue'

type RequestSummary = {
  id: number
  method: string
  url: string
  headers: string
  clientIp?: string
  remoteIp?: string
  createdAt: string
  isBinary?: boolean
}

type QueryParam = { key: string; value: string }
type HeaderParam = { key: string; value: string }
type BodyState = { content: string, language: string, isBinary: boolean }

type BadgeColor = 'primary' | 'neutral' | 'info' | 'success' | 'warning' | 'error'
type BadgeVariant = 'solid' | 'soft' | 'outline' | 'subtle'
type MethodBadgeProps = { color: BadgeColor, variant: BadgeVariant }

const props = defineProps<{ request: RequestSummary | null, tokenId: string }>()

const isOpen = usePersistedState('request-details-open', true)
const bodyState = ref<BodyState | null>(null)
const bodyLoading = ref(false)
const isBodyOpen = usePersistedState('request-body-open', false)
const isQueryOpen = usePersistedState('request-query-open', true)
const isHeadersOpen = usePersistedState('request-headers-open', true)

const expandedKV = ref<Set<string>>(new Set())

const clientIp = computed(() => {
  if (!props.request) {
    return null
  }
  return props.request.remoteIp || props.request.clientIp || null
})

const bodySummary = computed(() => {
  if (!props.request) {
    return 'No request selected'
  }

  const headerLength = headers.value.find((header) => header.key.toLowerCase() === 'content-length')?.value
  const parsedHeaderLength = headerLength ? Number(headerLength) : NaN

  const loadedLength = typeof bodyState.value?.content === 'string' ? bodyState.value.content.length : 0

  const effectiveLength = Number.isFinite(parsedHeaderLength) && parsedHeaderLength >= 0
    ? parsedHeaderLength
    : loadedLength

  if (!effectiveLength) {
    return 'Empty body'
  }
  return `${effectiveLength.toLocaleString()} bytes`
})

const queryParams = computed((): QueryParam[] => {
  if (!props.request?.url) {
    return []
  }

  try {
    const baseUrl = import.meta.client ? window.location.origin : 'http://localhost'
    const url = new URL(props.request.url, baseUrl)
    return Array.from(url.searchParams.entries()).map(([key, value]) => ({ key, value }))
  } catch (err) {
    console.error('Failed to parse query params:', err)
    return []
  }
})

const headers = computed((): HeaderParam[] => {
  if (!props.request?.headers) {
    return []
  }

  try {
    const parsed = JSON.parse(props.request.headers) as Record<string, unknown>
    return Object.entries(parsed).map(([key, value]) => ({ key, value: String(value) }))
  } catch {
    return []
  }
})

const getMethodBadgeProps = (method: string): MethodBadgeProps => {
  const normalized = method.toUpperCase()
  const map: Record<string, MethodBadgeProps> = {
    GET: { color: 'info', variant: 'soft' },
    POST: { color: 'success', variant: 'soft' },
    PUT: { color: 'warning', variant: 'soft' },
    PATCH: { color: 'primary', variant: 'soft' },
    DELETE: { color: 'error', variant: 'soft' },
  }

  return map[normalized] ?? { color: 'neutral', variant: 'outline' }
}

const copyAllHeaders = async () => {
  if (!headers.value.length) {
    return ''
  }

  const toText = headers.value.map(({ key, value }) => `${formatHeaderName(key)}: ${value}`).join('\n')

  if (false === (await copyText(toText))) {
    return
  }

  notify({ title: 'Headers copied', description: 'All headers copied to clipboard', color: 'success' })
}

const copyAllQueryParams = async () => {
  if (!queryParams.value.length) {
    return ''
  }
  const toText = queryParams.value.map(({ key, value }) => `${key}=${encodeURIComponent(value)}`).join('&')

  if (false === (await copyText(toText))) {
    return
  }

  notify({
    title: 'Query params copied',
    description: 'All query parameters copied to clipboard',
    color: 'success',
  })
}

const isBinary = computed(() => Boolean(props.request?.isBinary))

watch([() => props.request?.id, isBodyOpen], async ([newId, isOpen]) => {
  if (!newId || !isOpen) {
    console.log('Not loading body - no request or not open')
    return
  }

  // If we already know it's binary, set state immediately without fetching
  if (isBinary.value) {
    bodyState.value = { content: '', language: 'text', isBinary: true }
    return
  }

  await loadBody(newId as number)
}, { immediate: false })

watch(() => props.request?.id, () => bodyState.value = null)

const toggleBody = () => isBodyOpen.value = !isBodyOpen.value

const toggleKV = (key: string, index: number) => {
  const id = `${key}-${index}`
  if (expandedKV.value.has(id)) {
    expandedKV.value.delete(id)
  } else {
    expandedKV.value.add(id)
  }
}

const isExpanded = (key: string, index: number): boolean => expandedKV.value.has(`${key}-${index}`)

const loadBody = async (requestId: number) => {
  bodyLoading.value = true
  try {
    const res = await fetch(`/api/token/${props.tokenId}/requests/${requestId}/body`)
    if (!res.ok) {
      if (404 === res.status) {
        notify({ title: 'Request not found', description: 'This request may have been deleted.', color: 'error' })
      }
      notify({ title: 'Failed to load request body', color: 'error' })
      bodyState.value = null
      return
    }

    const data = await res.json()

    if (data.isBinary) {
      bodyState.value = { content: '', language: 'text', isBinary: true }
      return
    }

    let text = data.text || ''
    const contentType = data.contentType || ''
    let language = 'text'

    if (contentType.includes('json')) {
      language = 'json'
      try {
        text = JSON.stringify(JSON.parse(text), null, 2)
      } catch {
        // If parsing fails, use original text
      }
    } else if (contentType.includes('xml')) {
      language = 'xml'
      try {
        text = formatXml(text)
      } catch {
        // If formatting fails, use original text
      }
    } else if (contentType.includes('html')) {
      language = 'html'
    } else if (contentType.includes('x-www-form-urlencoded')) {
      language = 'text'
      try {
        const params = new URLSearchParams(text)
        const entries = Array.from(params.entries())
        if (entries.length > 0) {
          text = entries.map(([key, value]) => `${key}=${value}`).join('\n')
        }
      } catch {
        // If parsing fails, use original text
      }
    }

    bodyState.value = { content: text || '(empty)', language, isBinary: false }
  } catch (error) {
    console.error('Failed to load body:', error)
    notify({ title: 'Error loading request body', description: 'Please try again', color: 'error' })
  } finally {
    bodyLoading.value = false
  }
}

const formatXml = (xml: string): string => {
  const PADDING = '  '
  const reg = /(>)(<)(\/*)/g
  let formatted = ''
  let pad = 0

  xml = xml.replace(reg, '$1\n$2$3')

  xml.split('\n').forEach((node) => {
    let indent = 0
    if (node.match(/.+<\/\w[^>]*>$/)) {
      indent = 0
    } else if (node.match(/^<\/\w/) && pad > 0) {
      pad -= 1
    } else if (node.match(/^<\w[^>]*[^/]>.*$/)) {
      indent = 1
    } else {
      indent = 0
    }

    formatted += PADDING.repeat(pad) + node + '\n'
    pad += indent
  })

  return formatted.trim()
}

const formatHeaderName = (name: string): string => {
  return name.replace(/_/g, '-').split('-').map(s => s.length ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s).join('-')
}

const handleCopyUrl = async () => {
  if (!props.request?.url) {
    return
  }

  let url = props.request.url

  if (import.meta.client && !props.request.url.startsWith('http://') && !props.request.url.startsWith('https://')) {
    let origin = window.location.origin
    if (!origin || origin === 'null') {
      origin = window.location.protocol + '//' + window.location.host
    }
    url = `${origin}${props.request.url.startsWith('/') ? '' : '/'}${props.request.url}`
  }

  if (true !== (await copyText(url))) {
    return
  }

  notify({ title: 'Request URL copied', description: url, color: 'success' })
}

const handleCopyIp = async () => {
  if (!clientIp.value) {
    return
  }

  if (false === (await copyText(clientIp.value))) {
    return
  }

  notify({ title: 'Client IP copied', description: clientIp.value, color: 'success' })
}
</script>
