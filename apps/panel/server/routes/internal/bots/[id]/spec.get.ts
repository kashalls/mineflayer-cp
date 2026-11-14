export default defineEventHandler((event) => botSpec(getRouterParam(event, 'id')!))
