import { EventEmitter } from 'node:events'
import mineflayer, { type Bot } from 'mineflayer'
import { loader as autoEat } from 'mineflayer-auto-eat'
import inventoryViewer from 'mineflayer-web-inventory'
import { inventoryPath, viewerPath, type Behaviours, type BotEvent, type BotEventType, type BotSpec, type BotState, type BotStatus } from '@mineflayer-cp/shared'
import { applyBehaviours } from './behaviours.js'
import { runScript } from './scripting.js'
import { startViewer } from './viewer.js'

export const VIEWER_PORT = 3001
export const INVENTORY_PORT = 3002
const EVENT_BUFFER = 500

export class BotController extends EventEmitter<{ event: [BotEvent] }> {
  spec: BotSpec
  bot: Bot | null = null
  state: BotState = {
    status: 'starting',
    since: Date.now(),
    username: null,
    version: null,
    health: null,
    food: null,
    position: null,
    dimension: null,
    gameMode: null,
    msaCode: null,
    lastError: null
  }

  readonly events: BotEvent[] = []
  private seq = 0
  private wantOnline = false
  private reconnectTimer: NodeJS.Timeout | null = null
  private reconnectDelay = 0
  private disposeFeatures: (() => void) | null = null
  private inventoryQueue: Promise<void> = Promise.resolve()
  private readonly authCache: unknown

  constructor (spec: BotSpec, authCache: unknown) {
    super()
    this.spec = spec
    this.authCache = authCache
  }

  log (type: BotEventType, text: string): void {
    const event: BotEvent = { seq: ++this.seq, time: Date.now(), type, text }
    this.events.push(event)
    if (this.events.length > EVENT_BUFFER) this.events.shift()
    this.emit('event', event)
  }

  private setStatus (status: BotStatus): void {
    if (this.state.status === status) return
    this.state.status = status
    this.state.since = Date.now()
    this.log('log', `status: ${status}`)
  }

  connect (): void {
    this.wantOnline = true
    if (this.bot) return
    this.clearReconnect()
    this.state.lastError = null
    this.state.msaCode = null
    this.setStatus('connecting')

    const { spec } = this
    const bot = mineflayer.createBot({
      host: spec.host,
      port: spec.port,
      username: spec.username,
      auth: spec.auth,
      version: spec.version ?? undefined,
      // minecraft-protocol hands this straight to prismarine-auth, which also accepts a cache factory.
      profilesFolder: this.authCache as string | undefined,
      onMsaCode: (data) => {
        if (this.bot !== bot) return
        this.state.msaCode = {
          userCode: data.user_code,
          verificationUri: data.verification_uri,
          expiresAt: Date.now() + data.expires_in * 1000
        }
        this.setStatus('awaiting_login')
        this.log('log', `Microsoft sign-in required: open ${data.verification_uri} and enter ${data.user_code}`)
      },
      respawn: false,
      hideErrors: true
    })
    this.bot = bot
    bot.loadPlugin(autoEat)

    bot._client.on('session', () => {
      if (this.bot !== bot) return
      this.state.msaCode = null
      this.setStatus('connecting')
    })

    bot.once('spawn', () => {
      this.reconnectDelay = 0
      this.state.username = bot.username
      this.state.version = bot.version
      this.setStatus('online')
      this.refreshVitals()
      // Loaded here because the inventory UI picks its item data from bot.version, which is unknown before login.
      inventoryViewer(bot, { host: '127.0.0.1', port: INVENTORY_PORT, webPath: inventoryPath(spec.id), startOnLoad: false })
      this.startFeatures()
      for (const script of spec.spawnScripts) {
        void runScript(this, { code: script.code, name: script.name, timeoutSeconds: 3600 })
      }
    })
    bot.on('health', () => this.refreshVitals())
    bot.on('move', () => {
      const p = bot.entity.position
      this.state.position = { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, z: Math.round(p.z * 10) / 10 }
    })
    bot.on('game', () => this.refreshVitals())
    bot.on('messagestr', (message, position) => {
      if (position !== 'game_info') this.log('chat', message)
    })
    bot.on('death', () => {
      this.log('log', 'died')
      if (this.spec.behaviours.autoRespawn.enabled) bot.respawn()
    })
    bot.on('kicked', (reason) => {
      const text = typeof reason === 'string' ? reason : JSON.stringify(reason)
      this.state.lastError = `kicked: ${text}`
      this.log('error', this.state.lastError)
    })
    bot.on('error', (err) => {
      this.state.lastError = err.message
      this.log('error', err.message)
    })
    bot.once('end', (reason) => {
      this.bot = null
      this.stopFeatures()
      this.state.msaCode = null
      this.state.health = this.state.food = null
      this.log('log', `disconnected: ${reason}`)
      if (this.wantOnline && this.spec.behaviours.autoReconnect.enabled) {
        this.scheduleReconnect()
      } else {
        this.wantOnline = false
        this.setStatus('stopped')
      }
    })
  }

