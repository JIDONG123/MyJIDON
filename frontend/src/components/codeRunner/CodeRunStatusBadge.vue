<template>
  <el-tag v-if="status" :type="tagType" size="small" effect="plain">{{ label }}</el-tag>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  status: { type: String, default: '' },
})

const map = {
  pending: { type: 'info', label: '排队中' },
  running: { type: 'warning', label: '运行中' },
  completed: { type: 'success', label: '通过' },
  failed: { type: 'danger', label: '失败' },
  timeout: { type: 'danger', label: '超时' },
  cancelled: { type: 'info', label: '已取消' },
  draft: { type: 'info', label: '草稿' },
  published: { type: 'success', label: '已发布' },
  closed: { type: 'warning', label: '已关闭' },
}

const tagType = computed(() => map[props.status]?.type || 'info')
const label = computed(() => map[props.status]?.label || props.status)
</script>
