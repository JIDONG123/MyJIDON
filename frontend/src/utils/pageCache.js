/** 页面级内存缓存（stale-while-revalidate 用） */
const DEFAULT_TTL_MS = 5 * 60 * 1000

export function createPageCache(ttlMs = DEFAULT_TTL_MS) {
  const store = new Map()

  function isFresh(entry) {
    return entry && Date.now() - entry.at <= ttlMs
  }

  return {
    get(key) {
      const entry = store.get(key)
      if (!isFresh(entry)) {
        if (entry) store.delete(key)
        return null
      }
      return entry.data
    },
    set(key, data) {
      store.set(key, { data, at: Date.now() })
    },
    has(key) {
      return isFresh(store.get(key))
    },
    delete(key) {
      store.delete(key)
    },
    clear() {
      store.clear()
    },
  }
}

export const globalPageCache = createPageCache()
