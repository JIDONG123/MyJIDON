<template>
  <el-dialog
    v-model="visible"
    title="提交历史版本"
    width="720px"
    destroy-on-close
    class="history-dialog"
    @closed="onClosed"
  >
    <div v-loading="loading" class="history-dialog-body">
      <div v-if="meta" class="current-banner">
        <div>
          <strong>第 {{ meta.currentVersion }} 版</strong>
          <el-tag size="small" type="success" effect="dark">当前生效</el-tag>
        </div>
        <p class="muted">以下为已归档的历史版本，只读查看，不可编辑。</p>
      </div>

      <el-empty v-if="!loading && (!items.length)" description="暂无历史提交版本" :image-size="72" />

      <div v-for="item in items" :key="item.id" class="history-card">
        <div class="history-card__head">
          <div>
            <strong>第 {{ item.version }} 版</strong>
            <el-tag size="small" type="info" effect="plain">已归档</el-tag>
          </div>
          <span class="time">{{ formatDateTime(item.archivedAt) }}</span>
        </div>

        <dl class="detail-grid">
          <dt>归档说明</dt>
          <dd>{{ item.archivedReasonLabel || item.archivedReason || '—' }}</dd>
          <dt v-if="item.returnReason">退回/处理说明</dt>
          <dd v-if="item.returnReason">{{ item.returnReason }}</dd>
        </dl>

        <div v-if="item.gradingSnapshot" class="score-row">
          <span>AI 分：{{ displayNum(item.gradingSnapshot.totalScore) }}</span>
          <span>教师分：{{ displayNum(item.gradingSnapshot.humanScore) }}</span>
          <span>综合分：{{ displayNum(item.gradingSnapshot.finalScore) }}</span>
        </div>

        <div v-if="item.submissionText" class="block">
          <h4>文字说明</h4>
          <pre class="pre">{{ item.submissionText }}</pre>
        </div>

        <div v-if="item.codeContent" class="block">
          <h4>代码内容<span v-if="item.codeLanguage">（{{ item.codeLanguage }}）</span></h4>
          <pre class="pre code">{{ item.codeContent }}</pre>
        </div>

        <div v-if="item.attachmentsSummary?.length" class="block">
          <h4>附件摘要</h4>
          <ul class="attach-list">
            <li v-for="(a, i) in item.attachmentsSummary" :key="i">
              {{ a.fileName }}<span v-if="a.label">（{{ a.label }}）</span>
            </li>
          </ul>
        </div>

        <div v-if="item.gradingSnapshot?.aiComment" class="block">
          <h4>当时 AI 评语</h4>
          <p class="comment">{{ item.gradingSnapshot.aiComment }}</p>
        </div>
        <div v-if="item.gradingSnapshot?.humanComment" class="block">
          <h4>当时教师评语</h4>
          <p class="comment">{{ item.gradingSnapshot.humanComment }}</p>
        </div>
      </div>
    </div>
    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { getSubmissionHistory } from '../api/submission'
import { formatDateTime } from '../utils/format'

const props = defineProps({
  submissionId: { type: [String, Number], required: true },
})

const visible = ref(false)
const loading = ref(false)
const meta = ref(null)
const items = ref([])

function displayNum(v) {
  if (v == null || v === '') return '—'
  return v
}

async function loadHistory() {
  if (!props.submissionId) return
  loading.value = true
  meta.value = null
  items.value = []
  try {
    const res = await getSubmissionHistory(props.submissionId)
    if (res.success) {
      meta.value = res.data
      items.value = res.data?.items || []
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '加载历史版本失败')
  } finally {
    loading.value = false
  }
}

function open() {
  visible.value = true
  void loadHistory()
}

function onClosed() {
  meta.value = null
  items.value = []
}

defineExpose({ open })
</script>

<style scoped>
.history-dialog-body {
  min-height: 120px;
  max-height: 65vh;
  overflow-y: auto;
}
.current-banner {
  padding: 12px 14px;
  margin-bottom: 14px;
  border-radius: 8px;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
}
.current-banner .muted {
  margin: 6px 0 0;
  font-size: 13px;
  color: #64748b;
}
.history-card {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 14px 16px;
  margin-bottom: 12px;
  background: #fff;
}
.history-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}
.history-card__head .time {
  font-size: 12px;
  color: #94a3b8;
}
.detail-grid {
  display: grid;
  grid-template-columns: 96px 1fr;
  gap: 6px 10px;
  font-size: 13px;
  margin: 0 0 10px;
}
.detail-grid dt {
  color: #64748b;
}
.detail-grid dd {
  margin: 0;
}
.score-row {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  font-size: 13px;
  margin-bottom: 10px;
  color: #334155;
}
.block h4 {
  margin: 0 0 6px;
  font-size: 13px;
  color: #475569;
}
.pre {
  margin: 0;
  padding: 10px 12px;
  background: #f8fafc;
  border-radius: 6px;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  line-height: 1.55;
  max-height: 180px;
  overflow: auto;
}
.pre.code {
  font-family: ui-monospace, monospace;
}
.attach-list {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
}
.comment {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: #334155;
}
</style>
