export default defineEventHandler(async (event) => {
  await clearSession(event, sessionConfig())
  return { authenticated: false }
})
