import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Behaviours } from '@mineflayer-cp/shared'

// Nitro auto-imports these in the real server.
globalThis.secret = () => 'test-encryption-key'

const { botManifests, botName } = await import('../server/utils/k8s.ts')
const { encrypt, decrypt } = await import('../server/utils/db.ts')

const account = {
  id: 'alt-1',
  label: 'Alt',
  username: 'u',
  host: 'h',
  port: 25565,
  version: null,
  auth: 'microsoft',
  desiredState: 'running',
  behaviours: Behaviours.parse({}),
  restartedAt: null
}
const opts = {
  namespace: 'mc',
  image: 'bot:1',
  imagePullPolicy: 'IfNotPresent',
  imagePullSecrets: [{ name: 'regcred' }],
  resources: { limits: { memory: '512Mi' } },
  secretName: 'panel-secret',
  panelUrl: 'http://panel.mc.svc:3000'
}

test('bot manifests', () => {
  const [deployment, service] = botManifests(account, opts)
  assert.equal(deployment.metadata.name, botName('alt-1'))
  assert.equal(deployment.spec.replicas, 1)
  assert.equal(deployment.spec.strategy.type, 'Recreate')
  const container = deployment.spec.template.spec.containers[0]
  assert.equal(container.image, 'bot:1')
  assert.deepEqual(container.resources, opts.resources)
  assert.deepEqual(deployment.spec.template.spec.imagePullSecrets, [{ name: 'regcred' }])
  assert.deepEqual(container.env.find(e => e.name === 'INTERNAL_TOKEN').valueFrom.secretKeyRef, { name: 'panel-secret', key: 'internalToken' })
  assert.equal(container.env.find(e => e.name === 'BOT_ID').value, 'alt-1')
  assert.deepEqual(service.spec.selector, deployment.spec.selector.matchLabels)
  assert.equal(deployment.metadata.ownerReferences, undefined)
})

test('a stopped account scales to zero and keeps its objects', () => {
  const [deployment] = botManifests({ ...account, desiredState: 'stopped' }, opts)
  assert.equal(deployment.spec.replicas, 0)
})

test('restart changes the pod template', () => {
  const before = botManifests(account, opts)[0].spec.template
  const after = botManifests({ ...account, restartedAt: '2026-01-01T00:00:00Z' }, opts)[0].spec.template
  assert.notDeepEqual(before, after)
})

test('owner reference is attached when known', () => {
  const owner = { apiVersion: 'apps/v1', kind: 'Deployment', name: 'panel', uid: 'abc' }
  const [deployment, service] = botManifests(account, { ...opts, owner })
  assert.deepEqual(deployment.metadata.ownerReferences, [owner])
  assert.deepEqual(service.metadata.ownerReferences, [owner])
})

test('auth cache encryption round trips and does not store plaintext', () => {
  const blob = encrypt('{"refresh_token":"hunter2"}')
  assert.equal(blob.includes('hunter2'), false)
  assert.equal(decrypt(blob), '{"refresh_token":"hunter2"}')
  assert.notDeepEqual(encrypt('same'), encrypt('same'))
  blob[blob.length - 1] ^= 1
  assert.throws(() => decrypt(blob))
})
