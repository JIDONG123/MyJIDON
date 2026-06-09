<template>
  <el-card v-if="visible" class="vl-panel" shadow="never">
    <template #header>
      <div class="vl-panel-head">
        <span class="vl-panel-title">图像识别结果（Qwen-VL）</span>
        <el-tag v-if="statusTag" :type="statusTag.type" size="small">{{ statusTag.label }}</el-tag>
        <el-button
          v-if="showRetry"
          type="primary"
          link
          size="small"
          :loading="retrying"
          @click="onRetry"
        >
          重新识别
        </el-button>
      </div>
    </template>

    <div v-if="loading" class="vl-loading">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>{{ loadingHint }}</span>
    </div>

    <el-alert
      v-else-if="errorText"
      :title="errorText"
      type="warning"
      show-icon
      :closable="false"
    />

    <template v-else-if="hasContent">
      <p v-if="recognizedAt" class="vl-meta">识别时间：{{ recognizedAt }}</p>

      <div v-if="variant === 'compact'" class="vl-compact">
        <div v-for="block in compactSummaryBlocks" :key="block.key" class="vl-block">
          <h4 class="vl-block-title">{{ block.label }}</h4>
          <pre v-if="block.isCode" class="vl-code vl-code--compact">{{ block.value }}</pre>
          <p v-else class="vl-text">{{ block.value }}</p>
        </div>
        <el-collapse v-if="compactRawBlocks.length" class="vl-raw-collapse">
          <el-collapse-item title="展开识别原文" name="raw">
            <div v-for="block in compactRawBlocks" :key="block.key" class="vl-block">
              <h4 v-if="block.label" class="vl-block-title">{{ block.label }}</h4>
              <pre v-if="block.isCode" class="vl-code">{{ block.value }}</pre>
              <pre v-else class="vl-pre">{{ block.value }}</pre>
            </div>
          </el-collapse-item>
        </el-collapse>
      </div>

      <div v-else-if="variant === 'report' && reportBlocks.length" class="vl-report">
        <div v-for="block in reportBlocks" :key="block.key" class="vl-block">
          <h4 class="vl-block-title">{{ block.label }}</h4>
          <pre v-if="block.isCode" class="vl-code">{{ block.value }}</pre>
          <pre v-else-if="block.isPre" class="vl-pre">{{ block.value }}</pre>
          <p v-else class="vl-text">{{ block.value }}</p>
        </div>
      </div>

      <div v-else-if="structuredBlocks.length" class="vl-structured">
        <div v-for="block in structuredBlocks" :key="block.key" class="vl-block">
          <h4 class="vl-block-title">{{ block.label }}</h4>
          <pre v-if="block.isList" class="vl-pre">{{ block.value }}</pre>
          <p v-else class="vl-text">{{ block.value }}</p>
        </div>
      </div>
      <div v-else-if="plainText" class="vl-plain">
        <pre class="vl-pre">{{ plainText }}</pre>
      </div>
    </template>

    <p v-else class="vl-muted">暂无视觉识别结果（非图片提交或未配置 QWEN_VL_API_KEY）</p>
  </el-card>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { Loading } from '@element-plus/icons-vue'
import { getVlRecognition, postVlRecognize } from '../api/vlRecognition'
import { subscribeRt } from '../socket/rtBus'
import { formatDateTime } from '../utils/format'
import { ElMessage } from 'element-plus'

const props = defineProps({
  submissionId: { type: [Number, String], required: true },
  allowRetry: { type: Boolean, default: true },
  initial: { type: Object, default: null },
  /** default | report | compact — compact 用于企业导师端摘要展示 */
  variant: { type: String, default: 'default' },
})

const emit = defineEmits(['updated'])

const loading = ref(false)
const retrying = ref(false)
const loadingHint = ref('正在加载识别结果…')
const data = ref(props.initial || null)
let unsubRt = null

const visible = computed(() => Boolean(props.submissionId))

const status = computed(() => data.value?.status || props.initial?.vl_recognition_status || 'none')

const statusTag = computed(() => {
  const s = status.value
  if (s === 'done') return { type: 'success', label: '识别完成' }
  if (s === 'failed') return { type: 'danger', label: '识别失败' }
  if (s === 'skipped') return { type: 'info', label: '未识别' }
  if (s === 'pending' || s === 'running') return { type: 'warning', label: '识别中' }
  return { type: 'info', label: '未识别' }
})

const errorText = computed(() => {
  if (status.value === 'failed') {
    return data.value?.error || '视觉识别失败，请检查图片格式或 API 配置'
  }
  return ''
})

const plainText = computed(() => data.value?.text || '')
const recognizedAt = computed(() => {
  const t = data.value?.recognizedAt
  return t ? formatDateTime(t) : ''
})

const structured = computed(() => {
  const m = data.value?.structured
  if (!m) return null
  if (Array.isArray(m)) return m[0]?.structured || m[0] || null
  return m
})

