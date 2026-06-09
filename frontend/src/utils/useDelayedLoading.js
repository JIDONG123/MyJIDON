import { ref, watch, onBeforeUnmount, unref, isRef } from 'vue'

/**
 * 延迟显示 skeleton，避免快请求闪一下骨架屏。
 * @param {import('vue').Ref<boolean>|boolean} loadingRef
 * @param {number} delayMs 默认 180ms
 */
export function useDelayedSkeleton(loadingRef, delayMs = 180) {
  const show = ref(false)
  let timer = null

  const stop = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  watch(
    () => unref(loadingRef),
    (loading) => {
      stop()
      if (loading) {
        timer = setTimeout(() => {
          if (unref(loadingRef)) show.value = true
        }, delayMs)
      } else {
        show.value = false
      }
    },
    { immediate: true }
  )

  onBeforeUnmount(stop)

  return show
}

/** @deprecated 别名 */
export function useDelayedLoading(loadingRef, delayMs = 180) {
  return useDelayedSkeleton(isRef(loadingRef) ? loadingRef : ref(loadingRef), delayMs)
}
