<template>
  <div class="grades-center">
    <header class="grades-head">
      <div class="grades-head__main">
        <h1 class="grades-title">成绩查询</h1>
        <p class="grades-subtitle">
          汇总历史实训成绩、AI 评分、教师复核结果与综合评价报告，帮助了解学习表现与改进方向。
        </p>
      </div>
      <p class="grades-hint">最终成绩以教师复核后的综合分为准</p>
    </header>

    <el-skeleton v-if="showSkeleton" animated :rows="10" class="grades-skeleton" />

    <div v-else v-loading="refreshing">
      <section class="metric-grid">
        <div
          v-for="card in statCards"
          :key="card.key"
          class="metric-card"
          :class="{ 'metric-card--highlight': card.highlight }"
        >
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

      <div v-if="results.length" class="insight-banner" :class="`insight-banner--${insight.tone}`">
        <div class="insight-banner__main">
          <strong class="insight-banner__title">{{ insight.title }}</strong>
          <p class="insight-banner__text">{{ insight.text }}</p>
        </div>
        <div v-if="lowTasks.length" class="insight-banner__low">
          <span class="insight-banner__low-label">待提升任务：</span>
          <span
            v-for="(t, i) in lowTasks"
            :key="t.submission_id"
            class="insight-banner__low-item"
          >
            {{ t.title || '未命名任务' }}<span v-if="i < lowTasks.length - 1">、</span>
          </span>
        </div>
      </div>

      <div v-if="results.length" class="panel filter-panel">
        <el-form inline class="filter-form" @submit.prevent>
          <el-form-item label="搜索">
            <el-input
              v-model="keyword"
              clearable
              placeholder="任务名称"
              style="width: 200px"
              :prefix-icon="Search"
            />
          </el-form-item>
          <el-form-item label="评价状态">
            <el-select v-model="statusFilter" clearable placeholder="全部" style="width: 132px">
              <el-option label="全部" value="" />
              <el-option label="AI已批改" value="ai_graded" />
              <el-option label="人工已复核" value="human_reviewed" />
              <el-option label="待批改" value="pending" />
            </el-select>
          </el-form-item>
          <el-form-item label="成绩等级">
            <el-select v-model="tierFilter" clearable placeholder="全部" style="width: 120px">
              <el-option label="全部" value="" />
              <el-option label="优秀" value="excellent" />
              <el-option label="良好" value="good" />
              <el-option label="待提升" value="fair" />
              <el-option label="需改进" value="poor" />
            </el-select>
          </el-form-item>
          <el-form-item label="排序">
            <el-select v-model="sortBy" style="width: 132px">
              <el-option label="提交时间" value="time" />
              <el-option label="综合分" value="score" />
            </el-select>
          </el-form-item>
        </el-form>
      </div>

      <div v-if="!results.length" class="panel empty-panel">
        <el-empty :image-size="96">
          <template #description>
            <h3 class="empty-title">暂无成绩记录</h3>
            <p class="empty-desc">
              完成实训任务并通过批改后，你可以在这里查看 AI 评分、教师复核分和综合评价报告。
            </p>
          </template>
          <el-button type="primary" @click="goTasks">去实训中心</el-button>
        </el-empty>
      </div>

      <div v-else-if="!displayRows.length" class="panel empty-panel">
        <el-empty description="没有匹配的成绩记录，请调整筛选条件" :image-size="80" />
      </div>

      <div v-else class="panel table-panel">
        <div class="panel__header">
          <h2 class="panel__title">成绩档案</h2>
          <span class="panel__meta">共 {{ results.length }} 条 · 当前显示 {{ displayRows.length }} 条</span>
        </div>
        <div class="panel__body panel__body--table">
          <el-table :data="displayRows" stripe class="grades-table">
            <el-table-column label="任务信息" min-width="168">
              <template #default="{ row }">
                <div class="task-cell" :title="row.title || '—'">
                  <span class="task-cell__title">{{ row.title || '—' }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="评分构成" min-width="140">
              <template #default="{ row }">
                <div class="compose-cell">
                  <span class="compose-item">
                    <span class="compose-label">AI</span>
                    <span class="compose-value">{{ formatGradeScore(row.total_score, 2) }}</span>
                  </span>
                  <span class="compose-sep">·</span>
                  <span class="compose-item">
                    <span class="compose-label">教师</span>
                    <span class="compose-value">{{ formatGradeScore(row.human_score, 2) }}</span>
                  </span>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="综合成绩" width="148" align="center">
              <template #default="{ row }">
                <div class="composite-cell">
                  <span class="composite-score" :class="compositeClass(row)">
                    {{ compositeDisplay(row) }}
                  </span>
                  <el-tag
                    v-if="scoreTier(pickCompositeScore(row)).label"
                    size="small"
                    effect="plain"
                    :class="`tier-tag tier-tag--${scoreTier(pickCompositeScore(row)).tone}`"
                  >
                    {{ scoreTier(pickCompositeScore(row)).label }}
                  </el-tag>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="评价状态" width="112" align="center">
              <template #default="{ row }">
                <el-tag size="small" :type="studentGradingStatusType(row.status)">
                  {{ studentGradingStatusText(row.status) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="提交时间" width="168">
              <template #default="{ row }">{{ formatDateTime(row.submitted_at) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="128" align="center" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" class="action-btn" @click="viewDetail(row.submission_id)">
                  查看评价报告
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
  CircleCheck,
  DataAnalysis,
  Top,
  Bottom,
  Trophy,
  Warning,
} from '@element-plus/icons-vue'
import { useRtOnDomains } from '../../composables/useRtOnDomains'
import { getStudentGradingResults } from '../../api/grading'
import { formatDateTime } from '../../utils/format'
import {
  pickCompositeScore,
  formatGradeScore,
  computeResultsSummary,
  analysisInsight,
  filterResultsRows,
  sortResultsRows,
  lowScoreTasks,
  studentGradingStatusType,
  studentGradingStatusText,
  scoreTier,
} from '../../utils/studentResultsDisplay'
import { usePageCacheStore } from '../../stores/pageCache'
import { useDelayedSkeleton } from '../../utils/useDelayedLoading'

const router = useRouter()
const pageCache = usePageCacheStore()
const CACHE_KEY = 'student:results'
const cached = pageCache.get(CACHE_KEY)
const results = ref(cached?.results ?? [])
const loading = ref(!results.value.length)
const refreshing = ref(false)
const showSkeleton = useDelayedSkeleton(computed(() => loading.value && !results.value.length))
const keyword = ref('')
const statusFilter = ref('')
const tierFilter = ref('')
const sortBy = ref('time')

const summary = computed(() => computeResultsSummary(results.value))
const insight = computed(() => analysisInsight(summary.value.avgNum))
const lowTasks = computed(() => lowScoreTasks(results.value))

const statCards = computed(() => [
  {
    key: 'completed',
    label: '已完成任务',
    value: summary.value.completed,
    hint: '已出成绩',
    icon: CircleCheck,
    tone: 'blue',
  },
  {
    key: 'avg',
    label: '平均分',
    value: summary.value.avg,
    hint: '综合分均值',
    icon: DataAnalysis,
    tone: 'teal',
    highlight: true,
  },
  {
    key: 'max',
    label: '最高分',
    value: summary.value.max,
    hint: '历史最佳',
    icon: Top,
    tone: 'green',
  },
  {
    key: 'min',
    label: '最低分',
    value: summary.value.min,
    hint: '需关注',
    icon: Bottom,
    tone: 'slate',
  },
  {
    key: 'excellent',
    label: '优秀任务',
    value: summary.value.excellent,
    hint: '90分及以上',
    icon: Trophy,
    tone: 'green',
  },
  {
    key: 'needImprove',
    label: '待提升任务',
    value: summary.value.needImprove,
    hint: '60分以下',
    icon: Warning,
    tone: 'orange',
  },
])

const displayRows = computed(() => {
  const filtered = filterResultsRows(results.value, {
    keyword: keyword.value,
    status: statusFilter.value,
    tier: tierFilter.value,
  })
  return sortResultsRows(filtered, sortBy.value)
})

function compositeDisplay(row) {
  const s = pickCompositeScore(row)
  return s != null ? `${formatGradeScore(s, 1)} 分` : '—'
}

function compositeClass(row) {
  const tier = scoreTier(pickCompositeScore(row))
  return tier.tone !== 'muted' ? `composite-score--${tier.tone}` : ''
}

async function loadResults({ background = false } = {}) {
  const hasData = results.value.length > 0
  if (background && hasData) refreshing.value = true
  else if (!hasData) loading.value = true
  else refreshing.value = true
  try {
    const response = await getStudentGradingResults()
    if (response.success) {
      results.value = response.data || []
      pageCache.set(CACHE_KEY, { results: results.value })
    }
  } catch (error) {
    console.error('获取成绩失败:', error)
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

function viewDetail(submissionId) {
  router.push(`/student/results/${submissionId}`)
}

function goTasks() {
  router.push('/student/tasks')
}

useRtOnDomains(['grading', 'submissions', 'scores'], () => loadResults({ background: true }))

onMounted(() => {
  loadResults({ background: pageCache.has(CACHE_KEY) })
})

onActivated(() => {
  loadResults({ background: true })
})
</script>

<style scoped>
.grades-center {
  max-width: 1400px;
  margin: -20px -24px -36px;
  padding: 20px 24px 36px;
  min-height: calc(100vh - 120px);
  background: #eef2f7;
  box-sizing: border-box;
}

.grades-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}

.grades-title {
  margin: 0 0 8px;
  font-size: 24px;
  font-weight: 700;
  color: #0f172a;
  letter-spacing: -0.02em;
}

.grades-subtitle {
  margin: 0;
  max-width: 44rem;
  font-size: 14px;
  line-height: 1.65;
  color: #64748b;
}

.grades-hint {
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
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
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

.metric-card--highlight {
  border-color: #0d9488;
  box-shadow: 0 0 0 1px rgba(13, 148, 136, 0.2), 0 4px 12px rgba(13, 148, 136, 0.08);
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
.metric-card__icon--teal { background: #f0fdfa; color: #0d9488; }
.metric-card__icon--green { background: #f0fdf4; color: #16a34a; }
.metric-card__icon--slate { background: #f1f5f9; color: #475569; }
.metric-card__icon--orange { background: #fff7ed; color: #ea580c; }

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

.metric-card--highlight .metric-card__value {
  color: #0d9488;
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

.insight-banner {
  padding: 14px 16px;
  margin-bottom: 16px;
  border-radius: 12px;
  border: 1px solid #e8edf3;
  background: #fff;
}

.insight-banner--success { border-color: #bbf7d0; background: #f0fdf4; }
.insight-banner--primary { border-color: #bfdbfe; background: #eff6ff; }
.insight-banner--warning { border-color: #fde68a; background: #fffbeb; }
.insight-banner--danger { border-color: #fecaca; background: #fef2f2; }
.insight-banner--info { border-color: #e2e8f0; background: #f8fafc; }

.insight-banner__title {
  display: block;
  font-size: 14px;
  color: #0f172a;
  margin-bottom: 4px;
}

.insight-banner__text {
  margin: 0;
  font-size: 13px;
  line-height: 1.65;
  color: #475569;
}

.insight-banner__low {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed rgba(148, 163, 184, 0.4);
  font-size: 12px;
  color: #64748b;
  line-height: 1.5;
}

.insight-banner__low-label {
  font-weight: 600;
  color: #ea580c;
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

.grades-skeleton,
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

.grades-table :deep(.el-table__header th) {
  background: #f8fafc !important;
  color: #475569;
  font-weight: 600;
}

.grades-table :deep(.el-table__row td) {
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

.compose-cell {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 8px;
  font-size: 13px;
}

.compose-label {
  color: #94a3b8;
  font-size: 11px;
  margin-right: 2px;
}

.compose-value {
  font-variant-numeric: tabular-nums;
  color: #475569;
  font-weight: 600;
}

.compose-sep {
  color: #cbd5e1;
}

.composite-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.composite-score {
  font-size: 20px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: #0f172a;
}

.composite-score--excellent { color: #16a34a; }
.composite-score--good { color: #1677ff; }
.composite-score--fair { color: #d97706; }
.composite-score--poor { color: #dc2626; }

.tier-tag {
  border: none !important;
  font-size: 11px;
  height: 20px;
  padding: 0 6px;
}

.tier-tag--excellent { background: #f0fdf4; color: #16a34a; }
.tier-tag--good { background: #eff6ff; color: #1677ff; }
.tier-tag--fair { background: #fffbeb; color: #d97706; }
.tier-tag--poor { background: #fef2f2; color: #dc2626; }

.action-btn {
  font-weight: 600;
}

@media (max-width: 768px) {
  .grades-hint {
    white-space: normal;
    width: 100%;
  }
}
</style>
