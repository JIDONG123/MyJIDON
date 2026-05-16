<template>
  <div class="page-results">
    <header class="page-head">
      <h1 class="page-title">成绩查询</h1>
      <p class="page-desc">汇总历次提交的综合得分与批改状态，便于复盘实训成果。</p>
    </header>

    <div v-if="loading" class="results-loading" role="status" aria-live="polite">
      <p class="results-loading-hint">正在加载成绩数据，请稍候…</p>
      <el-skeleton animated :rows="8" class="sk-main" />
    </div>

    <template v-else>
      <el-row :gutter="16" class="metric-row">
        <el-col v-for="m in summaryItems" :key="m.key" :xs="24" :sm="12" :md="6" class="metric-col">
          <div :class="['metric-card', m.tone]">
            <div class="metric-card-inner">
              <div class="metric-card-icon" aria-hidden="true">
                <el-icon :size="22"><component :is="m.icon" /></el-icon>
              </div>
              <div class="metric-card-text">
                <span class="metric-card-label">{{ m.label }}</span>
                <span class="metric-card-value">{{ summaryDisplay(m.key) }}</span>
              </div>
            </div>
          </div>
        </el-col>
      </el-row>

      <el-card class="panel-card results-panel" shadow="never">
        <template #header>
          <div class="panel-header">
            <div class="panel-header-titles">
              <span class="panel-title">历史成绩</span>
              <span class="panel-sub">共 {{ results.length }} 条记录</span>
            </div>
            <div class="toolbar">
              <span class="toolbar-label">表格密度</span>
              <div class="density-toggle">
                <el-radio-group v-model="mode" size="small">
                  <el-radio-button value="default">{{ labelMap.default }}</el-radio-button>
                  <el-radio-button value="compact">{{ labelMap.compact }}</el-radio-button>
                  <el-radio-button value="comfortable">{{ labelMap.comfortable }}</el-radio-button>
                </el-radio-group>
              </div>
            </div>
          </div>
        </template>

        <el-empty v-if="!results.length" class="results-empty" :image-size="120">
          <template #image>
            <div class="empty-illus">
              <el-icon><TrendCharts /></el-icon>
            </div>
          </template>
          <template #description>
            <p class="empty-title">暂无成绩记录</p>
            <p class="empty-sub">请先完成任务并提交；教师发起批改后，成绩将在此汇总展示。</p>
          </template>
          <el-button type="primary" round @click="$router.push('/student/tasks')">去看任务</el-button>
        </el-empty>

        <el-table
          v-else
          :data="results"
          border
          :size="tableSize"
          stripe
          class="data-table results-data-table"
          style="width: 100%"
        >
          <el-table-column prop="title" label="任务名称" min-width="160" show-overflow-tooltip />
          <el-table-column prop="total_score" label="AI分" width="92" align="center" />
          <el-table-column prop="human_score" label="教师分" width="92" align="center" />
          <el-table-column label="综合分" width="104" align="center">
            <template #default="scope">
              <span class="score-cell">{{
                scope.row.displayScore ?? scope.row.final_score ?? scope.row.total_score ?? '—'
              }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="132" align="center">
            <template #default="scope">
              <el-tag
                round
                effect="light"
                :type="gradingStatusType(scope.row.status)"
                class="status-pill"
              >
                {{ gradingStatusText(scope.row.status) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="提交时间" min-width="176">
            <template #default="scope">{{ formatDateTime(scope.row.submitted_at) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="128" align="center" fixed="right">
            <template #default="scope">
              <el-button
                type="primary"
                size="small"
                plain
                round
                class="detail-btn"
                @click="viewDetail(scope.row.submission_id)"
              >
                查看详情
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { TrendCharts, CircleCheck, DataAnalysis, Top, Bottom } from '@element-plus/icons-vue'
import { useRtOnDomains } from '../../composables/useRtOnDomains'
import { getStudentGradingResults } from '../../api/grading'
import { useTableDensity } from '../../composables/useTableDensity'
import { formatDateTime } from '../../utils/format'
import { gradingStatusType, gradingStatusText } from '../../utils/gradingStatusDisplay'

const router = useRouter()
const { mode, tableSize, labelMap } = useTableDensity()

const results = ref([])
const loading = ref(true)

const summaryItems = [
  { key: 'completed', label: '已完成任务', tone: 'tone-blue', icon: CircleCheck },
  { key: 'avg', label: '平均分', tone: 'tone-teal', icon: DataAnalysis },
  { key: 'max', label: '最高分', tone: 'tone-amber', icon: Top },
  { key: 'min', label: '最低分', tone: 'tone-slate', icon: Bottom },
]

const pickScore = (r) => {
  const v = r.displayScore ?? r.final_score ?? r.total_score
  return v === null || v === undefined || v === '' ? null : Number(v)
}

const completedCount = computed(() => results.value.length)

const averageScore = computed(() => {
  const scores = results.value.map(pickScore).filter((n) => n != null && !Number.isNaN(n))
  if (scores.length === 0) return '0.0'
  return (scores.reduce((sum, s) => sum + s, 0) / scores.length).toFixed(1)
})

const maxScore = computed(() => {
  const scores = results.value.map(pickScore).filter((n) => n != null && !Number.isNaN(n))
  return scores.length > 0 ? Math.max(...scores).toFixed(1) : '0.0'
})

const minScore = computed(() => {
  const scores = results.value.map(pickScore).filter((n) => n != null && !Number.isNaN(n))
  return scores.length > 0 ? Math.min(...scores).toFixed(1) : '0.0'
})

const summaryDisplay = (key) => {
  if (key === 'completed') return completedCount.value
  if (key === 'avg') return averageScore.value
  if (key === 'max') return maxScore.value
  if (key === 'min') return minScore.value
  return '—'
}

const loadResults = async () => {
  loading.value = true
  try {
    const response = await getStudentGradingResults()
    if (response.success) {
      results.value = response.data
    }
  } catch (error) {
    console.error('获取成绩失败:', error)
  } finally {
    loading.value = false
  }
}

const viewDetail = (submissionId) => {
  router.push(`/student/results/${submissionId}`)
}

useRtOnDomains(['grading', 'submissions', 'scores'], () => loadResults())

onMounted(() => {
  loadResults()
})
</script>

<style scoped>
.page-results {
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 2px 8px;
}

.page-head {
  margin-bottom: 24px;
  padding-bottom: 4px;
}

.page-title {
  margin: 0 0 8px;
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--sg-text);
  line-height: 1.25;
}

.page-desc {
  margin: 0;
  max-width: 640px;
  font-size: 14px;
  line-height: 1.55;
  font-weight: 400;
  color: var(--sg-text-secondary);
}

.results-loading {
  padding: 8px 0 24px;
}

.results-loading-hint {
  margin: 0 0 14px;
  font-size: 13px;
  color: var(--sg-text-secondary);
}

.sk-main {
  padding: 4px 0 12px;
}

.metric-row {
  margin-bottom: 22px;
}

.metric-col {
  margin-bottom: 12px;
}

@media (min-width: 768px) {
  .metric-col {
    margin-bottom: 0;
  }
}

.metric-card {
  position: relative;
  height: 100%;
  min-height: 108px;
  padding: 18px 18px 18px 16px;
  border-radius: var(--sg-radius-lg);
  border: 1px solid var(--sg-border);
  background: linear-gradient(165deg, #ffffff 0%, #f8fafc 100%);
  box-shadow: var(--sg-shadow-sm);
  transition:
    transform var(--sg-transition-fast),
    box-shadow var(--sg-transition),
    border-color var(--sg-transition);
}

.metric-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--sg-shadow-md);
  border-color: var(--sg-border-strong);
}

.metric-card-inner {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.metric-card-icon {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.metric-card-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.metric-card-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--sg-text-placeholder);
  line-height: 1.3;
}

.metric-card-value {
  font-family:
    system-ui,
    -apple-system,
    'Segoe UI',
    Roboto,
    'PingFang SC',
    'Microsoft YaHei',
    sans-serif;
  font-size: 28px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.03em;
  line-height: 1.1;
  color: var(--sg-text);
}

.tone-blue {
  border-top: 3px solid #1d4ed8;
}
.tone-blue .metric-card-icon {
  color: #1d4ed8;
  background: rgba(37, 99, 235, 0.1);
}

.tone-teal {
  border-top: 3px solid #0d9488;
}
.tone-teal .metric-card-icon {
  color: #0f766e;
  background: rgba(13, 148, 136, 0.12);
}

.tone-amber {
  border-top: 3px solid #ea580c;
}
.tone-amber .metric-card-icon {
  color: #c2410c;
  background: rgba(234, 88, 12, 0.1);
}

.tone-slate {
  border-top: 3px solid #475569;
}
.tone-slate .metric-card-icon {
  color: #334155;
  background: rgba(71, 85, 105, 0.12);
}

@media (prefers-reduced-motion: reduce) {
  .metric-card:hover {
    transform: none;
  }
}

.panel-card.results-panel {
  border-radius: var(--sg-radius-lg);
  border: 1px solid var(--sg-border);
  overflow: hidden;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px 20px;
  flex-wrap: wrap;
}

.panel-header-titles {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 12px;
}

.panel-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--sg-text);
  letter-spacing: -0.01em;
}

