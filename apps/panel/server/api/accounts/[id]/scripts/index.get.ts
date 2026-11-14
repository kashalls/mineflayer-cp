export default defineEventHandler((event) => listScripts(getAccount(getRouterParam(event, 'id')!).id))
