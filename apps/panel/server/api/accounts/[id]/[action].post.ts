export default defineEventHandler(async (event) => {
  const { id } = getAccount(getRouterParam(event, 'id')!)
  const action = getRouterParam(event, 'action')
  const k8s = useRuntimeConfig().k8s.enabled

  switch (action) {
    case 'start':
      setDesiredState(id, 'running')
      if (!k8s) await postToBot(id, '/api/connect')
      break
    case 'stop':
      setDesiredState(id, 'stopped')
      if (!k8s) await postToBot(id, '/api/disconnect')
      break
    case 'restart':
      setDesiredState(id, 'running')
      markRestarted(id)
      break
    case 'forget-login':
      clearAuthCache(id)
      markRestarted(id)
      break
    default:
      throw createError({ statusCode: 404 })
  }
  await reconcile()
  return getAccount(id)
})
