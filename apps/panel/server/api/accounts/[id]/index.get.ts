export default defineEventHandler(async (event) => {
  const account = getAccount(getRouterParam(event, 'id')!)
  return { ...account, state: await fetchBotState(account.id) }
})
