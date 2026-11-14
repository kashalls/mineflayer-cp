import type { Bot, EquipmentDestination } from 'mineflayer'
import type { Behaviours } from '@mineflayer-cp/shared'
import type { BotController } from './controller.js'

type Dispose = () => void

function autoEat (bot: Bot, cfg: Behaviours['autoEat']): Dispose {
  if (!cfg.enabled) {
    bot.autoEat.disableAuto()
    return () => {}
  }
  bot.autoEat.setOpts({ minHunger: cfg.minHunger, minHealth: cfg.minHealth, bannedFood: cfg.bannedFood })
  bot.autoEat.enableAuto()
  return () => bot.autoEat.disableAuto()
}

function antiAfk (bot: Bot, cfg: Behaviours['antiAfk']): Dispose {
  if (!cfg.enabled || cfg.actions.length === 0) return () => {}
  const pending = new Set<NodeJS.Timeout>()
  const release = (control: 'jump' | 'sneak') => {
    const timer = setTimeout(() => {
      pending.delete(timer)
      bot.setControlState(control, false)
    }, 400)
    pending.add(timer)
  }
  const interval = setInterval(() => {
    const action = cfg.actions[Math.floor(Math.random() * cfg.actions.length)]
    if (action === 'look') {
      void bot.look(Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.5)
    } else if (action === 'swing') {
      bot.swingArm('right')
    } else if (action === 'jump' || action === 'sneak') {
      bot.setControlState(action, true)
      release(action)
    }
  }, cfg.intervalSeconds * 1000)
  return () => {
    clearInterval(interval)
    for (const timer of pending) clearTimeout(timer)
    bot.setControlState('jump', false)
    bot.setControlState('sneak', false)
  }
}

function lowHealthLogout (bot: Bot, cfg: Behaviours['lowHealthLogout'], controller: BotController): Dispose {
  if (!cfg.enabled) return () => {}
  const onHealth = () => {
    if (bot.health > 0 && bot.health <= cfg.threshold) {
      controller.log('error', `health ${bot.health} at or below ${cfg.threshold}, logging out`)
      controller.disconnect('low health')
    }
  }
  bot.on('health', onHealth)
  return () => bot.off('health', onHealth)
}

const ARMOR_TIERS = ['leather', 'golden', 'chainmail', 'iron', 'diamond', 'netherite']
const ARMOR_SLOTS: Array<{ dest: EquipmentDestination, suffix: string }> = [
  { dest: 'head', suffix: '_helmet' },
  { dest: 'torso', suffix: '_chestplate' },
  { dest: 'legs', suffix: '_leggings' },
  { dest: 'feet', suffix: '_boots' }
]

function armorTier (name: string | undefined, suffix: string): number {
  if (!name?.endsWith(suffix)) return -1
  return ARMOR_TIERS.indexOf(name.slice(0, -suffix.length))
}

function autoArmor (bot: Bot, cfg: Behaviours['autoArmor'], controller: BotController): Dispose {
  if (!cfg.enabled) return () => {}
  let busy = false
  let timer: NodeJS.Timeout | null = null
  const equipBest = async () => {
    if (busy) return
    busy = true
    try {
      for (const { dest, suffix } of ARMOR_SLOTS) {
        const worn = bot.inventory.slots[bot.getEquipmentDestSlot(dest)]
        // Anything worn that is not ordinary armor (elytra, pumpkin, turtle helmet) was put there on purpose.
        if (worn && armorTier(worn.name, suffix) < 0) continue
        const wornTier = armorTier(worn?.name, suffix)
        const best = bot.inventory.items()
          .filter(item => armorTier(item.name, suffix) > wornTier)
          .sort((a, b) => armorTier(b.name, suffix) - armorTier(a.name, suffix))[0]
        if (best) await bot.equip(best, dest)
      }
    } catch (err) {
      controller.log('error', `auto armor: ${(err as Error).message}`)
    } finally {
      busy = false
    }
  }
  const schedule = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { void equipBest() }, 1000)
  }
  // prismarine-windows types declare updateSlot without its listener arguments.
  const inventory = bot.inventory as unknown as NodeJS.EventEmitter
  inventory.on('updateSlot', schedule)
  schedule()
  return () => {
    inventory.off('updateSlot', schedule)
    if (timer) clearTimeout(timer)
  }
}

export function applyBehaviours (bot: Bot, cfg: Behaviours, controller: BotController): Dispose {
  const disposers = [
    autoEat(bot, cfg.autoEat),
    antiAfk(bot, cfg.antiAfk),
    lowHealthLogout(bot, cfg.lowHealthLogout, controller),
    autoArmor(bot, cfg.autoArmor, controller)
  ]
  return () => { for (const dispose of disposers) dispose() }
}
