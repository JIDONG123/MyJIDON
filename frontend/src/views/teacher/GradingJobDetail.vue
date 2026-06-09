<template>
  <div class="grading-job-detail">
    <header class="detail-head">
      <div class="detail-head__left">
        <el-button plain :icon="ArrowLeft" @click="goBack">{{ backLabel }}</el-button>
      </div>
      <div class="detail-head__main">
        <h1 class="detail-title">批改任务详情</h1>
        <p v-if="job" class="detail-subtitle">
          <span class="detail-id">#{{ job.id }}</span>
          {{ jobScopeLabel(job.scope_type) }} · {{ job.task_title || '未关联实训任务' }}
        </p>
      </div>
      <div v-if="job" class="detail-head__actions">
        <el-button v-if="job.task_id" type="primary" plain @click="goSubmissions">批改结果</el-button>
        <el-button
          v-if="['pending', 'running'].includes(job.status)"
          type="warning"
          plain
          @click="onCancel"
        >
          取消任务
        </el-button>
        <el-button
          v-if="['partial_failed', 'failed', 'completed'].includes(job.status) && job.failed_count > 0"
          type="primary"
          @click="onRetry"
        >
          重试失败项
        </el-button>
      </div>
    </header>

    <el-skeleton v-if="loading" animated :rows="10" class="detail-skeleton" />

    <template v-else-if="job">
      <div class="info-banner" role="note">
        <el-icon class="info-banner__icon"><InfoFilled /></el-icon>
        <p class="info-banner__text">
          本任务由后台 Worker 异步执行。执行期间可离开页面继续使用系统；完成后可在「批改结果」中查看各提交评分与复核状态。
        </p>
      </div>

      <div class="panel">
        <div class="panel__header">
          <h2 class="panel__title">基本信息</h2>
        </div>
        <div class="panel__body">
          <div class="info-grid">
            <div class="info-item">
              <span class="info-item__label">任务编号</span>
              <span class="info-item__value">#{{ job.id }}</span>
            </div>
            <div class="info-item">
              <span class="info-item__label">批改类型</span>
              <span class="info-item__value">{{ jobScopeLabel(job.scope_type) }}</span>
            </div>
            <div class="info-item info-item--wide">
              <span class="info-item__label">关联实训</span>
              <span class="info-item__value">{{ job.task_title || '—' }}</span>
            </div>
            <div class="info-item">
              <span class="info-item__label">执行状态</span>
              <el-tag size="small" :type="jobStatusTagType(job.status)">
                {{ jobStatusLabel(job.status) }}
              </el-tag>
            </div>
            <div class="info-item">
              <span class="info-item__label">发起人</span>
              <span class="info-item__value">{{ job.creator_name || '—' }}</span>
            </div>
            <div class="info-item">
              <span class="info-item__label">创建时间</span>
              <span class="info-item__value">{{ formatDateTime(job.created_at) }}</span>
            </div>
            <div class="info-item">
              <span class="info-item__label">完成时间</span>
              <span class="info-item__value">{{ job.finished_at ? formatDateTime(job.finished_at) : '—' }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="panel__header panel__header--row">
          <h2 class="panel__title">执行进度</h2>
          <span class="panel__meta">实时推送已启用，状态变更时自动刷新</span>
        </div>
        <div class="panel__body">
          <div class="progress-stats">
            <div class="progress-stat">
              <span class="progress-stat__label">总数</span>
              <span class="progress-stat__value">{{ job.total_count ?? 0 }}</span>
            </div>
            <div class="progress-stat progress-stat--ok">
              <span class="progress-stat__label">成功</span>
              <span class="progress-stat__value">{{ job.success_count ?? 0 }}</span>
            </div>
            <div class="progress-stat progress-stat--fail">
              <span class="progress-stat__label">失败</span>
              <span class="progress-stat__value">{{ job.failed_count ?? 0 }}</span>
            </div>
            <div class="progress-stat">
              <span class="progress-stat__label">已完成</span>
              <span class="progress-stat__value">{{ job.finished_count ?? 0 }}</span>
            </div>
          </div>
          <el-progress
            :percentage="job.progress ?? 0"
            :status="progressStatus(job.status)"
            :stroke-width="12"
            class="job-progress-bar"
          />
          <p class="progress-caption">
            {{ job.finished_count }}/{{ job.total_count }}（{{ job.progress ?? 0 }}%）
          </p>
          <div v-if="job.message || job.error_summary" class="exec-info">
            <span class="exec-info__label">执行信息</span>
            <p v-if="job.message" class="exec-info__text">{{ job.message }}</p>
            <p v-if="job.error_summary" class="exec-info__text exec-info__text--error">{{ job.error_summary }}</p>
          </div>
          <el-alert
            v-if="showWorkerHint"
            type="warning"
            :closable="false"
            show-icon
            title="批改任务已入队，但暂未被 Worker 处理，请确认批改 Worker 已启动。"
            class="worker-hint"
          />
        </div>
      </div>

      <div class="panel">
        <div class="panel__header panel__header--row">
          <h2 class="panel__title">批改明细</h2>
          <span class="panel__meta">共 {{ itemTotal }} 条</span>
        </div>
        <div class="panel__body panel__body--table">
          <el-table :data="items" stripe class="items-table">
            <el-table-column prop="submission_id" label="提交 ID" width="100" />
            <el-table-column prop="student_name" label="学生" min-width="120" show-overflow-tooltip />
            <el-table-column prop="student_no" label="学号" width="120" />
            <el-table-column label="状态" width="110" align="center">
              <template #default="{ row }">
                <el-tag size="small" :type="itemStatusTagType(row.status)">
                  {{ itemStatusLabel(row.status) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="阶段" width="120" show-overflow-tooltip>
              <template #default="{ row }">
                {{ itemStageLabel(row.stage) }}
              </template>
            </el-table-column>
            <el-table-column prop="error_message" label="错误信息" min-width="200" show-overflow-tooltip />
            <el-table-column label="操作" width="100" fixed="right" align="center">
              <template #default="{ row }">
                <el-button link type="primary" @click="goGrading(row.submission_id)">批改页</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>
    </template>

    <div v-else class="panel empty-panel">
      <el-empty description="任务不存在或无权查看">
        <el-button type="primary" plain @click="goBack">{{ backLabel }}</el-button>
      </el-empty>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, InfoFilled } from '@element-plus/icons-vue'
import { getGradingJob, cancelGradingJob, retryGradingJob, getGradingWorkerHealth } from '../../api/gradingJob'
import { formatDateTime } from '../../utils/format'
import { subscribeRt } from '../../socket/rtBus'
import {
  upsertGradingJobFromRt,
  jobStatusLabel,
  jobStatusTagType,
  jobScopeLabel,
} from '../../stores/gradingJobProgress'
import { gradingJobBackLabel, resolveGradingJobBackTarget } from '../../utils/gradingJobNav'

const props = defineProps({
  basePath: { type: String, default: '/teacher' },
})

const route = useRoute()
const router = useRouter()
const loading = ref(true)
const job = ref(null)
const items = ref([])
const itemTotal = ref(0)
let offRt = null
const workerHealth = ref(null)

const showWorkerHint = computed(() => {
  const j = job.value
  if (!j || !['pending', 'running'].includes(j.status)) return false
  if ((j.running_count ?? 0) > 0 || (j.finished_count ?? 0) > 0) return false
  const created = j.created_at ? new Date(j.created_at).getTime() : 0
  if (!created || Date.now() - created <= 60000) return false
  const wh = workerHealth.value
  if (wh?.bullmqEnabled && wh?.workerLastSeenAt) {
    const seen = new Date(wh.workerLastSeenAt).getTime()
    if (Number.isFinite(seen) && Date.now() - seen < 90000) return false
  }
  return true
})

const backLabel = computed(() => gradingJobBackLabel(props.basePath, route.query.from))

function progressStatus(status) {
  if (status === 'failed' || status === 'partial_failed') return 'exception'
  if (status === 'completed') return 'success'
  return undefined
}

function itemStatusLabel(status) {
  const map = {
    pending: '等待执行',
    queued: '已入队',
    running: '执行中',
    success: '成功',
    failed: '失败',
    skipped: '已跳过',
    cancelled: '已取消',
  }
  return map[status] || status
}

function itemStageLabel(stage) {
  const map = {
    waiting: '等待',
    loading_context: '加载上下文',
    rag_retrieving: 'RAG 检索',
    llm_grading: 'AI 批改',
    saving_result: '保存结果',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消',
    cancelling: '取消中',
  }
  return map[stage] || stage || '—'
}

function itemStatusTagType(status) {
  const map = {
    pending: 'info',
    queued: 'info',
    running: 'primary',
    success: 'success',
    failed: 'danger',
    skipped: 'info',
    cancelled: 'info',
  }
  return map[status] || 'info'
}

async function loadDetail() {
  loading.value = true
  try {
    const [res, healthRes] = await Promise.all([
      getGradingJob(route.params.id, { itemPage: 1, itemPageSize: 200 }),
      getGradingWorkerHealth().catch(() => null),
    ])
    if (healthRes?.success) workerHealth.value = healthRes.data
    if (res.success && res.data) {
      job.value = res.data.job
      items.value = res.data.items || []
      itemTotal.value = res.data.itemTotal || items.value.length
    } else {
      job.value = null
    }
  } catch {
    job.value = null
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

function goSubmissions() {
  if (job.value?.task_id) router.push(`${props.basePath}/submissions/${job.value.task_id}`)
}

function goBack() {
  const from = route.query.from
  if (typeof from === 'string' && from.startsWith(props.basePath) && !from.includes('/grading-jobs/')) {
    router.push(from)
    return
  }
  router.push(resolveGradingJobBackTarget(props.basePath, from))
}

function goGrading(submissionId) {
  router.push(`${props.basePath}/grading/${submissionId}`)
}

async function onCancel() {
  try {
    await ElMessageBox.confirm('确定取消该批改任务？已进入 LLM 的条目不会中断，其余将跳过。', '取消任务')
    await cancelGradingJob(job.value.id)
    ElMessage.success('任务已取消')
    await loadDetail()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e?.response?.data?.message || '取消失败')
  }
}

async function onRetry() {
  try {
    await retryGradingJob(job.value.id)
    ElMessage.success('失败项已重新入队')
    await loadDetail()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '重试失败')
  }
}

onMounted(() => {
  loadDetail()
  offRt = subscribeRt((payload) => {
    if (payload?.domain !== 'grading_job') return
    if (Number(payload.jobId) !== Number(route.params.id)) return
    upsertGradingJobFromRt(payload)
    loadDetail()
  })
})

onUnmounted(() => {
  if (typeof offRt === 'function') offRt()
})
</script>

<style scoped>
.grading-job-detail {
  max-width: 1200px;
  margin: -20px -24px -36px;
  padding: 20px 24px 36px;
  background: #eef2f7;
  box-sizing: border-box;
  min-height: calc(100vh - 120px);
}

.detail-head {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}

.detail-head__main {
  flex: 1;
  min-width: 200px;
}

.detail-title {
  margin: 0 0 6px;
  font-size: 22px;
  font-weight: 700;
  color: #0f172a;
}

.detail-subtitle {
  margin: 0;
  font-size: 14px;
  color: #64748b;
  line-height: 1.5;
}

.detail-id {
  font-weight: 700;
  color: #1677ff;
  margin-right: 6px;
}

.detail-head__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.info-banner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 14px 16px;
  margin-bottom: 16px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 12px;
}

.info-banner__icon {
  flex-shrink: 0;
  margin-top: 2px;
  font-size: 18px;
  color: #1677ff;
}

.info-banner__text {
  margin: 0;
  font-size: 13px;
  line-height: 1.65;
  color: #334155;
}

.panel {
  background: #fff;
  border: 1px solid #e8edf3;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
  margin-bottom: 16px;
}

.panel__header {
  padding: 16px 20px 14px;
  border-bottom: 1px solid #eef2f7;
  background: #fafbfc;
}

.panel__header--row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.panel__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #0f172a;
}

