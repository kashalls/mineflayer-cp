export default defineEventHandler((event) => {
  deleteScript(Number(getRouterParam(event, 'sid')))
  return { ok: true }
})
