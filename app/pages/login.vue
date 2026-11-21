<script setup lang="ts">
import { useSessionStore } from '~/stores/session'

definePageMeta({ layout: false })
useHead({ title: 'Sign in' })

const route = useRoute()
const router = useRouter()
const { theme, cycleTheme } = useTheme()
const sessionStore = useSessionStore()
const { data: auth } = sessionStore.useAuthStatus()
const { mutateAsync: login, isPending } = sessionStore.useLogin()
const username = ref('')
const password = ref('')
const passwordVisible = ref(false)
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
  if (isPending.value) {
    return
  }
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
  <main class="inspector-shell flex min-h-dvh items-center justify-center px-4 py-8 sm:px-6">
    <div class="w-full max-w-md space-y-6">
      <header class="space-y-3 text-center">
        <span class="mx-auto inline-flex size-14 items-center justify-center rounded-md border border-default bg-elevated/80 shadow-sm">
          <img src="/favicon.svg" alt="" class="size-10 object-contain">
        </span>
        <h1 class="text-2xl font-semibold text-highlighted">HTTP Inspector</h1>
      </header>

      <UAlert v-if="error" role="alert" color="error" variant="soft" icon="i-lucide-circle-alert"
        title="Authentication failed" :description="error" />

      <UCard :ui="{ header: 'px-5 py-4 sm:px-6', body: 'p-5 sm:p-6' }">
        <template #header>
          <div class="flex items-center justify-between gap-3">
            <h2 class="text-base font-semibold text-highlighted">Sign in</h2>
            <ClientOnly>
              <UTooltip :text="`Theme: ${theme.label}`">
                <UButton type="button" color="neutral" variant="ghost" size="sm" square :icon="theme.icon"
                  :aria-label="`Change theme (currently ${theme.label})`" @click="cycleTheme" />
              </UTooltip>
              <template #fallback>
                <span class="size-7" aria-hidden="true" />
              </template>
            </ClientOnly>
          </div>
        </template>
        <form method="post" @submit.prevent="submit">
          <fieldset class="space-y-5" :disabled="isPending">
            <UFormField label="Username" name="username" required>
              <UInput id="login-username" v-model="username" name="username" type="text" icon="i-lucide-user-round"
                autocomplete="username" autofocus required class="w-full" />
            </UFormField>
            <UFormField label="Password" name="password" required>
              <UInput id="login-password" v-model="password" :type="passwordVisible ? 'text' : 'password'"
                name="password" icon="i-lucide-lock-keyhole" autocomplete="current-password" required class="w-full">
                <template #trailing>
                  <UTooltip :text="passwordVisible ? 'Hide password' : 'Show password'">
                    <UButton type="button" color="neutral" variant="ghost" square size="xs"
                      :icon="passwordVisible ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                      :aria-label="passwordVisible ? 'Hide password' : 'Show password'" :aria-pressed="passwordVisible"
                      @click="passwordVisible = !passwordVisible" />
                  </UTooltip>
                </template>
              </UInput>
            </UFormField>
            <UButton type="submit" color="primary" variant="solid" block size="md" icon="i-lucide-log-in" label="Sign in"
              :loading="isPending" />
          </fieldset>
        </form>
      </UCard>
    </div>
  </main>
</template>