.panel__meta {
  font-size: 12px;
  color: #94a3b8;
}

.panel__body {
  padding: 20px;
}

.panel__body--table {
  padding: 0;
}

.detail-skeleton {
  padding: 16px;
  background: #fff;
  border-radius: 12px;
  border: 1px solid #e8edf3;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px 24px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.info-item--wide {
  grid-column: span 2;
}

.info-item__label {
  font-size: 12px;
  color: #94a3b8;
  font-weight: 500;
}

.info-item__value {
  font-size: 14px;
  color: #0f172a;
  line-height: 1.45;
}

.progress-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(100px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}

.progress-stat {
  padding: 14px 16px;
  background: #f8fafc;
  border: 1px solid #eef2f7;
  border-radius: 10px;
  text-align: center;
}

.progress-stat--ok .progress-stat__value {
  color: #16a34a;
}

.progress-stat--fail .progress-stat__value {
  color: #dc2626;
}

.progress-stat__label {
  display: block;
  font-size: 12px;
  color: #64748b;
  margin-bottom: 4px;
}

.progress-stat__value {
  font-size: 24px;
  font-weight: 700;
  color: #0f172a;
  font-variant-numeric: tabular-nums;
}

.job-progress-bar {
  margin-bottom: 8px;
}

.progress-caption {
  margin: 0 0 16px;
  font-size: 13px;
  color: #64748b;
  font-variant-numeric: tabular-nums;
}

.exec-info {
  padding: 14px 16px;
  background: #f8fafc;
  border: 1px solid #eef2f7;
  border-radius: 10px;
}

.exec-info__label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #475569;
  margin-bottom: 8px;
}

.exec-info__text {
  margin: 0 0 6px;
  font-size: 13px;
  line-height: 1.6;
  color: #334155;
}

.exec-info__text:last-child {
  margin-bottom: 0;
}

.exec-info__text--error {
  color: #dc2626;
}

.items-table :deep(.el-table__header th) {
  background: #f8fafc !important;
  color: #475569;
  font-weight: 600;
}

.items-table :deep(.el-table__row td) {
  padding-top: 12px;
  padding-bottom: 12px;
}

.empty-panel {
  padding: 32px 20px;
}

@media (max-width: 768px) {
  .info-item--wide {
    grid-column: span 1;
  }

  .progress-stats {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
