export default defineNuxtRouteMiddleware(async (to) => {
  const { authenticated } = await $fetch('/api/session')
  if (!authenticated && to.path !== '/login') return navigateTo('/login')
  if (authenticated && to.path === '/login') return navigateTo('/')
})
