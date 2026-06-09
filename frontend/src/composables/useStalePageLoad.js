import { ref, onMounted, onActivated } from 'vue'
import { usePageCacheStore } from '../stores/pageCache'
import { useDelayedSkeleton } from '../utils/useDelayedLoading'

/**
 * 慢页面通用：缓存先显 + 后台刷新 + 延迟 skeleton。
 * @template T
 * @param {string} cacheKey
 * @param {() => Promise<T>} fetcher
 * @param {{
 *   hydrate?: (payload: T) => void,
 *   hasContent?: () => boolean,
 *   keepAlive?: boolean,
 *   skeletonDelay?: number,
 * }} [options]
 */
export function useStalePageLoad(cacheKey, fetcher, options = {}) {
  const {
    hydrate,
    hasContent = () => false,
    keepAlive = true,
    skeletonDelay = 180,
  } = options

  const cacheStore = usePageCacheStore()
  const loading = ref(false)
  const refreshing = ref(false)
  const showSkeleton = useDelayedSkeleton(
    () => loading.value && !hasContent(),
    skeletonDelay
  )

  const cached = cacheStore.get(cacheKey)
  if (cached && hydrate) hydrate(cached)

  async function reload({ background = false } = {}) {
    const hasData = hasContent() || cacheStore.has(cacheKey)
    if (background && hasData) {
      refreshing.value = true
    } else if (!hasData) {
      loading.value = true
    } else {
      refreshing.value = true
    }

    try {
      const data = await fetcher()
      cacheStore.set(cacheKey, data)
      if (hydrate) hydrate(data)
      return data
    } finally {
      loading.value = false
      refreshing.value = false
    }
  }

  onMounted(() => {
    reload({ background: cacheStore.has(cacheKey) })
  })

  if (keepAlive) {
    onActivated(() => {
      reload({ background: true })
    })
  }

  return { loading, refreshing, showSkeleton, reload }
}
