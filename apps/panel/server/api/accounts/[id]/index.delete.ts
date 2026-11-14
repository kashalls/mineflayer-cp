export default defineEventHandler(async (event) => {
  deleteAccount(getAccount(getRouterParam(event, 'id')!).id)
  await reconcile()
  return { ok: true }
})
