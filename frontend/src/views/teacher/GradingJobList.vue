<template>
  <div class="grading-job-center">
    <header class="center-head">
      <div class="center-head__main">
        <h1 class="center-title">AI 批改任务中心</h1>
        <p class="center-subtitle">
          查看后台 AI 批改队列、执行进度、成功失败数量与批改结果，任务后台运行不影响教师继续使用系统。
        </p>
      </div>
      <div class="center-head__actions">
        <div class="refresh-meta">
          <span class="refresh-meta__time">最近刷新：{{ lastRefreshLabel }}</span>
          <span class="refresh-meta__hint">任务状态变更时将自动刷新（实时推送）</span>
        </div>
        <el-button type="primary" :icon="Refresh" :loading="refreshing" @click="refreshAll">刷新</el-button>
      </div>
    </header>

    <section class="metric-grid">
      <button
        v-for="card in statCards"
        :key="card.key"
        type="button"
        class="metric-card"
        :class="{ 'metric-card--active': activeStatKey === card.key }"
        @click="onStatClick(card.key)"
      >
        <div class="metric-card__icon" :class="`metric-card__icon--${card.tone}`">
          <el-icon><component :is="card.icon" /></el-icon>
        </div>
        <div class="metric-card__body">
          <span class="metric-card__value">{{ card.value }}</span>
          <span class="metric-card__label">{{ card.label }}</span>
          <span class="metric-card__hint">{{ card.hint }}</span>
        </div>
      </button>
    </section>

    <div class="info-banner" role="note">
      <el-icon class="info-banner__icon"><InfoFilled /></el-icon>
      <p class="info-banner__text">
        AI 批改任务由后台 Worker 异步执行。任务发起后，教师可离开当前页面继续使用系统；完成后可在成果列表中查看评分、评语与复核状态。
      </p>
    </div>

    <el-alert
      v-if="listWorkerHint"
      type="warning"
      show-icon
      :closable="false"
      class="worker-hint-alert"
      :title="listWorkerHint"
    />

    <div class="panel filter-panel">
      <div class="panel__header">
        <h2 class="panel__title">筛选与查询</h2>
      </div>
      <div class="panel__body">
        <el-form :inline="true" class="filter-form" @submit.prevent>
          <el-form-item label="执行状态">
            <el-select
              v-model="filters.status"
              clearable
              placeholder="全部"
              style="width: 148px"
              @change="onStatusFilterChange"
            >
              <el-option label="等待执行" value="pending" />
              <el-option label="执行中" value="running" />
              <el-option label="已完成" value="completed" />
              <el-option label="部分完成" value="partial_failed" />
              <el-option label="执行失败" value="failed" />
              <el-option label="已取消" value="cancelled" />
            </el-select>
          </el-form-item>
          <el-form-item label="批改类型">
            <el-select
              v-model="filters.scopeType"
              clearable
              placeholder="全部"
              style="width: 132px"
            >
              <el-option label="单份批改" value="single" />
              <el-option label="批量批改" value="batch_task" />
            </el-select>
          </el-form-item>
          <el-form-item label="任务搜索">
            <el-input
              v-model="filters.keyword"
              clearable
              placeholder="任务名称或 ID"
              style="width: 200px"
              :prefix-icon="Search"
            />
          </el-form-item>
          <el-form-item>
            <el-button :icon="Refresh" @click="refreshAll">刷新</el-button>
          </el-form-item>
        </el-form>
      </div>
    </div>

    <div v-if="showEmpty" class="panel empty-panel">
      <el-empty description="" :image-size="96">
        <template #description>
          <h3 class="empty-title">暂无批改任务</h3>
          <p class="empty-desc">
            当教师发起单份 AI 批改或批量 AI 批改后，后台任务会显示在这里。
          </p>
        </template>
        <el-button type="primary" plain @click="goTasks">返回实训任务管理</el-button>
      </el-empty>
    </div>

    <div v-else class="panel table-panel">
      <div class="panel__header panel__header--row">
        <h2 class="panel__title">批改任务列表</h2>
        <span class="panel__meta">
          共 {{ total }} 条 · 当前页 {{ displayRows.length }} 条
          <span v-if="refreshing" class="panel__meta-refresh">· 更新中…</span>
        </span>
      </div>
      <div v-loading="initialLoading && !rows.length" class="panel__body panel__body--table">
        <el-table :data="displayRows" stripe class="job-table" empty-text="无匹配任务">
          <el-table-column label="批改任务" min-width="168">
            <template #default="{ row }">
              <div class="job-cell">
                <span class="job-cell__id">#{{ row.id }}</span>
                <span class="job-cell__desc">{{ jobBrief(row) }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="关联实训" min-width="180" show-overflow-tooltip>
            <template #default="{ row }">
              <span :title="row.task_title || '—'">{{ row.task_title || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="类型" width="108" align="center">
            <template #default="{ row }">
              <el-tag size="small" effect="plain" :type="row.scope_type === 'batch_task' ? 'primary' : 'info'">
                {{ jobScopeLabel(row.scope_type) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="执行状态" width="108" align="center">
            <template #default="{ row }">
              <el-tag size="small" :type="jobStatusTagType(row.status)">
                {{ jobStatusLabel(row.status) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="执行进度" min-width="168">
            <template #default="{ row }">
              <div class="progress-cell">
                <el-progress
                  :percentage="row.progress ?? 0"
                  :status="progressBarStatus(row.status)"
                  :stroke-width="8"
                  :show-text="false"
                />
                <span class="progress-cell__text">
                  {{ row.finished_count }}/{{ row.total_count }}（{{ row.progress ?? 0 }}%）
                </span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="批改结果" width="108" align="center">
            <template #default="{ row }">
              <span class="result-count">
                <span class="result-count__ok">{{ row.success_count ?? 0 }}</span>
                <span class="result-count__sep">/</span>
                <span class="result-count__fail">{{ row.failed_count ?? 0 }}</span>
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="creator_name" label="发起人" width="100" show-overflow-tooltip />
          <el-table-column label="创建时间" width="168">
            <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
          </el-table-column>
          <el-table-column label="操作" min-width="240" align="right" fixed="right">
            <template #default="{ row }">
              <div class="table-row-actions">
                <el-button type="primary" link @click="openDetail(row.id)">查看详情</el-button>
                <el-button v-if="row.task_id" type="primary" link @click="openSubmissions(row.task_id)">
                  批改结果
                </el-button>
                <el-button
                  v-if="['pending', 'running'].includes(row.status)"
                  type="warning"
                  link
                  @click="onCancel(row.id)"
                >
                  取消
                </el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>
        <div class="pager">
          <el-pagination
            v-model:current-page="page"
            v-model:page-size="pageSize"
            :total="total"
            :page-sizes="[10, 20, 50, 100]"
            layout="total, sizes, prev, pager, next"
            @current-change="() => loadData({ background: rows.length > 0 })"
            @size-change="onPageSizeChange"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onActivated, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { usePageCacheStore } from '../../stores/pageCache'
import {
  Refresh,
  Search,
  InfoFilled,
  List,
  Clock,
  Loading,
  CircleCheck,
  CircleClose,
  Remove,
} from '@element-plus/icons-vue'
import { listGradingJobs, cancelGradingJob, getGradingWorkerHealth } from '../../api/gradingJob'
import { formatDateTime } from '../../utils/format'
import { subscribeRt } from '../../socket/rtBus'
import {
  upsertGradingJobFromRt,
  jobStatusLabel,
  jobStatusTagType,
  jobScopeLabel,
} from '../../stores/gradingJobProgress'
import { gradingJobDetailLocation } from '../../utils/gradingJobNav'

const props = defineProps({
  basePath: { type: String, default: '/teacher' },
})

const route = useRoute()
const router = useRouter()
const pageCache = usePageCacheStore()
const initialLoading = ref(false)
const refreshing = ref(false)
const rows = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const lastRefreshAt = ref(null)
const workerHealth = ref(null)
const filters = reactive({ status: '', scopeType: '', keyword: '' })
const stats = reactive({
  all: 0,
  pending: 0,
  running: 0,
  completed: 0,
  failed: 0,
  cancelled: 0,
})
let offRt = null
let refreshDebounceTimer = null

const TERMINAL_STATUSES = new Set(['completed', 'partial_failed', 'failed', 'cancelled'])
const ACTIVE_STATUSES = new Set(['pending', 'running'])

const activeStatKey = computed(() => {
  if (!filters.status) return 'all'
  return filters.status
})

const lastRefreshLabel = computed(() => {
  if (!lastRefreshAt.value) return '—'
  return formatDateTime(lastRefreshAt.value)
})

const displayRows = computed(() => {
  let list = rows.value
  if (filters.scopeType) {
    list = list.filter((r) => r.scope_type === filters.scopeType)
  }
  const kw = filters.keyword.trim().toLowerCase()
  if (kw) {
    list = list.filter(
      (r) =>
        String(r.id).includes(kw) ||
        (r.task_title || '').toLowerCase().includes(kw) ||
        (r.message || '').toLowerCase().includes(kw)
    )
  }
  return list
})

const showEmpty = computed(
  () =>
    !initialLoading.value &&
    !refreshing.value &&
    total.value === 0 &&
    !filters.status &&
    !filters.scopeType &&
    !filters.keyword.trim()
)

const listWorkerHint = computed(() => {
  const wh = workerHealth.value
  const hasStalePending = rows.value.some((row) => {
    if (!ACTIVE_STATUSES.has(row.status)) return false
    if ((row.running_count ?? 0) > 0 || (row.finished_count ?? 0) > 0) return false
    const created = row.created_at ? new Date(row.created_at).getTime() : 0
    return created && Date.now() - created > 60000
  })
  if (!hasStalePending) return ''
  if (wh?.bullmqEnabled && wh?.workerLastSeenAt) {
    const seen = new Date(wh.workerLastSeenAt).getTime()
    if (Number.isFinite(seen) && Date.now() - seen < 90000) return ''
  }
  return '批改任务已入队，但暂未被 Worker 处理，请确认批改 Worker 已启动。'
})

function listCacheKey() {
  return `grading-jobs:${props.basePath}:p${page.value}:ps${pageSize.value}:st${filters.status || 'all'}`
}

function statsCacheKey() {
  return `grading-jobs-stats:${props.basePath}`
}

function saveListCache() {
  pageCache.set(listCacheKey(), {
    rows: rows.value,
    total: total.value,
  })
}

function saveStatsCache() {
  pageCache.set(statsCacheKey(), { ...stats })
}

function hydrateFromCache() {
  const listCached = pageCache.get(listCacheKey())
  if (listCached) {
    rows.value = listCached.rows || []
    total.value = listCached.total || 0
  }
  const statsCached = pageCache.get(statsCacheKey())
  if (statsCached) {
    Object.assign(stats, statsCached)
  }
  return !!(listCached || statsCached)
}

const statCards = computed(() => [
  {
    key: 'all',
    label: '全部任务',
    value: stats.all,
    hint: '历史累计',
    icon: List,
    tone: 'slate',
  },
  {
    key: 'pending',
    label: '等待执行',
    value: stats.pending,
    hint: '排队中',
    icon: Clock,
    tone: 'gray',
  },
  {
    key: 'running',
    label: '执行中',
    value: stats.running,
    hint: 'Worker 处理中',
    icon: Loading,
    tone: 'blue',
  },
  {
    key: 'completed',
    label: '已完成',
    value: stats.completed,
    hint: '全部成功',
    icon: CircleCheck,
    tone: 'green',
  },
  {
    key: 'failed',
    label: '执行失败',
    value: stats.failed,
    hint: '需关注',
    icon: CircleClose,
    tone: 'red',
  },
  {
    key: 'cancelled',
    label: '已取消',
    value: stats.cancelled,
    hint: '手动终止',
    icon: Remove,
    tone: 'gray',
  },
])

function progressBarStatus(status) {
  if (status === 'failed' || status === 'partial_failed') return 'exception'
  if (status === 'completed') return 'success'
  return undefined
}

function jobBrief(row) {
  if (row.message) return row.message
  if (row.scope_type === 'batch_task') return '批量 AI 批改'
  return '单份 AI 批改'
}

async function loadWorkerHealth() {
  try {
    const res = await getGradingWorkerHealth()
    if (res?.success) workerHealth.value = res.data
  } catch {
    /* ignore */
  }
}

async function loadStats({ background = false } = {}) {
  const statusKeys = ['pending', 'running', 'completed', 'failed', 'cancelled']
  try {
    const [allRes, ...statusRes] = await Promise.all([
      listGradingJobs({ page: 1, pageSize: 1 }),
      ...statusKeys.map((s) => listGradingJobs({ page: 1, pageSize: 1, status: s })),
    ])
    stats.all = allRes.total || 0
    statusKeys.forEach((s, i) => {
      stats[s] = statusRes[i].total || 0
    })
    saveStatsCache()
  } catch {
    if (!background) {
      stats.all = 0
      statusKeys.forEach((s) => {
        stats[s] = 0
      })
    }
  }
}

async function loadData({ background = false } = {}) {
  const hasRows = rows.value.length > 0
  if (background && hasRows) {
    refreshing.value = true
  } else if (!hasRows) {
    initialLoading.value = true
  } else {
    refreshing.value = true
  }

  try {
    const params = { page: page.value, pageSize: pageSize.value }
    if (filters.status) params.status = filters.status
    const res = await listGradingJobs(params)
    if (res.success) {
      rows.value = res.rows || []
      total.value = res.total || 0
      saveListCache()
    }
    lastRefreshAt.value = new Date()
  } catch {
    if (!background && !hasRows) rows.value = []
    if (!background) ElMessage.error('加载失败')
  } finally {
    initialLoading.value = false
    refreshing.value = false
  }
}

async function refreshAll({ background = false } = {}) {
  await Promise.all([
    loadStats({ background }),
    loadData({ background }),
    loadWorkerHealth(),
  ])
}

function patchRowFromRt(payload) {
  const jobId = Number(payload?.jobId)
  if (!jobId) return false
  const idx = rows.value.findIndex((r) => r.id === jobId)
  if (idx < 0) return false
  const prev = rows.value[idx]
  const next = { ...prev }
  if (payload.status) next.status = payload.status
  if (payload.scopeType != null) next.scope_type = payload.scopeType
  if (payload.totalCount != null) next.total_count = Number(payload.totalCount)
  if (payload.finishedCount != null) next.finished_count = Number(payload.finishedCount)
  if (payload.successCount != null) next.success_count = Number(payload.successCount)
  if (payload.failedCount != null) next.failed_count = Number(payload.failedCount)
  if (payload.progress != null) next.progress = Number(payload.progress)
  if (payload.message != null) next.message = payload.message
  if (payload.runningCount != null) next.running_count = Number(payload.runningCount)
  rows.value.splice(idx, 1, next)
  saveListCache()
  return true
}

function scheduleBackgroundRefresh(forceStats = false) {
  if (refreshDebounceTimer) clearTimeout(refreshDebounceTimer)
  refreshDebounceTimer = window.setTimeout(() => {
    refreshDebounceTimer = null
    if (forceStats) {
      void refreshAll({ background: true })
    } else {
      void loadData({ background: true })
      void loadWorkerHealth()
    }
  }, forceStats ? 400 : 900)
}

function onStatClick(key) {
  filters.status = key === 'all' ? '' : key
  page.value = 1
  hydrateFromCache()
  loadData({ background: rows.value.length > 0 })
}

function onStatusFilterChange() {
  page.value = 1
  hydrateFromCache()
  loadData({ background: rows.value.length > 0 })
}

function onPageSizeChange() {
  page.value = 1
  hydrateFromCache()
  loadData({ background: rows.value.length > 0 })
}

function openDetail(id) {
  router.push(gradingJobDetailLocation(props.basePath, id, route))
}

function openSubmissions(taskId) {
  router.push(`${props.basePath}/submissions/${taskId}`)
}

function goTasks() {
  router.push(`${props.basePath}/tasks`)
}

async function onCancel(id) {
  try {
    await ElMessageBox.confirm('确定取消该批改任务？', '取消任务')
    await cancelGradingJob(id)
    ElMessage.success('已取消')
    await refreshAll()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e?.response?.data?.message || '取消失败')
  }
}

onMounted(() => {
  const hadCache = hydrateFromCache()
  refreshAll({ background: hadCache })
  offRt = subscribeRt((payload) => {
    if (payload?.domain !== 'grading_job') return
    upsertGradingJobFromRt(payload)
    const patched = patchRowFromRt(payload)
    const terminal = TERMINAL_STATUSES.has(payload.status)
    if (terminal) {
      scheduleBackgroundRefresh(true)
    } else if (!patched) {
      scheduleBackgroundRefresh(false)
    } else {
      scheduleBackgroundRefresh(false)
    }
  })
})

onActivated(() => {
  hydrateFromCache()
  refreshAll({ background: true })
})

onUnmounted(() => {
  if (refreshDebounceTimer) clearTimeout(refreshDebounceTimer)
  if (typeof offRt === 'function') offRt()
})
</script>

<style scoped>
.grading-job-center {
  max-width: 1360px;
  margin: -20px -24px -36px;
  padding: 20px 24px 36px;
  min-height: calc(100vh - 120px);
  background: #eef2f7;
  box-sizing: border-box;
}

.center-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.center-title {
  margin: 0 0 8px;
  font-size: 24px;
  font-weight: 700;
  color: #0f172a;
  letter-spacing: -0.02em;
}

.center-subtitle {
  margin: 0;
  max-width: 44rem;
  font-size: 14px;
  line-height: 1.65;
  color: #64748b;
}

.center-head__actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
}

.refresh-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.refresh-meta__time {
  font-size: 12px;
  color: #475569;
  font-variant-numeric: tabular-nums;
}

.refresh-meta__hint {
  font-size: 11px;
  color: #94a3b8;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 14px;
  margin-bottom: 16px;
}

.metric-card {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 18px 16px;
  background: #fff;
  border: 1px solid #e8edf3;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.metric-card:hover {
  border-color: #cbd5e1;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.06);
}

.metric-card--active {
  border-color: #1677ff;
  box-shadow: 0 0 0 1px rgba(22, 119, 255, 0.25);
}

.metric-card__icon {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
}

.metric-card__icon--slate { background: #f1f5f9; color: #475569; }
.metric-card__icon--gray { background: #f8fafc; color: #64748b; }
.metric-card__icon--blue { background: #eff6ff; color: #1677ff; }
.metric-card__icon--green { background: #f0fdf4; color: #16a34a; }
.metric-card__icon--red { background: #fef2f2; color: #dc2626; }

.metric-card__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.metric-card__value {
  font-size: 26px;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
}

.metric-card__label {
  font-size: 13px;
  font-weight: 600;
  color: #475569;
}

.metric-card__hint {
  font-size: 11px;
  color: #94a3b8;
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

.filter-form :deep(.el-form-item__label) {
  font-weight: 600;
  color: #475569;
}

.worker-hint-alert {
  margin-bottom: 16px;
  border-radius: 12px;
}

.panel__meta-refresh {
  color: #1677ff;
  margin-left: 4px;
}

.job-table :deep(.el-table__header th) {
  background: #f8fafc !important;
  color: #475569;
  font-weight: 600;
}

.job-table :deep(.el-table__row td) {
  padding-top: 14px;
  padding-bottom: 14px;
}

.job-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.job-cell__id {
  font-weight: 700;
  color: #0f172a;
  font-variant-numeric: tabular-nums;
}

.job-cell__desc {
  font-size: 12px;
  color: #64748b;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.progress-cell {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 120px;
}

.progress-cell__text {
  font-size: 12px;
  color: #64748b;
  font-variant-numeric: tabular-nums;
}

.result-count {
  font-variant-numeric: tabular-nums;
  font-size: 13px;
}

.result-count__ok {
  color: #16a34a;
  font-weight: 600;
}

.result-count__sep {
  color: #cbd5e1;
  margin: 0 2px;
}

.result-count__fail {
  color: #dc2626;
  font-weight: 600;
}

.pager {
  display: flex;
  justify-content: flex-end;
  padding: 16px 20px;
  border-top: 1px solid #eef2f7;
}

.empty-panel {
  padding: 24px 20px 32px;
}

.empty-title {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 600;
  color: #0f172a;
}

.empty-desc {
  margin: 0;
  max-width: 28rem;
  font-size: 14px;
  line-height: 1.6;
  color: #64748b;
}

@media (max-width: 768px) {
  .center-head__actions {
    align-items: flex-start;
    width: 100%;
  }

  .refresh-meta {
    align-items: flex-start;
  }
}
</style>
