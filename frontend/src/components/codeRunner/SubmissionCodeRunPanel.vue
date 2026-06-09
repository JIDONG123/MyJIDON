<template>
  <div v-if="visible" class="submission-code-run" :class="{ 'submission-code-run--embedded': embedded }">
    <div v-if="!embedded" class="panel-head">
      <h3 class="panel-subtitle">代码运行检查</h3>
      <CodeRunStatusBadge v-if="status" :status="displayStatus" />
    </div>
    <CodeRunOutputPanel
      :status="displayStatus"
      :summary="summaryText"
      :stdout="result?.stdout"
      :stderr="result?.stderr"
      :compile-log="result?.compileLog"
      :duration-ms="result?.durationMs"
      :loading="loading"
    />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import CodeRunOutputPanel from './CodeRunOutputPanel.vue'
import CodeRunStatusBadge from './CodeRunStatusBadge.vue'

const props = defineProps({
  /** getSubmissionById 返回的 data.codeRun */
  codeRun: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  /** 嵌入抽屉等容器时隐藏重复标题 */
  embedded: { type: Boolean, default: false },
})

const visible = computed(() => Boolean(props.codeRun?.enabled))

const status = computed(() => props.codeRun?.status || '')

const displayStatus = computed(() => {
  const s = status.value
  if (s === 'completed') return 'completed'
  if (s === 'failed' || s === 'timeout') return s
  if (s === 'running' || s === 'pending') return s
  if (props.codeRun?.result?.runExitCode === 0) return 'completed'
  if (props.codeRun?.result?.runExitCode != null) return 'failed'
  return s || 'pending'
})

const result = computed(() => props.codeRun?.result || null)

const summaryText = computed(
  () => props.codeRun?.summary || result.value?.summary || ''
)
</script>

<style scoped>
.submission-code-run {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px dashed var(--sg-border, #e2e8f0);
}

.submission-code-run--embedded {
  margin-top: 0;
  padding-top: 0;
  border-top: none;
}

.panel-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.panel-subtitle {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--sg-text-primary, #0f172a);
}
</style>
