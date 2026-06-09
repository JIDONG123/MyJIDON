<template>
  <div class="submissions-archive">
    <header class="archive-head">
      <div class="archive-head__main">
        <h1 class="archive-title">我的提交</h1>
        <p class="archive-subtitle">
          查看历史作业提交、批改状态、AI 评分与成绩报告。
        </p>
      </div>
      <p class="archive-hint">成绩以教师复核后的最终评分为准</p>
    </header>

    <el-skeleton v-if="showSkeleton" animated :rows="10" class="archive-skeleton" />

    <div v-else v-loading="refreshing">
      <section class="metric-grid">
        <div v-for="card in statCards" :key="card.key" class="metric-card">
          <div class="metric-card__icon" :class="`metric-card__icon--${card.tone}`">
            <el-icon><component :is="card.icon" /></el-icon>
          </div>
          <div class="metric-card__body">
            <span class="metric-card__value">{{ card.value }}</span>
            <span class="metric-card__label">{{ card.label }}</span>
            <span class="metric-card__hint">{{ card.hint }}</span>
          </div>
        </div>
      </section>

      <div v-if="submissions.length" class="panel filter-panel">
        <el-form inline class="filter-form" @submit.prevent>
          <el-form-item label="搜索">
            <el-input
              v-model="keyword"
              clearable
              placeholder="任务名称或提交文件"
              style="width: 220px"
              :prefix-icon="Search"
            />
          </el-form-item>
          <el-form-item label="批改状态">
            <el-select v-model="statusFilter" clearable placeholder="全部" style="width: 140px">
              <el-option label="全部" value="" />
              <el-option label="待批改" value="pending" />
              <el-option label="AI已批改" value="ai_graded" />
              <el-option label="人工已复核" value="human_reviewed" />
              <el-option label="批改失败" value="ai_failed" />
            </el-select>
          </el-form-item>
          <el-form-item label="是否修改">
            <el-select v-model="revisedFilter" clearable placeholder="全部" style="width: 120px">
              <el-option label="全部" value="" />
              <el-option label="已修改" value="revised" />
              <el-option label="未修改" value="not_revised" />
            </el-select>
          </el-form-item>
          <el-form-item label="分数">
            <el-select v-model="scoreFilter" clearable placeholder="全部" style="width: 128px">
              <el-option label="全部" value="" />
              <el-option label="90分以上" value="high" />
              <el-option label="60分以下" value="low" />
            </el-select>
          </el-form-item>
        </el-form>
      </div>

      <div v-if="!submissions.length" class="panel empty-panel">
        <el-empty :image-size="96">
          <template #description>
            <h3 class="empty-title">暂无提交记录</h3>
            <p class="empty-desc">
              完成实训任务并提交作业后，你可以在这里查看批改状态、AI 评分和成绩报告。
            </p>
          </template>
          <el-button type="primary" @click="goTasks">去实训中心</el-button>
        </el-empty>
      </div>

      <div v-else-if="!displayRows.length" class="panel empty-panel">
        <el-empty description="没有匹配的提交记录，请调整筛选条件" :image-size="80" />
      </div>

      <div v-else class="panel table-panel">
        <div class="panel__header">
          <h2 class="panel__title">提交档案</h2>
          <span class="panel__meta">共 {{ submissions.length }} 条 · 当前显示 {{ displayRows.length }} 条</span>
        </div>
        <div class="panel__body panel__body--table">
          <el-table :data="displayRows" stripe class="archive-table">
            <el-table-column label="任务信息" min-width="180">
              <template #default="{ row }">
                <div class="task-cell" :title="row.title || '—'">
                  <span class="task-cell__title">{{ row.title || '—' }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="提交材料" min-width="160">
              <template #default="{ row }">
                <span class="file-cell" :title="row.file_name || '—'">{{ row.file_name || '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="提交时间" width="168">
              <template #default="{ row }">{{ formatDateTime(row.submitted_at) }}</template>
            </el-table-column>
            <el-table-column label="是否修改" width="96" align="center">
              <template #default="{ row }">
                <el-tag
                  size="small"
                  effect="plain"
                  :type="row.is_revised ? 'warning' : 'info'"
                >
                  {{ row.is_revised ? '已修改' : '未修改' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="批改状态" width="112" align="center">
              <template #default="{ row }">
                <el-tag size="small" :type="studentGradingStatusType(row.status)">
                  {{ studentGradingStatusText(row.status) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="AI评分" width="96" align="right">
              <template #default="{ row }">
                <span class="score-ai">{{ formatSubmissionScore(row.total_score) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="最终评分" width="128" align="right">
              <template #default="{ row }">
                <div class="score-final-wrap">
                  <span class="score-final" :class="scoreClass(row)">
                    {{ formatSubmissionScore(pickFinalScore(row)) }}
                  </span>
                  <el-tag
                    v-if="scoreTier(pickFinalScore(row)).label"
                    size="small"
                    effect="plain"
                    :class="`score-tier score-tier--${scoreTier(pickFinalScore(row)).tone}`"
                  >
                    {{ scoreTier(pickFinalScore(row)).label }}
                  </el-tag>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="128" align="center" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" class="action-btn" @click="viewResult(row.id)">
                  查看成绩报告
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onActivated } from 'vue'
import { useRouter } from 'vue-router'
import {
  Search,
  Document,
  CircleCheck,
  Cpu,
  EditPen,
  TrendCharts,
} from '@element-plus/icons-vue'
import { getStudentSubmissions } from '../../api/submission'
import { formatDateTime } from '../../utils/format'
import {
  studentGradingStatusType,
  studentGradingStatusText,
  formatSubmissionScore,
  pickFinalScore,
  scoreTier,
  computeSubmissionSummary,
  filterSubmissions,
} from '../../utils/studentSubmissionDisplay'
import { useRtOnDomains } from '../../composables/useRtOnDomains'
import { usePageCacheStore } from '../../stores/pageCache'
import { useDelayedSkeleton } from '../../utils/useDelayedLoading'

const router = useRouter()
const pageCache = usePageCacheStore()
const CACHE_KEY = 'student:submissions'
const cached = pageCache.get(CACHE_KEY)
const submissions = ref(cached?.submissions ?? [])
const loading = ref(!submissions.value.length)
const refreshing = ref(false)
const showSkeleton = useDelayedSkeleton(computed(() => loading.value && !submissions.value.length))
const keyword = ref('')
const statusFilter = ref('')
const revisedFilter = ref('')
const scoreFilter = ref('')

const summary = computed(() => computeSubmissionSummary(submissions.value))

const statCards = computed(() => [
  {
    key: 'total',
    label: '提交总数',
    value: summary.value.total,
    hint: '历史累计',
    icon: Document,
    tone: 'blue',
  },
  {
    key: 'reviewed',
    label: '已复核',
    value: summary.value.reviewed,
    hint: '教师已确认',
    icon: CircleCheck,
    tone: 'green',
  },
  {
    key: 'ai',
    label: 'AI已批改',
    value: summary.value.aiGraded,
    hint: '待教师复核',
    icon: Cpu,
    tone: 'teal',
  },
  {
    key: 'revised',
    label: '已修改',
    value: summary.value.revised,
    hint: '重新提交过',
    icon: EditPen,
    tone: 'orange',
  },
  {
    key: 'avg',
    label: '平均最终分',
    value: summary.value.avgFinal,
    hint: '含教师复核分',
    icon: TrendCharts,
    tone: 'indigo',
  },
])

const displayRows = computed(() =>
  filterSubmissions(submissions.value, {
    keyword: keyword.value,
    status: statusFilter.value,
    revised: revisedFilter.value,
    scoreBand: scoreFilter.value,
  })
)

function scoreClass(row) {
  const tier = scoreTier(pickFinalScore(row))
  return tier.tone !== 'muted' ? `score-final--${tier.tone}` : ''
}

async function loadSubmissions({ background = false } = {}) {
  const hasData = submissions.value.length > 0
  if (background && hasData) refreshing.value = true
  else if (!hasData) loading.value = true
  else refreshing.value = true
  try {
    const response = await getStudentSubmissions()
    if (response.success) {
      submissions.value = response.data || []
      pageCache.set(CACHE_KEY, { submissions: submissions.value })
    }
  } catch (error) {
    console.error('获取提交列表失败:', error)
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

function viewResult(submissionId) {
  router.push(`/student/results/${submissionId}`)
}

function goTasks() {
  router.push('/student/tasks')
}

onMounted(() => {
  loadSubmissions({ background: pageCache.has(CACHE_KEY) })
})

onActivated(() => {
  loadSubmissions({ background: true })
})

useRtOnDomains(['submissions', 'grading', 'tasks'], () => {
  loadSubmissions({ background: true })
})
</script>

<style scoped>
.submissions-archive {
  max-width: 1400px;
  margin: -20px -24px -36px;
  padding: 20px 24px 36px;
  min-height: calc(100vh - 120px);
  background: #eef2f7;
  box-sizing: border-box;
}

.archive-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}

.archive-title {
  margin: 0 0 8px;
  font-size: 24px;
  font-weight: 700;
  color: #0f172a;
  letter-spacing: -0.02em;
}

.archive-subtitle {
  margin: 0;
  max-width: 40rem;
  font-size: 14px;
  line-height: 1.65;
  color: #64748b;
}

.archive-hint {
  margin: 4px 0 0;
  font-size: 12px;
  color: #94a3b8;
  padding: 8px 12px;
  background: #fff;
  border: 1px solid #e8edf3;
  border-radius: 8px;
  white-space: nowrap;
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

.metric-card__icon--blue { background: #eff6ff; color: #1677ff; }
.metric-card__icon--green { background: #f0fdf4; color: #16a34a; }
.metric-card__icon--teal { background: #f0fdfa; color: #0d9488; }
.metric-card__icon--orange { background: #fff7ed; color: #ea580c; }
.metric-card__icon--indigo { background: #eef2ff; color: #4f46e5; }

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

.panel {
  background: #fff;
  border: 1px solid #e8edf3;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
  margin-bottom: 16px;
}

.filter-panel {
  padding: 14px 16px;
}

.filter-form :deep(.el-form-item) {
  margin-bottom: 8px;
  margin-right: 16px;
}

.filter-form :deep(.el-form-item__label) {
  font-weight: 600;
  color: #475569;
}

.panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 20px 14px;
  border-bottom: 1px solid #eef2f7;
  background: #fafbfc;
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

.panel__body--table {
  padding: 0;
}

.archive-skeleton {
  padding: 16px;
  background: #fff;
  border-radius: 12px;
  border: 1px solid #e8edf3;
}

.empty-panel {
  padding: 32px 20px;
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

.archive-table :deep(.el-table__header th) {
  background: #f8fafc !important;
  color: #475569;
  font-weight: 600;
}

.archive-table :deep(.el-table__row td) {
  padding-top: 14px;
  padding-bottom: 14px;
}

.task-cell__title {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-weight: 600;
  color: #0f172a;
  line-height: 1.45;
  font-size: 14px;
}

.file-cell {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: #64748b;
}

.score-ai {
  font-variant-numeric: tabular-nums;
  color: #64748b;
  font-size: 13px;
}

.score-final-wrap {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.score-final {
  font-size: 18px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: #0f172a;
}

.score-final--excellent { color: #16a34a; }
.score-final--good { color: #1677ff; }
.score-final--fair { color: #d97706; }
.score-final--poor { color: #dc2626; }

.score-tier {
  border: none !important;
  font-size: 11px;
  padding: 0 6px;
  height: 20px;
}

.score-tier--excellent { background: #f0fdf4; color: #16a34a; }
.score-tier--good { background: #eff6ff; color: #1677ff; }
.score-tier--fair { background: #fffbeb; color: #d97706; }
.score-tier--poor { background: #fef2f2; color: #dc2626; }

.action-btn {
  font-weight: 600;
}

@media (max-width: 768px) {
  .archive-hint {
    white-space: normal;
    width: 100%;
  }
}
</style>
