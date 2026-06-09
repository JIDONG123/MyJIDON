<template>
  <div class="submission-summary">
    <dl class="summary-dl">
      <div class="summary-row">
        <dt>学生姓名</dt>
        <dd>{{ studentName || '—' }}</dd>
      </div>
      <div class="summary-row">
        <dt>班级</dt>
        <dd>{{ className || '—' }}</dd>
      </div>
      <div class="summary-row">
        <dt>提交时间</dt>
        <dd>{{ submittedAtText }}</dd>
      </div>
      <div v-if="fileName" class="summary-row">
        <dt>附件</dt>
        <dd class="file-dd">
          <span class="fname">{{ fileName }}</span>
          <span v-if="fileType" class="ftype">{{ fileType }}</span>
        </dd>
      </div>
    </dl>

    <div v-if="extractSummary" class="extract-box">
      <span class="extract-label">提取摘要</span>
      <p class="extract-text">{{ extractSummary }}</p>
    </div>
    <p v-else class="empty-hint">暂无文字摘要，请查看附件或下方原始材料。</p>

    <div class="action-row">
      <el-button v-if="hasFullText" size="small" plain @click="drawerText = true">查看全文</el-button>
      <el-button v-if="hasCode" size="small" plain @click="drawerCode = true">查看完整代码</el-button>
      <a
        v-if="fileUrl"
        class="el-button el-button--small is-plain"
        :href="fileUrl"
        target="_blank"
        rel="noopener noreferrer"
      >预览附件</a>
    </div>

    <el-drawer v-model="drawerText" title="作业全文 / 提取文字" size="520px" direction="rtl">
      <div class="drawer-body">
        <section v-if="workText" class="drawer-section">
          <h4>作业正文</h4>
          <pre class="drawer-pre">{{ workText }}</pre>
        </section>
        <section v-if="vlExtractedText" class="drawer-section">
          <h4>图片提取文字</h4>
          <pre class="drawer-pre">{{ vlExtractedText }}</pre>
        </section>
      </div>
    </el-drawer>

    <el-drawer v-model="drawerCode" title="完整代码" size="560px" direction="rtl">
      <pre class="drawer-pre drawer-pre--code">{{ codeContent }}</pre>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { formatDateTime } from '../utils/format'

const props = defineProps({
  studentName: { type: String, default: '' },
  className: { type: String, default: '' },
  submittedAt: { type: [String, Date], default: null },
  workText: { type: String, default: '' },
  fileName: { type: String, default: '' },
  fileUrl: { type: String, default: '' },
  fileType: { type: String, default: '' },
  vlMeta: { type: Object, default: null },
  vlPlainText: { type: String, default: '' },
})

const drawerText = ref(false)
const drawerCode = ref(false)

const submittedAtText = computed(() => formatDateTime(props.submittedAt))

function parseStructured(meta) {
  if (!meta) return null
  let m = meta
  if (typeof m === 'string') {
    try {
      m = JSON.parse(m)
    } catch {
      return null
    }
  }
  if (Array.isArray(m)) return m[0]?.structured || m[0] || null
  return m.structured || m
}

const structured = computed(() => parseStructured(props.vlMeta))

const vlExtractedText = computed(() => {
  const s = structured.value
  if (s?.extractedText) return String(s.extractedText).trim()
  return String(props.vlPlainText || '').trim()
})

function looksLikeCode(text) {
  const s = String(text || '').trim()
  if (!s) return false
  return /[{;}]|function\s|class\s|public\s|import\s|#include|def\s|SELECT\s/i.test(s) || s.split('\n').length > 3
}

const codeContent = computed(() => {
  const fromVl = structured.value?.answerContent
  if (fromVl && looksLikeCode(fromVl)) return String(fromVl).trim()
  if (looksLikeCode(props.workText)) return String(props.workText).trim()
  return ''
})

const hasCode = computed(() => codeContent.value.length > 0)

const hasFullText = computed(() => {
  return Boolean(String(props.workText || '').trim() || vlExtractedText.value)
})

function truncate(s, max = 140) {
  const t = String(s || '').trim()
  if (!t) return ''
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}

const extractSummary = computed(() => {
  const parts = []
  if (structured.value?.imageType) parts.push(`图片类型：${structured.value.imageType}`)
  if (vlExtractedText.value) parts.push(truncate(vlExtractedText.value, 100))
  else if (props.workText) parts.push(truncate(props.workText, 120))
  if (structured.value?.pageFlow) parts.push(truncate(`流程：${structured.value.pageFlow}`, 60))
  return parts.join(' · ') || ''
})
</script>

<style scoped>
.submission-summary {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.summary-dl {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.summary-row {
  display: grid;
  grid-template-columns: 72px 1fr;
  gap: 8px;
  align-items: start;
}

.summary-row dt {
  margin: 0;
  font-size: 12px;
  color: #9ca3af;
}

.summary-row dd {
  margin: 0;
  font-size: 13px;
  color: #1f2d3d;
  font-weight: 500;
  word-break: break-word;
}

.file-dd {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.fname {
  font-weight: 500;
}

.ftype {
  font-size: 11px;
  color: #9ca3af;
  font-weight: 400;
}

.extract-box {
  padding: 10px 12px;
  background: #f9fafb;
  border: 1px solid #eef1f6;
  border-radius: 8px;
}

.extract-label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: #6b7280;
  margin-bottom: 6px;
}

.extract-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: #374151;
}

.empty-hint {
  margin: 0;
  font-size: 12px;
  color: #9ca3af;
}

.action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

a.el-button {
  text-decoration: none;
}

.drawer-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.drawer-section h4 {
  margin: 0 0 8px;
  font-size: 13px;
  color: #6b7280;
}

.drawer-pre {
  margin: 0;
  padding: 12px;
  background: #f8fafc;
  border: 1px solid #e5eaf2;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 70vh;
  overflow: auto;
  font-family: inherit;
}

.drawer-pre--code {
  font-family: ui-monospace, 'Cascadia Mono', Menlo, Consolas, monospace;
  background: #1e293b;
  color: #e2e8f0;
  border-color: #334155;
}
</style>
