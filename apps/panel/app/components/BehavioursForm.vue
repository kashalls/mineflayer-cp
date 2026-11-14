<script setup lang="ts">
import { Behaviours } from '@mineflayer-cp/shared'

const props = defineProps<{ id: string, behaviours: Behaviours }>()
const emit = defineEmits<{ saved: [Behaviours] }>()
const run = useAction()
const toast = useToast()

const form = ref<Behaviours>(structuredClone(toRaw(props.behaviours)))
watch(() => props.behaviours, value => { form.value = structuredClone(toRaw(value)) })
const saving = ref(false)

const afkActions = [
  { label: 'Look around', value: 'look' },
  { label: 'Swing arm', value: 'swing' },
  { label: 'Jump', value: 'jump' },
  { label: 'Sneak', value: 'sneak' }
]

async function save () {
  const parsed = Behaviours.safeParse(form.value)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!
    toast.add({ title: `Invalid value for ${issue.path.join('.')}`, description: issue.message, color: 'error' })
    return
  }
  saving.value = true
  const result = await run(() => $fetch<{ behaviours: Behaviours, applied: boolean }>(`/api/accounts/${props.id}/behaviours`, { method: 'PUT', body: parsed.data }))
  saving.value = false
  if (result) {
    toast.add({ title: result.applied ? 'Applied to the running bot' : 'Saved; applies when the bot next starts', color: 'success' })
    emit('saved', result.behaviours)
  }
}
</script>

<template>
  <form class="space-y-4" @submit.prevent="save">
    <div class="grid gap-4 md:grid-cols-2">
      <UCard>
        <USwitch v-model="form.autoEat.enabled" label="Auto eat" description="Eat from the inventory when hungry or hurt." />
        <div v-if="form.autoEat.enabled" class="mt-4 space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Eat below hunger" help="0 - 20">
              <UInput v-model.number="form.autoEat.minHunger" type="number" min="0" max="20" class="w-full" />
            </UFormField>
            <UFormField label="Eat below health" help="0 - 20">
              <UInput v-model.number="form.autoEat.minHealth" type="number" min="0" max="20" class="w-full" />
            </UFormField>
          </div>
          <UFormField label="Never eat">
            <UInputTags v-model="form.autoEat.bannedFood" placeholder="item_name" class="w-full" />
          </UFormField>
        </div>
      </UCard>

      <UCard>
        <USwitch v-model="form.antiAfk.enabled" label="Anti AFK" description="Do something small at an interval so the server does not kick for idling." />
        <div v-if="form.antiAfk.enabled" class="mt-4 space-y-3">
          <UFormField label="Interval (seconds)">
            <UInput v-model.number="form.antiAfk.intervalSeconds" type="number" min="5" class="w-full" />
          </UFormField>
          <UCheckboxGroup v-model="form.antiAfk.actions" :items="afkActions" legend="Actions (one is picked at random)" orientation="horizontal" />
        </div>
      </UCard>

      <UCard>
        <USwitch v-model="form.autoReconnect.enabled" label="Auto reconnect" description="Reconnect after a kick or a server restart, backing off between attempts." />
        <div v-if="form.autoReconnect.enabled" class="mt-4 grid grid-cols-2 gap-3">
          <UFormField label="First delay (seconds)">
            <UInput v-model.number="form.autoReconnect.delaySeconds" type="number" min="1" class="w-full" />
          </UFormField>
          <UFormField label="Longest delay (seconds)">
            <UInput v-model.number="form.autoReconnect.maxDelaySeconds" type="number" min="1" class="w-full" />
          </UFormField>
        </div>
      </UCard>

      <UCard>
        <USwitch v-model="form.lowHealthLogout.enabled" label="Log out on low health" description="Disconnect and stay offline when health drops to the threshold." />
        <UFormField v-if="form.lowHealthLogout.enabled" label="Health threshold" help="1 - 19 (20 is full health)" class="mt-4">
          <UInput v-model.number="form.lowHealthLogout.threshold" type="number" min="1" max="19" class="w-full" />
        </UFormField>
      </UCard>

      <UCard>
        <div class="space-y-4">
          <USwitch v-model="form.autoRespawn.enabled" label="Auto respawn" description="Respawn immediately after dying." />
          <USwitch v-model="form.autoArmor.enabled" label="Auto armor" description="Wear the best armor found in the inventory." />
          <USwitch v-model="form.inventory.enabled" label="Inventory view" description="Serve the web inventory for this account." />
        </div>
      </UCard>

      <UCard>
        <USwitch v-model="form.viewer.enabled" label="3D viewer" description="Serve the world viewer for this account." />
        <div v-if="form.viewer.enabled" class="mt-4 space-y-3">
          <UFormField label="View distance (chunks)">
            <UInput v-model.number="form.viewer.viewDistance" type="number" min="1" max="12" class="w-full" />
          </UFormField>
          <USwitch v-model="form.viewer.firstPerson" label="First person camera" />
        </div>
      </UCard>
    </div>
    <UButton type="submit" :loading="saving">
      Save behaviours
    </UButton>
  </form>
</template>
