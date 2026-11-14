export default defineEventHandler(async (event) => {
  const { id } = getAccount(getRouterParam(event, 'id')!)
  const { shared, ...script } = await readValidatedBody(event, ScriptInput.parse)
  return { id: saveScript({ ...script, id: Number(getRouterParam(event, 'sid')), accountId: shared ? null : id }) }
})
