export default defineEventHandler(async (event) => {
  const { id } = getAccount(getRouterParam(event, 'id')!)
  setAuthCache(id, getRouterParam(event, 'name')!, JSON.stringify(await readBody(event)))
  return { ok: true }
})
