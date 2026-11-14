export default defineEventHandler(async (event) => {
  const path = event.path.split('?')[0]!

  if (path.startsWith('/internal/')) {
    if (!hasBearer(event, secret('internalToken'))) throw createError({ statusCode: 401 })
    return
  }
  if (path.startsWith('/mcp/')) {
    if (!hasBearer(event, secret('mcpToken'))) throw createError({ statusCode: 401 })
    return
  }
  if (path === '/api/login' || path === '/api/session') return
  if (path.startsWith('/api/') || path.startsWith('/bots/')) {
    const session = await getSession(event, sessionConfig())
    if (!session.data.admin) throw createError({ statusCode: 401 })
  }
})
