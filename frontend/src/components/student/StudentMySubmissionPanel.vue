<template>
  <el-drawer
    :model-value="visible"
    title="我的提交"
    size="720px"
    destroy-on-close
    @close="emit('update:visible', false)"
  >
    <el-skeleton v-if="loading" animated :rows="12" />

    <el-empty v-else-if="!data" description="暂无提交记录" />

    <template v-else>
      <section class="detail-section">
        <h3 class="detail-section__title">提交信息</h3>
        <dl class="detail-dl">
          <div class="detail-dl__row">
            <dt>任务名称</dt>
            <dd>{{ data.task_title || '—' }}</dd>
          </div>
          <div class="detail-dl__row">
            <dt>提交时间</dt>
            <dd>{{ formatDateTime(data.submitted_at) || '—' }}</dd>
          </div>
          <div class="detail-dl__row">
            <dt>是否迟交</dt>
            <dd>{{ data.is_late ? '是' : '否' }}</dd>
          </div>
          <div class="detail-dl__row">
            <dt>是否修改</dt>
            <dd>{{ data.is_revised ? '是' : '否' }}</dd>
          </div>
          <div class="detail-dl__row">
            <dt>提交次数</dt>
            <dd>{{ data.submit_used_count ?? '—' }} / {{ data.task_max_submissions ?? '—' }}</dd>
          </div>
          <div class="detail-dl__row">
            <dt>内容安全</dt>
            <dd>
              <el-tag size="small" effect="light" :type="safetyTagType(data.safety_status)">
                {{ safetyLabel(data.safety_status) }}
              </el-tag>
            </dd>
          </div>
        </dl>
      </section>

      <section class="detail-section">
        <h3 class="detail-section__title">文字说明</h3>
        <pre v-if="data.submission_text?.trim()" class="body-pre">{{ data.submission_text }}</pre>
        <p v-else class="muted">暂无文字说明</p>
      </section>

      <section v-if="data.code_content?.trim()" class="detail-section">
        <h3 class="detail-section__title">
          代码内容{{ data.code_language ? `（${data.code_language}）` : '' }}
        </h3>
        <pre class="body-pre code-pre">{{ data.code_content }}</pre>
      </section>

      <section class="detail-section">
        <h3 class="detail-section__title">附件列表</h3>
        <ul v-if="attachments.length" class="attach-list">
          <li v-for="att in attachments" :key="att.id || att.fileUrl" class="attach-item">
            <div class="attach-main">
              <span class="attach-name">{{ att.originalName || att.fileName }}</span>
              <span class="attach-sub">
                {{ formatFileSize(att.fileSize) }} · {{ att.fileExt || att.mimeType || '—' }}
                <template v-if="isImage(att)"> · 识别：{{ visionLabel(att.visionStatus) }}</template>
                · 安全：{{ safetyLabel(att.safetyStatus) }}
              </span>
            </div>
            <div class="attach-actions">
              <a
                v-if="att.fileUrl"
                class="action-link"
                :href="att.fileUrl"
                target="_blank"
                rel="noopener noreferrer"
              >预览</a>
              <a
                v-if="downloadHref(att)"
                class="action-link"
                :href="downloadHref(att)"
                rel="noopener noreferrer"
              >下载</a>
            </div>
          </li>
        </ul>
        <p v-else class="muted">暂无附件</p>
      </section>

      <section v-if="imageAttachments.length" class="detail-section">
        <h3 class="detail-section__title">图片识别结果</h3>
        <div v-for="att in imageAttachments" :key="att.id || att.fileName" class="vl-block">
          <p class="vl-file">{{ att.originalName || att.fileName }}</p>
          <pre v-if="att.visionText?.trim()" class="body-pre">{{ att.visionText }}</pre>
          <p v-else class="muted">{{ visionEmptyHint(att.visionStatus) }}</p>
        </div>
      </section>

      <section v-if="data.codeRun?.enabled" class="detail-section">
        <h3 class="detail-section__title">代码运行检查</h3>
        <SubmissionCodeRunPanel embedded :code-run="data.codeRun" />
      </section>

      <section v-if="grading" class="detail-section">
        <h3 class="detail-section__title">成绩摘要</h3>
        <div class="stat-grid">
          <div class="stat-box">
            <span class="stat-box__label">AI 分</span>
            <span class="stat-box__value">{{ grading.totalScore ?? '—' }}</span>
          </div>
          <div class="stat-box">
            <span class="stat-box__label">教师分</span>
            <span class="stat-box__value">{{ grading.humanScore ?? '—' }}</span>
          </div>
          <div class="stat-box">
            <span class="stat-box__label">综合分</span>
            <span class="stat-box__value">{{ grading.finalScore ?? '—' }}</span>
          </div>
        </div>
        <p v-if="grading.aiComment" class="comment"><strong>AI 评语：</strong>{{ grading.aiComment }}</p>
        <p v-if="grading.humanComment" class="comment"><strong>教师评语：</strong>{{ grading.humanComment }}</p>
        <p v-if="grading.enterpriseComment" class="comment"><strong>企业导师：</strong>{{ grading.enterpriseComment }}</p>
      </section>

      <section class="detail-section detail-section--actions">
        <h3 class="detail-section__title">操作</h3>
        <div class="action-row">
          <el-button type="primary" @click="emit('view-results')">查看成绩与报告</el-button>
        </div>
      </section>
    </template>
  </el-drawer>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { getMySubmissionByTask } from '../../api/submission'
