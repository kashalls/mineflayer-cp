import type { BotState } from '@mineflayer-cp/shared'

export function botHeaders (): Record<string, string> {
  return { authorization: `Bearer ${secret('internalToken')}` }
}

/** Live state from the bot pod, or null when the pod is not running or not reachable. */
export async function fetchBotState (id: string): Promise<BotState | null> {
  try {
    const res = await $fetch<{ state: BotState }>(`${botUrl(id)}/api/state`, { headers: botHeaders(), timeout: 1500 })
    return res.state
  } catch {
    return null
  }
}

/** Best effort: a bot that is not running picks the change up from its spec on next start. */
export async function postToBot (id: string, path: string, body?: unknown): Promise<boolean> {
  try {
    await $fetch(`${botUrl(id)}${path}`, { method: 'POST', headers: botHeaders(), body: body as Record<string, unknown> | undefined, timeout: 3000 })
    return true
  } catch {
    return false
  }
}
