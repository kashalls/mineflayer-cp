/** Runs a request, reporting failures as a toast. Resolves to undefined when it failed. */
export function useAction () {
  const toast = useToast()
  return async function run<T> (request: () => Promise<T>, success?: string): Promise<T | undefined> {
    try {
      const result = await request()
      if (success) toast.add({ title: success, color: 'success' })
      return result
    } catch (err: any) {
      if (err?.statusCode === 401) {
        await navigateTo('/login')
        return undefined
      }
      toast.add({ title: 'Request failed', description: err?.data?.message || err?.statusMessage || err?.message, color: 'error' })
      return undefined
    }
  }
}
