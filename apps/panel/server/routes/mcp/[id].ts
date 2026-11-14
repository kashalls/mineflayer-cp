export default defineEventHandler((event) => {
  const { id } = getAccount(getRouterParam(event, 'id')!)
  return proxyRequest(event, `${botUrl(id)}/mcp`, {
    // h3 drops Accept when proxying, and MCP's Streamable HTTP transport rejects requests without it.
    headers: { ...botHeaders(), accept: getRequestHeader(event, 'accept') ?? 'application/json, text/event-stream' }
  })
})
