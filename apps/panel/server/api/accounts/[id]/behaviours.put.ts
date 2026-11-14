import { Behaviours } from '@mineflayer-cp/shared'

export default defineEventHandler(async (event) => {
  const { id } = getAccount(getRouterParam(event, 'id')!)
  const behaviours = await readValidatedBody(event, Behaviours.parse)
  setBehaviours(id, behaviours)
  const applied = await postToBot(id, '/api/behaviours', behaviours)
  return { behaviours, applied }
})
