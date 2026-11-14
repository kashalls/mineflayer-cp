import { timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { Socket } from 'node:net'
import { createProxyServer } from 'httpxy'
import { Behaviours, ChatRequest, EvalRequest, inventoryPath, viewerPath, type BotEvent } from '@mineflayer-cp/shared'
import { INVENTORY_PORT, VIEWER_PORT, type BotController } from './controller.js'
import { handleMcp, type PersistBehaviours } from './mcp.js'
import { runScript } from './scripting.js'

const STATE_INTERVAL_MS = 2000

async function readJson (req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}
}

function json (res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
}

export function startServer (controller: BotController, opts: { port: number, token: string | undefined, persist: PersistBehaviours }): Server {
  const { id } = controller.spec
  const proxy = createProxyServer({})
  proxy.on('error', (_err, _req, res) => {
    if (res && 'writeHead' in res && !res.headersSent) json(res as ServerResponse, 502, { error: 'not running' })
  })

  const authorized = (req: IncomingMessage): boolean => {
    if (!opts.token) return true
    const given = Buffer.from(req.headers.authorization ?? '')
    const expected = Buffer.from(`Bearer ${opts.token}`)
    return given.length === expected.length && timingSafeEqual(given, expected)
  }

  const proxyTarget = (path: string): string | null => {
    if (path.startsWith(viewerPath(id))) return `http://127.0.0.1:${VIEWER_PORT}`
    if (path.startsWith(inventoryPath(id))) return `http://127.0.0.1:${INVENTORY_PORT}`
    return null
  }

  const events = (req: IncomingMessage, res: ServerResponse): void => {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'x-accel-buffering': 'no' })
    const sendEvent = (event: BotEvent) => res.write(`id: ${event.seq}\nevent: log\ndata: ${JSON.stringify(event)}\n\n`)
    const sendState = () => res.write(`event: state\ndata: ${JSON.stringify(controller.state)}\n\n`)
    const lastSeen = Number(req.headers['last-event-id'] ?? 0)
    for (const event of controller.events) if (event.seq > lastSeen) sendEvent(event)
    sendState()
    const timer = setInterval(sendState, STATE_INTERVAL_MS)
    controller.on('event', sendEvent)
    res.on('close', () => {
      clearInterval(timer)
      controller.off('event', sendEvent)
    })
  }

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const path = new URL(req.url ?? '/', 'http://bot').pathname
    if (path === '/healthz') return json(res, 200, { ok: true })
    if (!authorized(req)) return json(res, 401, { error: 'unauthorized' })

    const target = proxyTarget(path)
    if (target) return proxy.web(req, res, { target })
    if (path === '/mcp') return handleMcp(controller, opts.persist, req, res)

    const route = `${req.method} ${path}`
    switch (route) {
      case 'GET /api/state':
        return json(res, 200, { state: controller.state, behaviours: controller.spec.behaviours })
      case 'GET /api/events':
        return events(req, res)
      case 'POST /api/chat': {
        if (!controller.bot || controller.state.status !== 'online') return json(res, 409, { error: 'bot is not online' })
        controller.bot.chat(ChatRequest.parse(await readJson(req)).message)
        return json(res, 200, { ok: true })
      }
      case 'POST /api/behaviours':
        controller.setBehaviours(Behaviours.parse(await readJson(req)))
        return json(res, 200, { ok: true })
      case 'POST /api/connect':
        controller.connect()
        return json(res, 200, { ok: true })
      case 'POST /api/disconnect':
        controller.disconnect()
        return json(res, 200, { ok: true })
      case 'POST /api/eval':
        return json(res, 200, await runScript(controller, EvalRequest.parse(await readJson(req))))
      default:
        return json(res, 404, { error: 'not found' })
    }
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((err: Error) => {
      if (!res.headersSent) json(res, 400, { error: err.message })
      else res.end()
    })
  })
  server.on('upgrade', (req, socket, head) => {
    const target = authorized(req) ? proxyTarget(new URL(req.url ?? '/', 'http://bot').pathname) : null
    if (!target) return void socket.destroy()
    proxy.ws(req, socket as Socket, { target }, head).catch(() => socket.destroy())
  })
  server.listen(opts.port)
  return server
}
