<script setup lang="ts">
import type { EvalResult } from '@mineflayer-cp/shared'

interface Script { id: number, accountId: string | null, name: string, code: string, runOnSpawn: boolean }

const props = defineProps<{ id: string, online: boolean }>()
const run = useAction()

const scripts = ref<Script[]>([])
const draft = reactive({ id: undefined as number | undefined, name: '', code: '', runOnSpawn: false, shared: false })
const running = ref(false)
const result = ref<EvalResult>()

const EXAMPLE = `// Runs as an async function inside the bot process.
// In scope: bot (mineflayer Bot), log(...), sleep(ms), signal (AbortSignal).
log('standing at', bot.entity.position.floored())
return bot.players
`

async function refresh () {
  scripts.value = await run(() => $fetch<Script[]>(`/api/accounts/${props.id}/scripts`)) ?? scripts.value
}

function edit (script?: Script) {
  result.value = undefined
  Object.assign(draft, script
    ? { id: script.id, name: script.name, code: script.code, runOnSpawn: script.runOnSpawn, shared: script.accountId === null }
    : { id: undefined, name: '', code: EXAMPLE, runOnSpawn: false, shared: false })
}

async function save () {
  const { id, ...body } = draft
  const saved = await run(() => id === undefined
    ? $fetch<{ id: number }>(`/api/accounts/${props.id}/scripts`, { method: 'POST', body })
    : $fetch<{ id: number }>(`/api/accounts/${props.id}/scripts/${id}`, { method: 'PUT', body }), 'Script saved')
  if (saved) {
    draft.id = saved.id
    await refresh()
  }
}

async function remove () {
  if (draft.id === undefined) return
  const removed = await run(() => $fetch(`/api/accounts/${props.id}/scripts/${draft.id}`, { method: 'DELETE' }))
  if (removed) {
    edit()
    await refresh()
  }
}

async function execute () {
  running.value = true
  result.value = await run(() => $fetch<EvalResult>(`/bots/${props.id}/api/eval`, { method: 'POST', body: { code: draft.code, name: draft.name || 'script' } }))
  running.value = false
}

onMounted(async () => {
  edit()
  await refresh()
})
</script>

<template>
  <div class="grid gap-4 md:grid-cols-4">
    <div class="space-y-1">
      <UButton icon="i-lucide-plus" color="neutral" variant="subtle" block @click="edit()">
        New script
      </UButton>
      <UButton
        v-for="script in scripts"
        :key="script.id"
        color="neutral"
        :variant="draft.id === script.id ? 'soft' : 'ghost'"
        block
        class="justify-start"
        @click="edit(script)"
      >
        <span class="truncate">{{ script.name }}</span>
        <template #trailing>
          <UIcon v-if="script.runOnSpawn" name="i-lucide-zap" class="size-4 text-warning" />
          <UIcon v-if="script.accountId === null" name="i-lucide-users" class="size-4 text-muted" />
        </template>
      </UButton>
    </div>

    <div class="space-y-3 md:col-span-3">
      <UAlert
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        description="Scripts are not sandboxed: they run with full access to the bot process and its account."
      />
      <UFormField label="Name">
        <UInput v-model="draft.name" placeholder="my-script" class="w-full" />
      </UFormField>
      <UTextarea v-model="draft.code" :rows="16" spellcheck="false" class="w-full" :ui="{ base: 'font-mono text-xs' }" />
      <div class="flex flex-wrap items-center gap-4">
        <USwitch v-model="draft.runOnSpawn" label="Run every time the bot spawns" />
        <USwitch v-model="draft.shared" label="Available to all accounts" />
      </div>
      <div class="flex gap-2">
        <UButton icon="i-lucide-play" :loading="running" :disabled="!online || !draft.code" @click="execute">
          Run now
        </UButton>
        <UButton color="neutral" variant="subtle" :disabled="!draft.name" @click="save">
          Save
        </UButton>
        <UButton v-if="draft.id !== undefined" color="error" variant="ghost" icon="i-lucide-trash" @click="remove">
          Delete
        </UButton>
      </div>
      <UAlert
        v-if="result"
        :color="result.ok ? 'success' : 'error'"
        variant="subtle"
        :title="result.ok ? 'Returned' : 'Failed'"
      >
        <template #description>
          <pre class="whitespace-pre-wrap break-words font-mono text-xs">{{ result.ok ? result.result : result.error }}</pre>
        </template>
      </UAlert>
      <p class="text-xs text-muted">
        Output from log() appears in the console on the Overview tab.
      </p>
    </div>
  </div>
</template>
