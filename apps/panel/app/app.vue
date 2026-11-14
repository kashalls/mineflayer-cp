<script setup lang="ts">
const route = useRoute()

async function logout () {
  await $fetch('/api/logout', { method: 'POST' })
  await navigateTo('/login')
}
</script>

<template>
  <UApp>
    <header v-if="route.path !== '/login'" class="border-b border-default">
      <UContainer class="flex h-14 items-center justify-between">
        <NuxtLink to="/" class="flex items-center gap-2 font-semibold">
          <UIcon name="i-lucide-pickaxe" class="size-5 text-primary" />
          Mineflayer Control Plane
        </NuxtLink>
        <div class="flex items-center gap-1">
          <UColorModeButton />
          <UButton icon="i-lucide-log-out" color="neutral" variant="ghost" aria-label="Sign out" @click="logout" />
        </div>
      </UContainer>
    </header>
    <UContainer class="py-6">
      <NuxtPage />
    </UContainer>
  </UApp>
</template>
