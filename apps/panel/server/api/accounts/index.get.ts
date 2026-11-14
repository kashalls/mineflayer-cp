export default defineEventHandler(async () => {
  const accounts = listAccounts()
  const states = await Promise.all(accounts.map(a => a.desiredState === 'running' ? fetchBotState(a.id) : null))
  return accounts.map(({ behaviours: _behaviours, ...account }, i) => ({ ...account, state: states[i] ?? null }))
})