  disconnect (reason = 'disconnect requested'): void {
    this.wantOnline = false
    this.clearReconnect()
    const bot = this.bot
    if (!bot) {
      this.setStatus('stopped')
    } else if (bot._client.socket) {
      bot.quit(reason)
    } else {
      // Still authenticating: there is no socket to close, so 'end' never fires. Detach this
      // attempt and close its connection if the sign-in completes later.
      bot.removeAllListeners()
      bot.on('error', () => {})
      bot._client.once('connect', () => bot.end(reason))
      this.bot = null
      this.state.msaCode = null
      this.setStatus('stopped')
    }
  }

  setBehaviours (behaviours: Behaviours): void {
    this.spec = { ...this.spec, behaviours }
    if (this.bot && this.state.status === 'online') {
      this.stopFeatures()
      this.startFeatures()
    }
    this.log('log', 'behaviour config updated')
  }

  private scheduleReconnect (): void {
    const { delaySeconds, maxDelaySeconds } = this.spec.behaviours.autoReconnect
    this.reconnectDelay = Math.min(this.reconnectDelay ? this.reconnectDelay * 2 : delaySeconds, Math.max(delaySeconds, maxDelaySeconds))
    this.setStatus('disconnected')
    this.log('log', `reconnecting in ${this.reconnectDelay}s`)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, this.reconnectDelay * 1000)
  }

  private clearReconnect (): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
  }

  private refreshVitals (): void {
    const bot = this.bot
    if (!bot) return
    this.state.health = bot.health ?? null
    this.state.food = bot.food ?? null
    this.state.dimension = bot.game?.dimension ?? null
    this.state.gameMode = bot.game?.gameMode ?? null
  }

  private startFeatures (): void {
    const bot = this.bot
    if (!bot) return
    const { behaviours, id } = this.spec
    const disposers = [applyBehaviours(bot, behaviours, this)]

    // The viewer and inventory are conveniences; a failure in either must not take the bot down.
    if (behaviours.viewer.enabled) {
      try {
        disposers.push(startViewer(bot, { port: VIEWER_PORT, prefix: viewerPath(id), ...behaviours.viewer }))
      } catch (err) {
        this.log('error', `viewer failed to start: ${(err as Error).message}`)
      }
    }
    if (behaviours.inventory.enabled) {
      this.queueInventory(bot, true)
      // On disconnect the plugin shuts its own server down.
      disposers.push(() => { if (this.bot === bot) this.queueInventory(bot, false) })
    }
    this.disposeFeatures = () => { for (const dispose of disposers) dispose() }
  }

  /** Start and stop are asynchronous; queueing keeps a restart from starting before the stop has finished. */
  private queueInventory (bot: Bot, run: boolean): void {
    this.inventoryQueue = this.inventoryQueue.then(async () => {
      if (bot.webInventory.isRunning === run) return
      await (run ? bot.webInventory.start() : bot.webInventory.stop())
    }).catch((err: Error) => this.log('error', `inventory view: ${err.message}`))
  }

  private stopFeatures (): void {
    this.disposeFeatures?.()
    this.disposeFeatures = null
  }
}
