<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { AccountInput, BotState } from '@mineflayer-cp/shared'

type Row = AccountInput & { desiredState: 'running' | 'stopped', state: BotState | null }

const run = useAction()
const accounts = ref<Row[]>([])
const loaded = ref(false)
const adding = ref(false)

const columns: TableColumn<Row>[] = [
  { accessorKey: 'label', header: 'Account' },
  { accessorKey: 'state', header: 'Status' },
  { id: 'vitals', header: 'Health / Food' },
  { accessorKey: 'host', header: 'Server' },
  { id: 'actions', header: '' }
]

async function refresh () {
  const rows = await run(() => $fetch<Row[]>('/api/accounts'))
  if (rows) accounts.value = rows
  loaded.value = true
}

async function act (id: string, action: 'start' | 'stop' | 'restart') {
  await run(() => $fetch(`/api/accounts/${id}/${action}`, { method: 'POST' }))
  await refresh()
}

let timer: ReturnType<typeof setInterval>
onMounted(() => {
  void refresh()
  timer = setInterval(refresh, 5000)
})
onUnmounted(() => clearInterval(timer))
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-semibold">
        Accounts
      </h1>
      <UButton icon="i-lucide-plus" @click="adding = true">
        Add account
      </UButton>
    </div>

    <UCard v-if="loaded && accounts.length === 0">
      <div class="py-8 text-center text-muted">
        No accounts yet. Add one to start a bot.
      </div>
    </UCard>

    <UTable v-else :data="accounts" :columns="columns" :loading="!loaded" class="rounded-lg border border-default">
      <template #label-cell="{ row }">
        <NuxtLink :to="`/accounts/${row.original.id}`" class="font-medium text-highlighted hover:underline">
          {{ row.original.label }}
        </NuxtLink>
        <div class="text-xs text-muted">
          {{ row.original.state?.username ?? row.original.username }}
        </div>
      </template>
      <template #state-cell="{ row }">
        <StatusBadge :state="row.original.state" :desired-state="row.original.desiredState" />
      </template>
      <template #vitals-cell="{ row }">
        <span v-if="row.original.state?.health != null" class="tabular-nums">
          {{ Math.round(row.original.state.health) }} / {{ row.original.state.food }}
        </span>
        <span v-else class="text-muted">-</span>
      </template>
      <template #host-cell="{ row }">
        {{ row.original.host }}<span v-if="row.original.port !== 25565">:{{ row.original.port }}</span>
      </template>
      <template #actions-cell="{ row }">
        <div class="flex justify-end gap-1">
          <UButton v-if="row.original.desiredState === 'stopped'" icon="i-lucide-play" color="neutral" variant="ghost" aria-label="Start" @click="act(row.original.id, 'start')" />
          <UButton v-else icon="i-lucide-square" color="neutral" variant="ghost" aria-label="Stop" @click="act(row.original.id, 'stop')" />
          <UButton icon="i-lucide-rotate-cw" color="neutral" variant="ghost" aria-label="Restart" @click="act(row.original.id, 'restart')" />
        </div>
      </template>
    </UTable>

    <AccountFormModal v-model:open="adding" @saved="refresh" />
  </div>
</template>
