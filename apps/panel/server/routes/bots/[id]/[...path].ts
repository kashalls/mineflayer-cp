const FORWARDED = /^(api|viewer|inventory)(\/|$)/

export default defineEventHandler((event) => {
  const { id } = getAccount(getRouterParam(event, 'id')!)
  const path = getRouterParam(event, 'path') ?? ''
  if (!FORWARDED.test(path)) throw createError({ statusCode: 404 })
  // The viewer and inventory are served by the bot under this same /bots/<id>/ prefix; its API is not.
  const upstream = path.startsWith('api') ? event.path.slice(`/bots/${id}`.length) : event.path
  return proxyRequest(event, `${botUrl(id)}${upstream}`, { headers: botHeaders() })
})
