import { z } from 'zod'

export const DEFAULT_BANNED_FOOD = ['rotten_flesh', 'pufferfish', 'chorus_fruit', 'poisonous_potato', 'spider_eye']

export const AntiAfkAction = z.enum(['look', 'swing', 'jump', 'sneak'])
export type AntiAfkAction = z.infer<typeof AntiAfkAction>

export const Behaviours = z.object({
  autoEat: z.object({
    enabled: z.boolean().default(true),
    minHunger: z.number().int().min(0).max(20).default(15),
    minHealth: z.number().int().min(0).max(20).default(14),
    bannedFood: z.array(z.string()).default(DEFAULT_BANNED_FOOD)
  }).prefault({}),
  antiAfk: z.object({
    enabled: z.boolean().default(true),
    intervalSeconds: z.number().int().min(5).max(3600).default(60),
    actions: z.array(AntiAfkAction).default(['look', 'swing'])
  }).prefault({}),
  autoReconnect: z.object({
    enabled: z.boolean().default(true),
    delaySeconds: z.number().int().min(1).max(3600).default(5),
    maxDelaySeconds: z.number().int().min(1).max(86400).default(300)
  }).prefault({}),
  autoRespawn: z.object({
    enabled: z.boolean().default(true)
  }).prefault({}),
  lowHealthLogout: z.object({
    enabled: z.boolean().default(false),
    threshold: z.number().min(1).max(19).default(6)
  }).prefault({}),
  autoArmor: z.object({
    enabled: z.boolean().default(true)
  }).prefault({}),
  viewer: z.object({
    enabled: z.boolean().default(false),
    viewDistance: z.number().int().min(1).max(12).default(4),
    firstPerson: z.boolean().default(false)
  }).prefault({}),
  inventory: z.object({
    enabled: z.boolean().default(true)
  }).prefault({})
})
export type Behaviours = z.infer<typeof Behaviours>

// The id becomes part of Kubernetes object names and URL paths.
export const AccountId = z.string().regex(/^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/, 'lowercase letters, digits and dashes, max 40 characters')

export const AuthMode = z.enum(['microsoft', 'offline'])
export type AuthMode = z.infer<typeof AuthMode>

export const AccountInput = z.object({
  id: AccountId,
  label: z.string().min(1, 'Required').max(80),
  username: z.string().min(1, 'Required').max(254),
  host: z.string().min(1, 'Required').max(253),
  port: z.number().int().min(1).max(65535).default(25565),
  version: z.string().max(20).nullable().default(null),
  auth: AuthMode.default('microsoft')
})
export type AccountInput = z.infer<typeof AccountInput>

export const SpawnScript = z.object({ name: z.string(), code: z.string() })
export type SpawnScript = z.infer<typeof SpawnScript>

/** What a bot pod needs to run one account. */
export const BotSpec = AccountInput.omit({ label: true }).extend({
  behaviours: Behaviours.prefault({}),
  spawnScripts: z.array(SpawnScript).default([])
})
export type BotSpec = z.infer<typeof BotSpec>

export const BotStatus = z.enum(['starting', 'awaiting_login', 'connecting', 'online', 'disconnected', 'stopped'])
export type BotStatus = z.infer<typeof BotStatus>

export interface MsaCode {
  userCode: string
  verificationUri: string
  expiresAt: number
}

export interface BotState {
  status: BotStatus
  since: number
  username: string | null
  version: string | null
  health: number | null
  food: number | null
  position: { x: number, y: number, z: number } | null
  dimension: string | null
  gameMode: string | null
  msaCode: MsaCode | null
  lastError: string | null
}

export type BotEventType = 'chat' | 'log' | 'error' | 'script'

export interface BotEvent {
  seq: number
  time: number
  type: BotEventType
  text: string
}

export const ChatRequest = z.object({ message: z.string().min(1).max(256) })
export const EvalRequest = z.object({
  code: z.string().min(1).max(100_000),
  name: z.string().max(80).optional(),
  timeoutSeconds: z.number().int().min(1).max(3600).default(60)
})
export type EvalRequest = z.infer<typeof EvalRequest>

export interface EvalResult {
  ok: boolean
  result?: string
  error?: string
}

export const BOT_PORT = 8080
export const viewerPath = (id: string) => `/bots/${id}/viewer`
export const inventoryPath = (id: string) => `/bots/${id}/inventory`
