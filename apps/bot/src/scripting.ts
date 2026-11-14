import { setTimeout as sleep } from 'node:timers/promises'
import { inspect } from 'node:util'
import type { EvalRequest, EvalResult } from '@mineflayer-cp/shared'
import type { BotController } from './controller.js'

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (...args: string[]) => (...args: unknown[]) => Promise<unknown>

/**
 * Runs a user script with the live bot in scope. Scripts have the full privileges of this process;
 * the timeout only stops waiting, it cannot interrupt a script that never yields.
 */
export async function runScript (controller: BotController, { code, name = 'script', timeoutSeconds }: EvalRequest): Promise<EvalResult> {
  const bot = controller.bot
  if (!bot) return { ok: false, error: 'bot is not connected' }

  const log = (...args: unknown[]) => controller.log('script', `[${name}] ${args.map(a => typeof a === 'string' ? a : inspect(a, { depth: 2 })).join(' ')}`)
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(new Error(`timed out after ${timeoutSeconds}s`)), timeoutSeconds * 1000)
  const onEnd = () => abort.abort(new Error('bot disconnected'))
  bot.once('end', onEnd)

  try {
    const fn = new AsyncFunction('bot', 'log', 'sleep', 'signal', code)
    const aborted = new Promise<never>((_resolve, reject) => {
      abort.signal.addEventListener('abort', () => reject(abort.signal.reason))
    })
    const value = await Promise.race([fn(bot, log, sleep, abort.signal), aborted])
    const result = value === undefined ? 'undefined' : inspect(value, { depth: 3 })
    log(`=> ${result}`)
    return { ok: true, result }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    log(`error: ${error}`)
    return { ok: false, error }
  } finally {
    clearTimeout(timer)
    bot.off('end', onEnd)
  }
}
