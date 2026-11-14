<script setup lang="ts">
import type { AccountInput, Behaviours, BotState } from '@mineflayer-cp/shared'

type Account = AccountInput & { desiredState: 'running' | 'stopped', behaviours: Behaviours, state: BotState | null }

const id = useRoute().params.id as string
const run = useAction()
const account = ref<Account>()
const state = ref<BotState | null>(null)
const editing = ref(false)
const confirmingDelete = ref(false)
const tab = ref('overview')

const online = computed(() => account.value?.desiredState === 'running' && state.value?.status === 'online')
const origin = window.location.origin
const mcpUrl = `${origin}/mcp/${id}`
const mcpCommand = `claude mcp add --transport http minecraft-${id} ${mcpUrl} --header "Authorization: Bearer <MCP token>"`

const tabs = [
  { label: 'Overview', value: 'overview', icon: 'i-lucide-activity', slot: 'overview' as const },
  { label: 'Viewer', value: 'viewer', icon: 'i-lucide-box', slot: 'viewer' as const },
  { label: 'Inventory', value: 'inventory', icon: 'i-lucide-backpack', slot: 'inventory' as const },
  { label: 'Behaviours', value: 'behaviours', icon: 'i-lucide-sliders-horizontal', slot: 'behaviours' as const },
  { label: 'Scripts', value: 'scripts', icon: 'i-lucide-code', slot: 'scripts' as const },
  { label: 'MCP', value: 'mcp', icon: 'i-lucide-plug', slot: 'mcp' as const }
]

async function refresh () {
  const loaded = await run(() => $fetch<Account>(`/api/accounts/${id}`))
  if (!loaded) return navigateTo('/')
  account.value = loaded
  state.value = loaded.state
}

async function act (action: 'start' | 'stop' | 'restart' | 'forget-login') {
  await run(() => $fetch(`/api/accounts/${id}/${action}`, { method: 'POST' }))
  await refresh()
}

async function remove () {
  const removed = await run(() => $fetch(`/api/accounts/${id}`, { method: 'DELETE' }))
  if (removed) await navigateTo('/')
}

async function copy (text: string) {
  await navigator.clipboard.writeText(text)
  useToast().add({ title: 'Copied', color: 'success' })
}

onMounted(refresh)
</script>

