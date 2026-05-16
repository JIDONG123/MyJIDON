import { ref, computed, watch } from 'vue'

const STORAGE_KEY = 'sg-table-density'

/** @typedef {'default' | 'compact' | 'comfortable'} DensityMode */

export function useTableDensity() {
  const stored = localStorage.getItem(STORAGE_KEY)
  const mode = ref(
    /** @type {DensityMode} */ (
      ['default', 'compact', 'comfortable'].includes(stored) ? stored : 'default'
    ),
  )

  watch(mode, (v) => {
    localStorage.setItem(STORAGE_KEY, v)
  })

  const tableSize = computed(() => {
    if (mode.value === 'compact') return 'small'
    if (mode.value === 'comfortable') return 'large'
    return 'default'
  })

  const labelMap = { default: '标准', compact: '紧凑', comfortable: '宽松' }

  return {
    mode,
    tableSize,
    labelMap,
  }
}
