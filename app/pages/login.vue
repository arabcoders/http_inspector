<template>
    <div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
        <div class="max-w-md w-full space-y-8">
            <div class="text-center">
                <div class="flex justify-center mb-4">
                    <div
                        class="inline-flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-purple-500 text-white shadow-lg">
                        <UIcon name="i-lucide-webhook" class="h-8 w-8" />
                    </div>
                </div>
                <h2 class="text-3xl font-bold text-gray-900 dark:text-white">
                    HTTP Inspector
                </h2>
                <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
                    Sign in to access your dashboard
                </p>
            </div>

            <UCard>
                <form class="space-y-6" @submit.prevent="handleLogin">
                    <!-- Error Message -->
                    <div v-if="error" class="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
                        <div class="flex">
                            <UIcon name="i-lucide-alert-circle" class="h-5 w-5 text-red-400" />
                            <div class="ml-3">
                                <p class="text-sm text-red-800 dark:text-red-400">
                                    {{ error }}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div class="space-y-2">
                        <label for="username" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Username
                        </label>
                        <UInput id="username" v-model="username" type="text" autocomplete="username" required
                            placeholder="Enter your username" class="w-full" size="lg" :disabled="loading"
                            icon="i-lucide-user" />
                    </div>

                    <div class="space-y-2">
                        <label for="password" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Password
                        </label>
                        <UInput id="password" v-model="password" type="password" autocomplete="current-password"
                            required class="w-full" placeholder="Enter your password" size="lg" :disabled="loading"
                            icon="i-lucide-lock" />
                    </div>

                    <UButton type="submit" color="primary" size="lg" block :loading="loading" :disabled="!username || !password">
                        {{ loading ? 'Signing in...' : 'Sign in' }}
                    </UButton>
                </form>
            </UCard>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { notify } from '~/composables/useNotificationBridge'

definePageMeta({ layout: false, middleware: [] })

const route = useRoute()

const username = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

const currentState = async () => {
    try {
        const response = await $fetch('/api/auth/status')

        // If auth is not required, redirect away from login page
        if (!response.required) {
            await navigateTo('/')
            return
        }

        // If auth is required and user is authenticated, redirect to returnUrl
        if (response.authenticated) {
            const returnUrl = route.query.returnUrl as string || '/'
            await navigateTo(returnUrl)
        }
    } catch {
        // Not authenticated, stay on login page
    }
}

const handleLogin = async () => {
    if (!username.value || !password.value) {
        error.value = 'Please enter both username and password'
        return
    }

    loading.value = true
    error.value = ''

    try {
        await $fetch('/api/auth/login', {
            method: 'POST',
            body: {
                username: username.value,
                password: password.value
            }
        })

        notify({
            title: 'Login successful',
            description: 'Welcome back!',
            color: 'success'
        })

        // Emit auth change event to reconnect SSE
        const eventBus = useGlobalEventBus()
        eventBus.emit('auth:changed')

        // Redirect to returnUrl or home
        const returnUrl = route.query.returnUrl as string || '/'
        await navigateTo(returnUrl)
    } catch (err: unknown) {
        console.error('Login failed:', err)
        const errorMessage = (err as { data?: { message?: string } })?.data?.message
        error.value = errorMessage || 'Invalid username or password'
    } finally {
        loading.value = false
    }
}

onMounted(async () => await currentState())
</script>
