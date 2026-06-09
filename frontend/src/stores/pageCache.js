import { defineStore } from 'pinia'
import { createPageCache } from '../utils/pageCache'

export const usePageCacheStore = defineStore('pageCache', {
  state: () => ({
    /** @type {ReturnType<typeof createPageCache>} */
    _cache: createPageCache(),
  }),
  actions: {
    get(key) {
      return this._cache.get(key)
    },
    set(key, data) {
      this._cache.set(key, data)
    },
    has(key) {
      return this._cache.has(key)
    },
    delete(key) {
      this._cache.delete(key)
    },
    clear() {
      this._cache.clear()
    },
  },
})
