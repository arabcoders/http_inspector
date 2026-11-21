<script setup lang="ts">
import { useSessionStore } from '~/stores/session'

definePageMeta({ layout: false })
useHead({ title: 'Sign in' })

const route = useRoute()
const router = useRouter()
const sessionStore = useSessionStore()
const { data: auth } = sessionStore.useAuthStatus()
const { mutateAsync: login, isPending } = sessionStore.useLogin()
const username = ref('')
const password = ref('')
const error = ref('')

const destination = computed(() => {
  const url = route.query.returnUrl
  return typeof url === 'string' && /^\/(?![/\\])/.test(url) ? url : '/'
})

onMounted(() => {
  watch(auth, (status) => {
    if (status && (!status.required || status.authenticated)) {
      void router.replace(status.required ? destination.value : '/')
    }
  }, { immediate: true })
})

const submit = async () => {
  error.value = ''
  try {
    await login({ username: username.value, password: password.value })
    await router.replace(destination.value)
  } catch (err) {
    console.error('Sign in failed:', err)
    error.value = (err as { data?: { message?: string } })?.data?.message || 'Could not sign in. Check your credentials and try again.'
  }
}
</script>

<template>
  <main class="inspector-shell flex min-h-dvh items-center justify-center">
    <div class="w-full max-w-md px-4 py-8 sm:px-6">
      <UCard :ui="{ header: 'p-5 sm:p-6', body: 'p-5 sm:p-6' }">
        <template #header>
          <div class="flex items-start gap-3">
            <span class="inspector-section-icon size-11"><img src="/favicon.svg" alt="" class="size-7"></span>
            <div>
              <p class="text-xs font-medium text-muted">HTTP Inspector</p>
              <h1 class="text-2xl font-semibold tracking-tight text-highlighted">Sign in</h1>
              <p class="mt-1 text-sm text-toned">Access your request capture workspace.</p>
            </div>
          </div>
        </template>
        <form class="space-y-4" @submit.prevent="submit">
          <UAlert v-if="error" role="alert" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="error" />
          <UFormField label="Username" required>
            <UInput v-model="username" class="w-full" icon="i-lucide-user" autocomplete="username"
              :disabled="isPending" required />
          </UFormField>
          <UFormField label="Password" required>
            <UInput v-model="password" class="w-full" icon="i-lucide-lock" type="password" autocomplete="current-password"
              :disabled="isPending" required />
          </UFormField>
          <UButton type="submit" label="Sign in" trailing-icon="i-lucide-arrow-right" block
            :loading="isPending" :disabled="!username || !password" />
        </form>
      </UCard>
    </div>
  </main>
</template>