.panel-sub {
  font-size: 13px;
  font-weight: 500;
  color: var(--sg-text-placeholder);
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 10px 12px;
  flex-wrap: wrap;
}

.toolbar-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--sg-text-secondary);
  white-space: nowrap;
}

.density-toggle {
  padding: 3px;
  border-radius: var(--sg-radius-md);
  background: var(--sg-fill-muted);
  border: 1px solid var(--sg-border);
}

.density-toggle :deep(.el-radio-group) {
  display: inline-flex;
}

.density-toggle :deep(.el-radio-button__inner) {
  font-weight: 500;
}

.data-table.results-data-table {
  border-radius: var(--sg-radius-md);
}

.results-data-table :deep(.el-table__header-wrapper th.el-table__cell) {
  background: linear-gradient(180deg, #f1f5f9 0%, #e8eef5 100%) !important;
  color: var(--sg-text) !important;
  font-weight: 600;
  font-size: 13px;
  border-bottom: 1px solid var(--sg-border-strong) !important;
}

.results-data-table :deep(.el-table__body tr:hover > td.el-table__cell) {
  background-color: rgba(37, 99, 235, 0.055) !important;
}

.results-data-table :deep(.el-table__body td.el-table__cell) {
  transition: background-color var(--sg-transition-fast);
}

.score-cell {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--sg-text);
}

