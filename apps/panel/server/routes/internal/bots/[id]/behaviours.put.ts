import { Behaviours } from '@mineflayer-cp/shared'

export default defineEventHandler(async (event) => {
  const { id } = getAccount(getRouterParam(event, 'id')!)
  setBehaviours(id, await readValidatedBody(event, Behaviours.parse))
  return { ok: true }
})
