import { setTimeout as sleep } from 'node:timers/promises'
import { BOT_PORT, BotSpec, type Behaviours } from '@mineflayer-cp/shared'
import { panelAuthCache } from './authCache.js'
import { BotController } from './controller.js'
import { startServer } from './server.js'

const { BOT_ID, PANEL_URL, INTERNAL_TOKEN, BOT_SPEC, AUTH_CACHE_DIR } = process.env
const port = Number(process.env.PORT ?? BOT_PORT)

async function fetchSpec (): Promise<BotSpec> {
  for (;;) {
    try {
      const res = await fetch(`${PANEL_URL}/internal/bots/${BOT_ID}/spec`, { headers: { authorization: `Bearer ${INTERNAL_TOKEN}` } })
      if (res.ok) return BotSpec.parse(await res.json())
      console.error(`panel returned ${res.status} for the bot spec, retrying`)
    } catch (err) {
      console.error(`panel unreachable (${(err as Error).message}), retrying`)
    }
    await sleep(5000)
  }
}

let spec: BotSpec
let authCache: unknown
let persist = async (_behaviours: Behaviours): Promise<void> => {}

if (BOT_SPEC) {
  // Standalone mode: no panel, spec comes from the environment.
  spec = BotSpec.parse(JSON.parse(BOT_SPEC))
  authCache = AUTH_CACHE_DIR
} else {
  if (!BOT_ID || !PANEL_URL || !INTERNAL_TOKEN) throw new Error('set BOT_ID, PANEL_URL and INTERNAL_TOKEN, or BOT_SPEC for standalone mode')
  spec = await fetchSpec()
  authCache = panelAuthCache(PANEL_URL, BOT_ID, INTERNAL_TOKEN)
  persist = async (behaviours) => {
    const res = await fetch(`${PANEL_URL}/internal/bots/${BOT_ID}/behaviours`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${INTERNAL_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify(behaviours)
    })
    if (!res.ok) throw new Error(`panel rejected the behaviour update: ${res.status}`)
  }
}

const controller = new BotController(spec, authCache)
controller.on('event', (event) => console.log(`[${event.type}] ${event.text}`))
const server = startServer(controller, { port, token: INTERNAL_TOKEN, persist })
console.log(`bot ${spec.id} listening on :${port}`)
controller.connect()

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    controller.disconnect('shutting down')
    server.close()
    setTimeout(() => process.exit(0), 1000).unref()
  })
}