.status-pill {
  font-weight: 600;
  padding: 0 14px;
  height: 28px;
  line-height: 26px;
  border: none;
}

.status-pill.el-tag--success {
  --el-tag-bg-color: rgba(5, 150, 105, 0.12);
  --el-tag-border-color: transparent;
  --el-tag-text-color: #047857;
}

.status-pill.el-tag--warning {
  --el-tag-bg-color: rgba(217, 119, 6, 0.14);
  --el-tag-border-color: transparent;
  --el-tag-text-color: #b45309;
}

.status-pill.el-tag--danger {
  --el-tag-bg-color: rgba(220, 38, 38, 0.1);
  --el-tag-border-color: transparent;
  --el-tag-text-color: #b91c1c;
}

.status-pill.el-tag--info {
  --el-tag-bg-color: rgba(2, 132, 199, 0.1);
  --el-tag-border-color: transparent;
  --el-tag-text-color: #0369a1;
}

.detail-btn {
  font-weight: 600;
  min-width: 88px;
  transition:
    transform var(--sg-transition-fast),
    box-shadow var(--sg-transition-fast),
    border-color var(--sg-transition-fast),
    background-color var(--sg-transition-fast);
}

.detail-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2);
}

@media (prefers-reduced-motion: reduce) {
  .detail-btn:hover {
    transform: none;
  }
}

.results-empty :deep(.el-empty__description) {
  margin-top: 4px;
}

.results-empty :deep(.el-empty__bottom) {
  margin-top: 18px;
}

.empty-title {
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--sg-text);
}

.empty-sub {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--sg-text-secondary);
  max-width: 340px;
  margin-left: auto;
  margin-right: auto;
}

.empty-illus {
  width: 112px;
  height: 112px;
  margin: 0 auto;
  border-radius: 50%;
  background: linear-gradient(145deg, rgba(37, 99, 235, 0.08) 0%, rgba(13, 148, 136, 0.12) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 44px;
  color: var(--sg-primary);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6);
}
</style>
