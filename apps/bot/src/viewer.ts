import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import type { Bot } from 'mineflayer'

// prismarine-viewer's own mineflayer entry point binds every interface with no way to restrict it,
// which would expose the world unauthenticated on the pod IP. This serves the same client on loopback.
const viewerRequire = createRequire(createRequire(import.meta.url).resolve('prismarine-viewer/package.json'))
const { WorldView } = viewerRequire('./viewer/lib/worldView')
const { setupRoutes } = viewerRequire('./lib/common')
const express = viewerRequire('express')
const socketIo = viewerRequire('socket.io')

interface ViewerOptions {
  port: number
  prefix: string
  viewDistance: number
  firstPerson: boolean
}

export function startViewer (bot: Bot, { port, prefix, viewDistance, firstPerson }: ViewerOptions): () => void {
  const app = express()
  const http = createServer(app)
  const io = socketIo(http, { path: `${prefix}/socket.io` })
  setupRoutes(app, prefix)

  io.on('connection', (socket: any) => {
    socket.emit('version', bot.version)
    const worldView = new WorldView(bot.world, viewDistance, bot.entity.position, socket)
    worldView.init(bot.entity.position)

    const sendPosition = () => {
      const packet: Record<string, unknown> = { pos: bot.entity.position, yaw: bot.entity.yaw, addMesh: true }
      if (firstPerson) packet.pitch = bot.entity.pitch
      socket.emit('position', packet)
      worldView.updatePosition(bot.entity.position)
    }
    bot.on('move', sendPosition)
    worldView.listenToBot(bot)
    socket.on('disconnect', () => {
      bot.off('move', sendPosition)
      worldView.removeListenersFromBot(bot)
    })
  })

  http.listen(port, '127.0.0.1')
  return () => {
    io.close()
    http.close()
  }
}
