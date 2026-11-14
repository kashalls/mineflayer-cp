import { setTimeout as sleep } from 'node:timers/promises'

export default defineEventHandler(async (event) => {
  const { password } = await readBody<{ password?: string }>(event)
  if (!safeEqual(password ?? '', secret('adminPassword'))) {
    await sleep(500)
    throw createError({ statusCode: 401, statusMessage: 'wrong password' })
  }
  const session = await useSession(event, sessionConfig())
  await session.update({ admin: true })
  return { authenticated: true }
})
