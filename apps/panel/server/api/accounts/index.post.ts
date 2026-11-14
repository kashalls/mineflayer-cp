import { AccountInput } from '@mineflayer-cp/shared'

export default defineEventHandler(async (event) => {
  const input = await readValidatedBody(event, AccountInput.parse)
  createAccount(input)
  await reconcile()
  return getAccount(input.id)
})
