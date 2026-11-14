<script setup lang="ts">
const password = ref('')
const error = ref('')
const loading = ref(false)

async function submit () {
  loading.value = true
  error.value = ''
  try {
    await $fetch('/api/login', { method: 'POST', body: { password: password.value } })
    await navigateTo('/')
  } catch {
    error.value = 'Wrong password'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-[70vh] items-center justify-center">
    <UCard class="w-full max-w-sm">
      <template #header>
        <div class="flex items-center gap-2 font-semibold">
          <UIcon name="i-lucide-pickaxe" class="size-5 text-primary" />
          Mineflayer Control Plane
        </div>
      </template>
      <form class="space-y-4" @submit.prevent="submit">
        <UFormField label="Password" :error="error || undefined">
          <UInput v-model="password" type="password" autofocus autocomplete="current-password" class="w-full" />
        </UFormField>
        <UButton type="submit" block :loading="loading">
          Sign in
        </UButton>
      </form>
    </UCard>
  </div>
</template>
