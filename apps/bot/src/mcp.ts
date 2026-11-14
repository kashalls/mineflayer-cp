import type { IncomingMessage, ServerResponse } from 'node:http'
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node'
import { McpServer } from '@modelcontextprotocol/server'
import type { Bot, ControlState, EquipmentDestination } from 'mineflayer'
import { Vec3 } from 'vec3'
import { z } from 'zod'
import { Behaviours } from '@mineflayer-cp/shared'
import type { BotController } from './controller.js'
import { runScript } from './scripting.js'

const text = (value: unknown) => ({
  content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }]
})

const position = z.object({ x: z.number(), y: z.number(), z: z.number() })
const round = (n: number) => Math.round(n * 10) / 10

export type PersistBehaviours = (behaviours: Behaviours) => Promise<void>

function buildServer (controller: BotController, persist: PersistBehaviours): McpServer {
  const server = new McpServer({ name: `mineflayer-${controller.spec.id}`, version: '0.1.0' })
  const online = (): Bot => {
    if (!controller.bot || controller.state.status !== 'online') throw new Error(`bot is not online (status: ${controller.state.status})`)
    return controller.bot
  }
  const findItem = (bot: Bot, name: string) => {
    const item = bot.inventory.items().find(i => i.name === name)
    if (!item) throw new Error(`no ${name} in inventory`)
    return item
  }

  server.registerTool('get_status', {
    description: 'Connection status, health, food, position and current behaviour config of this account.'
  }, async () => text({ state: controller.state, behaviours: controller.spec.behaviours }))

  server.registerTool('get_inventory', {
    description: 'List inventory items, the held item and worn armor.'
  }, async () => {
    const bot = online()
    const worn = (dest: EquipmentDestination) => bot.inventory.slots[bot.getEquipmentDestSlot(dest)]?.name ?? null
    return text({
      held: bot.heldItem ? { name: bot.heldItem.name, count: bot.heldItem.count } : null,
      armor: { head: worn('head'), torso: worn('torso'), legs: worn('legs'), feet: worn('feet'), offHand: worn('off-hand') },
      items: bot.inventory.items().map(i => ({ name: i.name, count: i.count, slot: i.slot }))
    })
  })

  server.registerTool('get_nearby', {
    description: 'List players and other entities near the bot, closest first.',
    inputSchema: z.object({ radius: z.number().min(1).max(256).default(32) })
  }, async ({ radius }) => {
    const bot = online()
    const here = bot.entity.position
    return text(Object.values(bot.entities)
      .filter(e => e !== bot.entity && e.position.distanceTo(here) <= radius)
      .map(e => ({
        type: e.type,
        name: e.username ?? e.name ?? null,
        distance: round(e.position.distanceTo(here)),
        position: { x: round(e.position.x), y: round(e.position.y), z: round(e.position.z) }
      }))
      .sort((a, b) => a.distance - b.distance))
  })

  server.registerTool('get_recent_events', {
    description: 'Recent chat messages, log lines, errors and script output from this bot.',
    inputSchema: z.object({ limit: z.number().int().min(1).max(500).default(50) })
  }, async ({ limit }) => text(controller.events.slice(-limit).map(e => `${new Date(e.time).toISOString()} [${e.type}] ${e.text}`).join('\n') || 'no events'))

  server.registerTool('send_chat', {
    description: 'Send a chat message or a /command as this account.',
    inputSchema: z.object({ message: z.string().min(1).max(256) })
  }, async ({ message }) => {
    online().chat(message)
    return text('sent')
  })

  server.registerTool('look_at', {
    description: 'Turn the bot to face a world position.',
    inputSchema: position
  }, async ({ x, y, z }) => {
    await online().lookAt(new Vec3(x, y, z))
    return text('ok')
  })

  server.registerTool('set_control', {
    description: 'Press or release a movement control. With durationMs the control is released again after that time.',
    inputSchema: z.object({
      control: z.enum(['forward', 'back', 'left', 'right', 'jump', 'sprint', 'sneak']),
      state: z.boolean(),
      durationMs: z.number().int().min(50).max(60_000).optional()
    })
  }, async ({ control, state, durationMs }) => {
    const bot = online()
    bot.setControlState(control as ControlState, state)
    if (state && durationMs) setTimeout(() => bot.setControlState(control as ControlState, false), durationMs)
    return text('ok')
  })

  server.registerTool('equip_item', {
    description: 'Equip an inventory item by its item name (for example "diamond_sword").',
    inputSchema: z.object({
      name: z.string(),
      destination: z.enum(['hand', 'off-hand', 'head', 'torso', 'legs', 'feet']).default('hand')
    })
  }, async ({ name, destination }) => {
    const bot = online()
    await bot.equip(findItem(bot, name), destination)
    return text(`equipped ${name}`)
  })

  server.registerTool('toss_item', {
    description: 'Drop items from the inventory by item name.',
    inputSchema: z.object({ name: z.string(), count: z.number().int().min(1).optional() })
  }, async ({ name, count }) => {
    const bot = online()
    const item = findItem(bot, name)
    await bot.toss(item.type, null, count ?? item.count)
    return text(`tossed ${name}`)
  })

  server.registerTool('use_item', {
    description: 'Use (right click) the held item. With durationMs the use is held for that long, for example to eat or draw a bow.',
    inputSchema: z.object({ offHand: z.boolean().default(false), durationMs: z.number().int().min(50).max(30_000).optional() })
  }, async ({ offHand, durationMs }) => {
    const bot = online()
    bot.activateItem(offHand)
    if (durationMs) setTimeout(() => bot.deactivateItem(), durationMs)
    return text('ok')
  })

  server.registerTool('activate_block', {
    description: 'Right click a block (lever, button, door, bed...). The block must be within reach.',
    inputSchema: position
  }, async ({ x, y, z }) => {
    const bot = online()
    const block = bot.blockAt(new Vec3(x, y, z))
    if (!block) throw new Error('that block is not loaded')
    await bot.activateBlock(block)
    return text(`activated ${block.name}`)
  })

  server.registerTool('set_behaviours', {
    description: 'Change behaviour settings (autoEat, antiAfk, autoReconnect, autoRespawn, lowHealthLogout, autoArmor, viewer, inventory). Pass only the sections and fields to change; see get_status for the current values.',
    inputSchema: z.object({ behaviours: z.record(z.string(), z.record(z.string(), z.unknown())) })
  }, async ({ behaviours }) => {
    const current = controller.spec.behaviours as Record<string, Record<string, unknown>>
    const merged = Behaviours.parse(Object.fromEntries(
      Object.entries(current).map(([section, value]) => [section, { ...value, ...behaviours[section] }])
    ))
    await persist(merged)
    controller.setBehaviours(merged)
    return text(merged)
  })

  server.registerTool('connect', {
    description: 'Connect this account to its Minecraft server.'
  }, async () => {
    controller.connect()
    return text(controller.state)
  })

  server.registerTool('disconnect', {
    description: 'Disconnect this account and keep it offline until connect is called.'
  }, async () => {
    controller.disconnect()
    return text(controller.state)
  })

  server.registerTool('run_script', {
    description: 'Run JavaScript inside the bot process as an async function body. In scope: bot (the mineflayer Bot), log(...args), sleep(ms), signal (AbortSignal fired on timeout or disconnect). The return value is reported back.',
    inputSchema: z.object({ code: z.string().min(1), timeoutSeconds: z.number().int().min(1).max(3600).default(60) })
  }, async ({ code, timeoutSeconds }) => {
    const result = await runScript(controller, { code, name: 'mcp', timeoutSeconds })
    return { ...text(result.ok ? result.result : result.error), isError: !result.ok }
  })

  return server
}

export async function handleMcp (controller: BotController, persist: PersistBehaviours, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const server = buildServer(controller, persist)
  const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  res.on('close', () => { void transport.close(); void server.close() })
  await server.connect(transport)
  await transport.handleRequest(req, res)
}
