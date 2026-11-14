<script setup lang="ts">
import type { BotState } from '@mineflayer-cp/shared'

const props = defineProps<{ state: BotState | null, desiredState: 'running' | 'stopped' }>()

const badge = computed(() => {
  if (props.desiredState === 'stopped') return { label: 'Stopped', color: 'neutral' as const }
  switch (props.state?.status) {
    case 'online': return { label: 'Online', color: 'success' as const }
    case 'awaiting_login': return { label: 'Sign-in required', color: 'warning' as const }
    case 'connecting': return { label: 'Connecting', color: 'info' as const }
    case 'disconnected': return { label: 'Reconnecting', color: 'warning' as const }
    case 'stopped': return { label: 'Disconnected', color: 'error' as const }
    default: return { label: 'Starting', color: 'neutral' as const }
  }
})
</script>

<template>
  <UBadge :color="badge.color" variant="subtle">
    {{ badge.label }}
  </UBadge>
</template>