<template>
  <div v-if="account" class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <UButton to="/" icon="i-lucide-arrow-left" color="neutral" variant="ghost" aria-label="Back to accounts" />
        <div>
          <div class="flex items-center gap-2">
            <h1 class="text-xl font-semibold">
              {{ account.label }}
            </h1>
            <StatusBadge :state="state" :desired-state="account.desiredState" />
          </div>
          <div class="text-sm text-muted">
            {{ state?.username ?? account.username }} on {{ account.host }}:{{ account.port }}
          </div>
        </div>
      </div>
      <div class="flex gap-2">
        <UButton v-if="account.desiredState === 'stopped'" icon="i-lucide-play" @click="act('start')">
          Start
        </UButton>
        <UButton v-else icon="i-lucide-square" color="neutral" variant="subtle" @click="act('stop')">
          Stop
        </UButton>
        <UButton icon="i-lucide-rotate-cw" color="neutral" variant="subtle" @click="act('restart')">
          Restart
        </UButton>
        <UButton icon="i-lucide-pencil" color="neutral" variant="subtle" @click="editing = true">
          Edit
        </UButton>
        <UButton icon="i-lucide-trash" color="error" variant="subtle" aria-label="Delete account" @click="confirmingDelete = true" />
      </div>
    </div>

    <UAlert
      v-if="state?.msaCode && account.desiredState === 'running'"
      color="warning"
      variant="subtle"
      icon="i-lucide-key-round"
      title="Microsoft sign-in required"
    >
      <template #description>
        <p>
          Open <a :href="state.msaCode.verificationUri" target="_blank" rel="noopener" class="font-medium underline">{{ state.msaCode.verificationUri }}</a>
          and enter this code while signed in as the account that owns Minecraft:
        </p>
        <div class="mt-2 flex items-center gap-2">
          <code class="rounded bg-elevated px-3 py-1 text-lg font-semibold tracking-widest text-highlighted">{{ state.msaCode.userCode }}</code>
          <UButton icon="i-lucide-copy" color="neutral" variant="ghost" aria-label="Copy code" @click="copy(state.msaCode.userCode)" />
        </div>
        <p class="mt-2 text-xs">
          The code expires at {{ new Date(state.msaCode.expiresAt).toLocaleTimeString() }}. This is only needed once; the sign-in is saved and renewed automatically.
        </p>
      </template>
    </UAlert>

    <UTabs v-model="tab" :items="tabs" :unmount-on-hide="false" class="w-full">
      <template #overview>
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
            <UCard v-for="stat in [
              { label: 'Health', value: state?.health != null ? `${Math.round(state.health)} / 20` : '-' },
              { label: 'Food', value: state?.food != null ? `${state.food} / 20` : '-' },
              { label: 'Position', value: state?.position ? `${state.position.x}, ${state.position.y}, ${state.position.z}` : '-' },
              { label: 'World', value: state?.dimension ? `${state.dimension} (${state.version})` : '-' }
            ]" :key="stat.label">
              <div class="text-xs text-muted">
                {{ stat.label }}
              </div>
              <div class="mt-1 font-medium tabular-nums">
                {{ stat.value }}
              </div>
            </UCard>
          </div>
          <UAlert v-if="state?.lastError && !online" color="error" variant="subtle" icon="i-lucide-circle-alert" title="Last error" :description="state.lastError" />
          <BotConsole v-if="account.desiredState === 'running'" :id="id" :online="online" @state="state = $event" />
        </div>
      </template>

      <template #viewer>
        <UAlert v-if="!account.behaviours.viewer.enabled" color="neutral" variant="subtle" icon="i-lucide-box" description="The 3D viewer is turned off for this account. Enable it on the Behaviours tab." />
        <UAlert v-else-if="!online" color="neutral" variant="subtle" description="The viewer is available while the bot is online." />
        <iframe v-else-if="tab === 'viewer'" :src="`/bots/${id}/viewer/`" title="World viewer" class="h-[70vh] w-full rounded-lg border border-default" />
      </template>

      <template #inventory>
        <UAlert v-if="!account.behaviours.inventory.enabled" color="neutral" variant="subtle" icon="i-lucide-backpack" description="The inventory view is turned off for this account. Enable it on the Behaviours tab." />
        <UAlert v-else-if="!online" color="neutral" variant="subtle" description="The inventory is available while the bot is online." />
        <iframe v-else-if="tab === 'inventory'" :src="`/bots/${id}/inventory/`" title="Inventory" class="h-[70vh] w-full rounded-lg border border-default bg-white" />
      </template>

      <template #behaviours>
        <BehavioursForm :id="id" :behaviours="account.behaviours" @saved="account.behaviours = $event" />
      </template>

      <template #scripts>
        <ScriptsPanel :id="id" :online="online" />
      </template>

      <template #mcp>
        <UCard>
          <div class="space-y-4 text-sm">
            <p>
              This account has its own MCP endpoint. It exposes tools to read status, inventory and nearby entities, chat, move, use items, change behaviours and run scripts.
            </p>
            <UFormField label="Endpoint (Streamable HTTP)">
              <div class="flex gap-2">
                <UInput :model-value="mcpUrl" readonly class="flex-1 font-mono" />
                <UButton icon="i-lucide-copy" color="neutral" variant="subtle" aria-label="Copy endpoint" @click="copy(mcpUrl)" />
              </div>
            </UFormField>
            <UFormField label="Claude Code" help="Replace <MCP token> with the mcpToken value from the panel's Secret.">
              <div class="flex gap-2">
                <UInput :model-value="mcpCommand" readonly class="flex-1 font-mono" />
                <UButton icon="i-lucide-copy" color="neutral" variant="subtle" aria-label="Copy command" @click="copy(mcpCommand)" />
              </div>
            </UFormField>
          </div>
        </UCard>
      </template>
    </UTabs>

    <UCard v-if="account.auth === 'microsoft'">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="text-sm">
          <div class="font-medium">
            Saved Microsoft sign-in
          </div>
          <div class="text-muted">
            Forget it to sign in again, for example with a different Microsoft account. The bot restarts.
          </div>
        </div>
        <UButton color="neutral" variant="subtle" icon="i-lucide-key-round" @click="act('forget-login')">
          Forget sign-in
        </UButton>
      </div>
    </UCard>

    <AccountFormModal v-model:open="editing" :account="account" @saved="refresh" />

    <UModal v-model:open="confirmingDelete" title="Delete account" :description="`This removes ${account.label}, its bot pod, saved sign-in and scripts.`">
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="confirmingDelete = false">
            Cancel
          </UButton>
          <UButton color="error" @click="remove">
            Delete
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
