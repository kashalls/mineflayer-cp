import { AccountInput } from '@mineflayer-cp/shared'

export default defineEventHandler(async (event) => {
  const { id } = getAccount(getRouterParam(event, 'id')!)
  updateAccount(id, await readValidatedBody(event, AccountInput.omit({ id: true }).parse))
  // Connection settings are only read when a bot starts.
  markRestarted(id)
  await reconcile()
  return getAccount(id)
})
