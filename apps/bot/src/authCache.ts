type Json = Record<string, unknown>

/** prismarine-auth cache factory that keeps token caches in the panel instead of on disk. */
export function panelAuthCache (panelUrl: string, botId: string, token: string) {
  return ({ cacheName }: { cacheName: string, username: string }) => {
    const url = `${panelUrl}/internal/bots/${botId}/auth-cache/${cacheName}`
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
    let cache: Json | undefined

    const save = async (value: Json) => {
      cache = value
      const res = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(value) })
      if (!res.ok) throw new Error(`auth cache write failed: ${res.status}`)
    }

    return {
      async reset () {
        await save({})
        return {}
      },
      async getCached () {
        if (cache === undefined) {
          const res = await fetch(url, { headers })
          if (!res.ok) throw new Error(`auth cache read failed: ${res.status}`)
          cache = await res.json() as Json
        }
        return cache
      },
      setCached: save,
      async setCachedPartial (value: Json) {
        await save({ ...cache, ...value })
      }
    }
  }
}