const structuredBlocks = computed(() => {
  const s = structured.value
  if (!s || typeof s !== 'object') return []
  const steps = Array.isArray(s.operationSteps)
    ? s.operationSteps.filter((x) => String(x || '').trim())
    : []
  const blocks = [
    { key: 'type', label: '图片类型', value: s.imageType || '—' },
    { key: 'text', label: '提取文字', value: (s.extractedText || '').trim() || '（无）' },
  ]
  if (steps.length) {
    blocks.push({
      key: 'steps',
      label: '操作步骤',
      value: steps.map((x, i) => `${i + 1}. ${x}`).join('\n'),
      isList: true,
    })
  }
  blocks.push(
    { key: 'answer', label: '作答内容', value: (s.answerContent || '').trim() || '（无）' },
    { key: 'flow', label: '页面流程', value: (s.pageFlow || '').trim() || '（无）' }
  )
  if ((s.otherNotes || '').trim()) {
    blocks.push({ key: 'notes', label: '其他信息', value: String(s.otherNotes).trim() })
  }
  return blocks
})

function looksLikeCode(text) {
  const s = String(text || '').trim()
  if (!s) return false
  return /[{;}]|function\s|class\s|public\s|import\s|#include|def\s|SELECT\s/i.test(s) || s.split('\n').length > 3
}

function truncateText(text, max = 180) {
  const s = String(text || '').trim()
  if (!s) return ''
  if (s.length <= max) return s
  return `${s.slice(0, max)}…`
}

const compactSummaryBlocks = computed(() => {
  const s = structured.value
  if (!s || typeof s !== 'object') {
    const plain = truncateText(plainText.value, 220)
    return plain ? [{ key: 'summary', label: '提取文字摘要', value: plain }] : []
  }
  const blocks = []
  const imageType = (s.imageType || '').trim()
  if (imageType) blocks.push({ key: 'type', label: '图片类型', value: imageType })
  const extracted = truncateText(s.extractedText, 220)
  if (extracted) blocks.push({ key: 'text', label: '提取文字摘要', value: extracted })
  const steps = Array.isArray(s.operationSteps)
    ? s.operationSteps.filter((x) => String(x || '').trim())
    : []
  if (steps.length) {
    const preview = steps.slice(0, 4).map((x, i) => `${i + 1}. ${x}`).join('\n')
    blocks.push({
      key: 'steps',
      label: '操作步骤',
      value: steps.length > 4 ? `${preview}\n…共 ${steps.length} 步` : preview,
    })
  }
  const flow = truncateText(s.pageFlow, 160)
  if (flow) blocks.push({ key: 'flow', label: '页面流程', value: flow })
  const notes = truncateText(s.otherNotes, 160)
  if (notes) blocks.push({ key: 'notes', label: '其他信息', value: notes })
  return blocks
})

const compactRawBlocks = computed(() => {
  const s = structured.value
  const blocks = []
  if (s && typeof s === 'object') {
    const answer = (s.answerContent || '').trim()
    if (answer) {
      blocks.push({
        key: 'answer',
        label: looksLikeCode(answer) ? '代码内容' : '作答内容',
        value: answer,
        isCode: looksLikeCode(answer),
      })
    }
    const fullText = (s.extractedText || '').trim()
    if (fullText && fullText.length > 220) {
      blocks.push({ key: 'full-text', label: '完整提取文字', value: fullText, isCode: false })
    }
    const steps = Array.isArray(s.operationSteps)
      ? s.operationSteps.filter((x) => String(x || '').trim())
      : []
    if (steps.length > 4) {
      blocks.push({
        key: 'full-steps',
        label: '完整操作步骤',
        value: steps.map((x, i) => `${i + 1}. ${x}`).join('\n'),
      })
    }
    const flow = (s.pageFlow || '').trim()
    if (flow && flow.length > 160) {
      blocks.push({ key: 'full-flow', label: '完整页面流程', value: flow })
    }
  }
  const plain = String(plainText.value || '').trim()
  if (plain && !blocks.length) {
    blocks.push({ key: 'plain', label: '', value: plain, isCode: looksLikeCode(plain) })
  }
  return blocks
})

