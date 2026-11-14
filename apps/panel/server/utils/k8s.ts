import { KubeConfig, KubernetesObjectApi, PatchStrategy, type KubernetesObject, type V1Deployment, type V1OwnerReference, type V1Service } from '@kubernetes/client-node'
import { BOT_PORT } from '@mineflayer-cp/shared'
import type { Account } from './db'

const MANAGED_BY = 'mineflayer-cp'
const FIELD_MANAGER = 'mineflayer-cp-panel'
const SELECTOR = `app.kubernetes.io/managed-by=${MANAGED_BY}`

export const botName = (id: string) => `mfcp-bot-${id}`

const labels = (id: string) => ({
  'app.kubernetes.io/name': 'mineflayer-cp-bot',
  'app.kubernetes.io/instance': id,
  'app.kubernetes.io/managed-by': MANAGED_BY
})

export interface BotManifestOptions {
  namespace: string
  image: string
  imagePullPolicy: string
  imagePullSecrets: Array<{ name: string }>
  resources: Record<string, unknown>
  secretName: string
  panelUrl: string
  owner?: V1OwnerReference
}

export function botManifests (account: Account, opts: BotManifestOptions): [V1Deployment, V1Service] {
  const metadata = {
    name: botName(account.id),
    namespace: opts.namespace,
    labels: labels(account.id),
    ...(opts.owner && { ownerReferences: [opts.owner] })
  }
  const selector = { 'app.kubernetes.io/name': 'mineflayer-cp-bot', 'app.kubernetes.io/instance': account.id }
  const deployment: V1Deployment = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata,
    spec: {
      replicas: account.desiredState === 'running' ? 1 : 0,
      // Two pods for one account would fight over the same Minecraft session.
      strategy: { type: 'Recreate' },
      selector: { matchLabels: selector },
      template: {
        metadata: {
          labels: labels(account.id),
          annotations: { 'mineflayer-cp/restarted-at': account.restartedAt ?? '' }
        },
        spec: {
          automountServiceAccountToken: false,
          imagePullSecrets: opts.imagePullSecrets,
          securityContext: { runAsNonRoot: true, runAsUser: 1000, seccompProfile: { type: 'RuntimeDefault' } },
          containers: [{
            name: 'bot',
            image: opts.image,
            imagePullPolicy: opts.imagePullPolicy,
            env: [
              { name: 'BOT_ID', value: account.id },
              { name: 'PANEL_URL', value: opts.panelUrl },
              { name: 'PORT', value: String(BOT_PORT) },
              { name: 'INTERNAL_TOKEN', valueFrom: { secretKeyRef: { name: opts.secretName, key: 'internalToken' } } }
            ],
            ports: [{ name: 'http', containerPort: BOT_PORT }],
            readinessProbe: { httpGet: { path: '/healthz', port: 'http' } },
            livenessProbe: { httpGet: { path: '/healthz', port: 'http' } },
            resources: opts.resources,
            securityContext: { allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, capabilities: { drop: ['ALL'] } },
            volumeMounts: [{ name: 'tmp', mountPath: '/tmp' }]
          }],
          volumes: [{ name: 'tmp', emptyDir: {} }]
        }
      }
    }
  }
  const service: V1Service = {
    apiVersion: 'v1',
    kind: 'Service',
    metadata,
    spec: { selector, ports: [{ name: 'http', port: BOT_PORT, targetPort: 'http' }] }
  }
  return [deployment, service]
}

/** Nuxt parses JSON-looking environment values itself, so the value may already be an object. */
function fromJsonEnv<T> (value: unknown, fallback: T): T {
  if (typeof value !== 'string') return (value as T) ?? fallback
  return value ? JSON.parse(value) as T : fallback
}

let client: KubernetesObjectApi | undefined
let owner: V1OwnerReference | undefined

function api (): KubernetesObjectApi {
  if (!client) {
    const kc = new KubeConfig()
    kc.loadFromDefault()
    client = KubernetesObjectApi.makeApiClient(kc)
  }
  return client
}

/** Bot objects are owned by the panel Deployment so that uninstalling the panel garbage-collects them. */
async function ownerReference (namespace: string, name: string): Promise<V1OwnerReference | undefined> {
  if (!name) return undefined
  if (!owner) {
    const deployment = await api().read<V1Deployment>({ apiVersion: 'apps/v1', kind: 'Deployment', metadata: { name, namespace } })
    owner = { apiVersion: 'apps/v1', kind: 'Deployment', name, uid: deployment.metadata!.uid! }
  }
  return owner
}

let queue: Promise<void> = Promise.resolve()

/** Makes the cluster match the accounts table: applies every account's objects and deletes orphans. */
export function reconcile (): Promise<void> {
  const config = useRuntimeConfig().k8s
  if (!config.enabled) return Promise.resolve()
  // Serialised so that overlapping requests cannot apply stale state after fresh state.
  queue = queue.catch(() => {}).then(async () => {
    const { namespace } = config
    const accounts = listAccounts()
    const opts: BotManifestOptions = {
      namespace,
      image: config.botImage,
      imagePullPolicy: config.botImagePullPolicy,
      imagePullSecrets: fromJsonEnv(config.botImagePullSecrets, []),
      resources: fromJsonEnv(config.botResources, {}),
      secretName: config.secretName,
      panelUrl: config.panelUrl,
      owner: await ownerReference(namespace, config.ownerDeployment)
    }
    for (const account of accounts) {
      for (const manifest of botManifests(account, opts)) {
        await api().patch(manifest, undefined, undefined, FIELD_MANAGER, true, PatchStrategy.ServerSideApply)
      }
    }
    const wanted = new Set(accounts.map(a => botName(a.id)))
    for (const [apiVersion, kind] of [['apps/v1', 'Deployment'], ['v1', 'Service']] as const) {
      const existing = await api().list<KubernetesObject>(apiVersion, kind, namespace, undefined, undefined, undefined, undefined, SELECTOR)
      for (const item of existing.items) {
        if (!wanted.has(item.metadata!.name!)) {
          await api().delete({ apiVersion, kind, metadata: { name: item.metadata!.name, namespace } })
        }
      }
    }
  })
  return queue
}
