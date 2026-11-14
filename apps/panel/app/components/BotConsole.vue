<script setup lang="ts">
import type { BotEvent, BotState } from '@mineflayer-cp/shared'

const props = defineProps<{ id: string, online: boolean }>()
const emit = defineEmits<{ state: [BotState | null] }>()
const run = useAction()

const MAX_LINES = 500
const lines = ref<BotEvent[]>([])
const message = ref('')
const scroller = ref<HTMLElement>()
let source: EventSource | undefined

const colors: Record<BotEvent['type'], string> = { chat: '', log: 'text-muted', error: 'text-error', script: 'text-info' }

function connect () {
  source = new EventSource(`/bots/${props.id}/api/events`)
  source.addEventListener('log', async (e) => {
    const event = JSON.parse((e as MessageEvent).data) as BotEvent
    if (lines.value.some(line => line.seq === event.seq)) return
    const pinned = !scroller.value || scroller.value.scrollHeight - scroller.value.scrollTop - scroller.value.clientHeight < 40
    lines.value.push(event)
    if (lines.value.length > MAX_LINES) lines.value.shift()
    if (pinned) {
      await nextTick()
      scroller.value?.scrollTo({ top: scroller.value.scrollHeight })
    }
  })
  source.addEventListener('state', e => emit('state', JSON.parse((e as MessageEvent).data)))
  // EventSource retries by itself; until it is back the bot's state is unknown.
  source.onerror = () => emit('state', null)
}

async function send () {
  const text = message.value.trim()
  if (!text) return
  const sent = await run(() => $fetch(`/bots/${props.id}/api/chat`, { method: 'POST', body: { message: text } }))
  if (sent) message.value = ''
}

onMounted(connect)
onUnmounted(() => source?.close())
</script>

<template>
  <UCard :ui="{ body: 'p-0 sm:p-0' }">
    <div ref="scroller" class="h-96 overflow-y-auto p-3 font-mono text-xs leading-5">
      <div v-if="lines.length === 0" class="text-muted">
        No output yet.
      </div>
      <div v-for="line in lines" :key="line.seq" :class="colors[line.type]" class="whitespace-pre-wrap break-words">
        <span class="text-dimmed">{{ new Date(line.time).toLocaleTimeString() }}</span> {{ line.text }}
      </div>
    </div>
    <form class="flex gap-2 border-t border-default p-3" @submit.prevent="send">
      <UInput v-model="message" :disabled="!online" placeholder="Chat message or /command" class="flex-1" />
      <UButton type="submit" icon="i-lucide-send" :disabled="!online">
        Send
      </UButton>
    </form>
  </UCard>
</template>
