import type { IncomingMessage, Server } from 'node:http'
import type { Duplex } from 'node:stream'
import { proxyUpgrade } from 'httpxy'

const BOT_SOCKET = /^\/bots\/([a-z0-9-]+)\/(viewer|inventory)\//

export default defineNitroPlugin((nitro) => {
  assertConfig()
  db()
  reconcile().catch(err => console.error('initial reconcile failed:', err))

  // Nitro has no hook for raw upgrades, so the listener is attached to the HTTP server the first
  // time a request reveals it. Without it socket.io stays on long-polling, which still works.
  let attached: Server | undefined
  nitro.hooks.hook('request', (event) => {
    const server = (event.node.req.socket as unknown as { server?: Server }).server
    if (!server || server === attached) return
    attached = server
    server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      const match = BOT_SOCKET.exec(req.url ?? '')
      if (!match) return
      void (async () => {
        const session = await getSession({ headers: new Headers(req.headers as Record<string, string>), context: {} }, sessionConfig())
        if (!session.data.admin) return socket.destroy()
        await proxyUpgrade(botUrl(match[1]!), req, socket, head, { headers: botHeaders() })
      })().catch(() => socket.destroy())
    })
  })
})
