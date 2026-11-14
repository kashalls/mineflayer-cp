import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AccountInput, Behaviours, BotSpec } from '@mineflayer-cp/shared'

test('behaviours fill in defaults for missing sections and fields', () => {
  const parsed = Behaviours.parse({ antiAfk: { intervalSeconds: 30 } })
  assert.equal(parsed.antiAfk.intervalSeconds, 30)
  assert.deepEqual(parsed.antiAfk.actions, ['look', 'swing'])
  assert.equal(parsed.autoEat.enabled, true)
  assert.equal(parsed.viewer.enabled, false)
})

test('behaviours reject out of range values', () => {
  assert.throws(() => Behaviours.parse({ antiAfk: { intervalSeconds: 1 } }))
  assert.throws(() => Behaviours.parse({ lowHealthLogout: { threshold: 20 } }))
})

test('account ids must be usable in Kubernetes names', () => {
  const base = { label: 'x', username: 'u', host: 'h' }
  assert.equal(AccountInput.safeParse({ ...base, id: 'alt-1' }).success, true)
  for (const id of ['Alt', 'a_b', '-a', 'a-', '', 'a'.repeat(41)]) {
    assert.equal(AccountInput.safeParse({ ...base, id }).success, false, id)
  }
})

test('bot spec defaults', () => {
  const spec = BotSpec.parse({ id: 'a', username: 'u', host: 'h' })
  assert.equal(spec.port, 25565)
  assert.equal(spec.auth, 'microsoft')
  assert.deepEqual(spec.spawnScripts, [])
})
