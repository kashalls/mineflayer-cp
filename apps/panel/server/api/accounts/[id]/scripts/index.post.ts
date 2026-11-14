export default defineEventHandler(async (event) => {
  const { id } = getAccount(getRouterParam(event, 'id')!)
  const { shared, ...script } = await readValidatedBody(event, ScriptInput.parse)
  return { id: saveScript({ ...script, accountId: shared ? null : id }) }
})