import { formatDateTime } from '../../utils/format'
import SubmissionCodeRunPanel from '../codeRunner/SubmissionCodeRunPanel.vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  taskId: { type: [String, Number], required: true },
})

const emit = defineEmits(['update:visible', 'view-results', 'loaded'])

const loading = ref(false)
const data = ref(null)

const attachments = computed(() => data.value?.attachments || [])
const imageAttachments = computed(() => attachments.value.filter((a) => isImage(a)))
const grading = computed(() => data.value?.grading || null)

function isImage(att) {
  const ext = String(att.fileExt || '').toLowerCase()
  const mime = String(att.mimeType || '')
  return mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext)
}

function formatFileSize(bytes) {
  if (bytes == null || Number.isNaN(Number(bytes))) return '—'
  const n = Number(bytes)
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function safetyLabel(s) {
  const m = { passed: '通过', pending_review: '待审核', blocked: '已拦截', manual_approved: '人工通过' }
  return m[s] || s || '—'
}

function safetyTagType(s) {
  const m = { passed: 'success', manual_approved: 'success', pending_review: 'warning', blocked: 'danger' }
  return m[s] || 'info'
}

function visionLabel(s) {
  const m = { done: '已完成', skipped: '未启用', failed: '失败', pending: '待识别' }
  return m[s] || s || '—'
}

function visionEmptyHint(status) {
  if (status === 'skipped') return '图像识别未启用，当前不影响提交'
  return '暂无图像识别结果'
}

function downloadHref(att) {
  if (!data.value?.id) return att.fileUrl || ''
  if (att.legacy || att.id == null) {
    return `/api/submissions/${data.value.id}/attachments/legacy/download`
  }
  return `/api/submissions/${data.value.id}/attachments/${att.id}/download`
}

async function load() {
  if (!props.taskId) return
  loading.value = true
  try {
    const res = await getMySubmissionByTask(props.taskId)
    if (res.success) {
      data.value = res.data
      emit('loaded', res.data)
    }
  } catch {
    data.value = null
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.taskId, props.visible],
  ([tid, vis]) => {
    if (tid && vis) load()
  }
)

defineExpose({ reload: load })
</script>

<style scoped>
.detail-section {
  margin-bottom: 24px;
}

.detail-section__title {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 600;
  color: #334155;
}

.detail-dl__row {
  display: grid;
  grid-template-columns: 96px 1fr;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid #f1f5f9;
  font-size: 14px;
}

.detail-dl__row dt {
  margin: 0;
  color: #64748b;
}

.detail-dl__row dd {
  margin: 0;
  color: #1e293b;
  word-break: break-word;
}

.body-pre {
  margin: 0;
  padding: 10px 12px;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
  line-height: 1.55;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  max-height: 280px;
  overflow: auto;
}

.code-pre {
  font-family: ui-monospace, Menlo, Consolas, monospace;
}

.muted {
  margin: 0;
  font-size: 13px;
  color: #94a3b8;
}

.attach-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.attach-item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid #f1f5f9;
}

.attach-name {
  display: block;
  font-size: 13px;
  color: #1e293b;
  word-break: break-all;
}

.attach-sub {
  display: block;
  font-size: 12px;
  color: #64748b;
  margin-top: 2px;
}

.action-link {
  font-size: 13px;
  color: #1d5fd6;
  text-decoration: none;
  margin-left: 8px;
}

.vl-block + .vl-block {
  margin-top: 12px;
}

.vl-file {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 500;
  color: #475569;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.stat-box {
  padding: 12px 14px;
  background: #f8fafc;
  border-radius: 10px;
  border: 1px solid #eef2f7;
}

.stat-box__label {
  display: block;
  font-size: 12px;
  color: #64748b;
  margin-bottom: 4px;
}

.stat-box__value {
  font-size: 20px;
  font-weight: 700;
  color: #0f172a;
  font-variant-numeric: tabular-nums;
}

.comment {
  margin: 12px 0 0;
  font-size: 13px;
  line-height: 1.55;
  color: #334155;
}

.detail-section--actions .action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
</style>
