export default defineEventHandler((event) => {
  const { id } = getAccount(getRouterParam(event, 'id')!)
  setResponseHeader(event, 'content-type', 'application/json')
  return getAuthCache(id, getRouterParam(event, 'name')!)
})
