export default defineEventHandler(async (event) => {
  const session = await getSession(event, sessionConfig())
  return { authenticated: session.data.admin === true }
})