const reportBlocks = computed(() => {
  const s = structured.value
  if (!s || typeof s !== 'object') {
    const plain = String(plainText.value || '').trim()
    if (!plain) return []
    return [{ key: 'summary', label: '识别摘要', value: plain, isPre: true }]
  }
  const blocks = []
  const imageType = (s.imageType || '').trim()
  if (imageType) blocks.push({ key: 'type', label: '图片类型', value: imageType })
  const extracted = (s.extractedText || '').trim()
  if (extracted) blocks.push({ key: 'text', label: '提取文字', value: extracted, isPre: true })
  const answer = (s.answerContent || '').trim()
  if (answer) {
    const isCode = looksLikeCode(answer)
    blocks.push({
      key: 'code',
      label: '代码内容',
      value: answer,
      isCode,
      isPre: !isCode,
    })
  }
  const steps = Array.isArray(s.operationSteps)
    ? s.operationSteps.filter((x) => String(x || '').trim())
    : []
  const summaryParts = []
  if ((s.pageFlow || '').trim()) summaryParts.push(`页面流程：${String(s.pageFlow).trim()}`)
  if (steps.length) summaryParts.push(`操作步骤：\n${steps.map((x, i) => `${i + 1}. ${x}`).join('\n')}`)
  if ((s.otherNotes || '').trim()) summaryParts.push(`其他信息：${String(s.otherNotes).trim()}`)
  if (summaryParts.length) {
    blocks.push({ key: 'summary', label: '识别摘要', value: summaryParts.join('\n\n'), isPre: true })
  }
  return blocks
})

const hasContent = computed(() => {
  if (props.variant === 'compact') {
    return compactSummaryBlocks.value.length > 0 || compactRawBlocks.value.length > 0
  }
  if (props.variant === 'report') {
    return reportBlocks.value.length > 0
  }
  return structuredBlocks.value.length > 0 || String(plainText.value || '').trim().length > 0
})

const showRetry = computed(
  () => props.allowRetry && ['done', 'failed', 'skipped'].includes(status.value)
)

function applyPayload(payload) {
  if (!payload) return
  if (payload.status && !payload.vl_recognition_status) {
    data.value = payload
    return
  }
  if (payload.vl_recognition_status) {
    data.value = {
      status: payload.vl_recognition_status,
      text: payload.vl_recognition_text,
      structured: payload.vl_recognition_meta,
      error: payload.vl_recognition_error,
      recognizedAt: payload.vl_recognition_at,
    }
  }
}

async function fetchData() {
  if (!props.submissionId) return
  loading.value = true
  try {
    const res = await getVlRecognition(props.submissionId)
    if (res.success) {
      data.value = res.data
      emit('updated', res.data)
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || e.message || '加载识别结果失败')
  } finally {
    loading.value = false
  }
}

async function onRetry() {
  retrying.value = true
  loadingHint.value = '正在调用 Qwen-VL 识别图片…'
  try {
    const res = await postVlRecognize(props.submissionId)
    if (res.success) {
      data.value = res.data
      emit('updated', res.data)
      ElMessage.success('视觉识别已完成')
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || e.message || '视觉识别失败')
  } finally {
    retrying.value = false
  }
}

function onRt(payload) {
  if (!payload || payload.domain !== 'grading') return
  const sid = Number(props.submissionId)
  if (payload.submissionId != null && Number(payload.submissionId) !== sid) return
  if (payload.action === 'vl_start') {
    loading.value = true
    loadingHint.value = '正在进行图片视觉识别…'
  }
  if (payload.action === 'vl_done' || payload.action === 'vl_failed') {
    loading.value = false
    void fetchData()
  }
}

watch(
  () => props.initial,
  (v) => {
    if (v) applyPayload(v)
  },
  { deep: true }
)

watch(
  () => props.submissionId,
  () => {
    if (!props.initial) void fetchData()
  }
)

onMounted(() => {
  if (props.initial) {
    applyPayload(props.initial)
  } else {
    void fetchData()
  }
  unsubRt = subscribeRt(onRt)
})

onUnmounted(() => {
  if (unsubRt) unsubRt()
})
</script>

<style scoped>
.vl-panel {
  margin-top: 16px;
  border-radius: 12px;
  border: 1px solid var(--sg-border, #e8eef5);
}
.vl-panel-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.vl-panel-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--sg-text, #0b3d6d);
}
.vl-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--sg-text-secondary, #64748b);
  font-size: 13px;
}
.vl-meta {
  margin: 0 0 12px;
  font-size: 12px;
  color: #64748b;
}
.vl-block {
  margin-bottom: 12px;
}
.vl-block-title {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 600;
  color: #334155;
}
.vl-text,
.vl-pre {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: #1e293b;
  white-space: pre-wrap;
  word-break: break-word;
}
.vl-pre {
  max-height: 280px;
  overflow: auto;
  padding: 10px 12px;
  background: #f8fafc;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}
.vl-code {
  margin: 0;
  max-height: 320px;
  overflow: auto;
  padding: 12px 14px;
  background: #f3f4f6;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  font-family: ui-monospace, 'Cascadia Mono', 'Segoe UI Mono', Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.55;
  color: #1f2937;
  white-space: pre-wrap;
  word-break: break-word;
}
.vl-code--compact {
  max-height: 120px;
}
.vl-compact {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.vl-raw-collapse {
  margin-top: 8px;
  border: none;
}
.vl-raw-collapse :deep(.el-collapse-item__header) {
  font-size: 13px;
  color: #2563eb;
  border-bottom: none;
}
.vl-raw-collapse :deep(.el-collapse-item__wrap) {
  border-bottom: none;
}
</style>
