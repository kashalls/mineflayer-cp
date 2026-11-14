<script setup lang="ts">
import { AccountInput } from '@mineflayer-cp/shared'

const props = defineProps<{ account?: AccountInput }>()
const emit = defineEmits<{ saved: [] }>()
const open = defineModel<boolean>('open', { default: false })
const run = useAction()

const blank = () => ({ id: '', label: '', username: '', host: '', port: 25565, version: '', auth: 'microsoft' as AccountInput['auth'] })
const form = reactive(blank())
const errors = ref<Record<string, string>>({})
const saving = ref(false)

watch(open, (isOpen) => {
  if (!isOpen) return
  errors.value = {}
  Object.assign(form, props.account ? { ...props.account, version: props.account.version ?? '' } : blank())
})

async function save () {
  const parsed = AccountInput.safeParse({ ...form, version: form.version || null })
  if (!parsed.success) {
    errors.value = Object.fromEntries(parsed.error.issues.map(issue => [String(issue.path[0]), issue.message]))
    return
  }
  errors.value = {}
  saving.value = true
  const saved = await run(() => props.account
    ? $fetch(`/api/accounts/${props.account.id}`, { method: 'PUT', body: parsed.data })
    : $fetch('/api/accounts', { method: 'POST', body: parsed.data }))
  saving.value = false
  if (saved) {
    open.value = false
    emit('saved')
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="account ? 'Edit account' : 'Add account'" :description="account ? 'Saving restarts the bot.' : 'A bot pod is created for the account as soon as it is saved.'">
    <template #body>
      <form id="account-form" class="space-y-4" @submit.prevent="save">
        <UFormField v-if="!account" label="ID" help="Used in URLs and Kubernetes object names. Cannot be changed later." :error="errors.id">
          <UInput v-model="form.id" placeholder="alt-1" class="w-full" />
        </UFormField>
        <UFormField label="Label" :error="errors.label">
          <UInput v-model="form.label" placeholder="Iron farm loader" class="w-full" />
        </UFormField>
        <UFormField label="Authentication" :error="errors.auth">
          <USelect v-model="form.auth" :items="[{ label: 'Microsoft account', value: 'microsoft' }, { label: 'Offline (no authentication)', value: 'offline' }]" class="w-full" />
        </UFormField>
        <UFormField :label="form.auth === 'microsoft' ? 'Microsoft account email' : 'Player name'" :help="form.auth === 'microsoft' ? 'Identifies the saved sign-in. You sign in with a device code after saving.' : undefined" :error="errors.username">
          <UInput v-model="form.username" class="w-full" />
        </UFormField>
        <div class="grid grid-cols-3 gap-3">
          <UFormField label="Server host" class="col-span-2" :error="errors.host">
            <UInput v-model="form.host" placeholder="mc.example.com" class="w-full" />
          </UFormField>
          <UFormField label="Port" :error="errors.port">
            <UInput v-model.number="form.port" type="number" class="w-full" />
          </UFormField>
        </div>
        <UFormField label="Minecraft version" help="Leave empty to detect it from the server." :error="errors.version">
          <UInput v-model="form.version" placeholder="auto" class="w-full" />
        </UFormField>
      </form>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="open = false">
          Cancel
        </UButton>
        <UButton type="submit" form="account-form" :loading="saving">
          Save
        </UButton>
      </div>
    </template>
  </UModal>
</template>
