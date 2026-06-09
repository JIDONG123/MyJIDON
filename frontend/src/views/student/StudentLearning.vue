<template>
  <div class="learning-portrait">
    <header class="portrait-head">
      <div class="portrait-head__main">
        <h1 class="portrait-title">个人学情画像</h1>
        <p class="portrait-subtitle">
          基于历史实训成绩、AI 分析与教师评价，汇总个人能力表现、薄弱问题与改进建议。
        </p>
      </div>
      <div class="portrait-head__tags">
        <el-tag type="primary" effect="plain">能力诊断</el-tag>
        <el-tag type="warning" effect="plain">薄弱分析</el-tag>
        <el-tag type="success" effect="plain">学习建议</el-tag>
      </div>
    </header>

    <el-skeleton v-if="loading" animated :rows="10" class="portrait-skeleton" />

    <template v-else>
      <div v-if="!hasData" class="panel empty-panel">
        <el-empty :image-size="96">
          <template #description>
            <h3 class="empty-title">暂无学情画像</h3>
            <p class="empty-desc">
              完成实训任务并通过批改后，系统会基于成绩、教师评价和 AI 分析生成个人学情画像。
            </p>
          </template>
          <el-button type="primary" @click="goTasks">去实训中心</el-button>
        </el-empty>
      </div>

      <template v-else>
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

        <div class="panel diagnosis-panel" :class="`diagnosis-panel--${diagnosis.tone}`">
          <h2 class="panel__title">{{ diagnosis.title }}</h2>
          <p class="diagnosis-panel__text">{{ diagnosis.text }}</p>
        </div>

        <div class="content-grid">
          <section class="panel dimension-panel">
            <div class="panel__header">
              <h2 class="panel__title">个人能力维度画像</h2>
              <span class="panel__meta">基于 AI 分析与批改反馈归纳</span>
            </div>
            <div class="dimension-list">
              <div v-for="dim in dimensions" :key="dim.name" class="dimension-row">
                <div class="dimension-row__head">
                  <span class="dimension-row__name">{{ dim.name }}</span>
                  <div class="dimension-row__right">
                    <span class="dimension-row__score">{{ dim.displayScore }}</span>
                    <el-tag
                      size="small"
                      effect="plain"
                      :type="dim.level.tone"
                      class="dimension-tier"
                    >
                      {{ dim.level.label }}
                    </el-tag>
                  </div>
                </div>
                <el-progress
                  v-if="dim.rate != null"
                  :percentage="dim.rate"
                  :stroke-width="8"
                  :show-text="false"
                  :color="dimensionBarColor(dim.level.key)"
                />
                <div v-else class="dimension-row__empty">暂无数据</div>
              </div>
            </div>
            <div v-if="radarReady" ref="radarRef" class="radar-chart" />
          </section>

          <section class="panel side-panel">
            <div class="panel__header">
              <h2 class="panel__title">最近表现趋势</h2>
            </div>
            <div v-if="trend.hasTrend" class="trend-stats">
              <div class="trend-stat">
                <span class="trend-stat__label">分析样本</span>
                <span class="trend-stat__value">{{ trend.recentCount }} 次</span>
              </div>
              <div class="trend-stat">
                <span class="trend-stat__label">近期平均分</span>
                <span class="trend-stat__value trend-stat__value--primary">
                  {{ formatScore(trend.avgScore) }}
                </span>
              </div>
              <div class="trend-stat">
                <span class="trend-stat__label">最高分</span>
                <span class="trend-stat__value">{{ formatScore(trend.maxScore) }}</span>
              </div>
              <div class="trend-stat">
                <span class="trend-stat__label">最低分</span>
                <span class="trend-stat__value">{{ formatScore(trend.minScore) }}</span>
              </div>
            </div>
            <p v-else class="panel-empty-hint">暂无足够成绩样本，完成更多实训后将展示趋势。</p>
            <p v-if="trend.volatilityHint" class="trend-hint">{{ trend.volatilityHint }}</p>
            <ul v-if="trend.recentScores.length" class="trend-scores">
              <li v-for="(score, idx) in trend.recentScores" :key="idx">
                <span class="trend-scores__label">第 {{ idx + 1 }} 次</span>
                <span class="trend-scores__value">{{ formatScore(score) }}</span>
              </li>
            </ul>
            <ul v-if="trend.taskIssues.length" class="trend-tasks">
              <li v-for="(task, idx) in trend.taskIssues" :key="idx">
                <span class="trend-tasks__name">{{ task.name }}</span>
                <span class="trend-tasks__meta">待改进项 {{ task.issues }}</span>
              </li>
            </ul>
          </section>
        </div>

        <section class="panel">
          <div class="panel__header">
            <h2 class="panel__title">个人高频问题</h2>
            <span class="panel__meta">Top 问题 · 结构化摘要</span>
          </div>
          <div v-if="!topProblems.length" class="panel-empty-hint">暂无高频问题记录</div>
          <div v-else class="problem-list">
            <article v-for="(item, idx) in topProblems" :key="idx" class="problem-item">
              <div class="problem-item__head">
                <span class="problem-item__rank">{{ idx + 1 }}</span>
                <h3 class="problem-item__title">{{ item.title }}</h3>
                <el-tag size="small" effect="plain" class="problem-tag">{{ item.tag }}</el-tag>
                <span class="problem-item__freq">{{ item.freqLabel }}</span>
              </div>
              <p
                class="problem-item__summary"
                :class="{ 'problem-item__summary--clamp': !isExpanded(idx) }"
              >
                {{ isExpanded(idx) ? item.summary : item.summaryShort }}
              </p>
              <button
                v-if="item.summary.length > 120"
                type="button"
                class="text-toggle"
                @click="toggleExpand(idx)"
              >
                {{ isExpanded(idx) ? '收起' : '展开详情' }}
              </button>
            </article>
          </div>
        </section>

        <section class="panel">
          <div class="panel__header">
            <h2 class="panel__title">改进建议清单</h2>
            <span class="panel__meta">按优先级整理</span>
          </div>
          <ul v-if="improvementList.length" class="improve-list">
            <li v-for="(tip, idx) in improvementList" :key="idx" class="improve-item">
              <span class="improve-item__dot" />
              <span class="improve-item__text">{{ tip }}</span>
            </li>
          </ul>
          <div v-else class="panel-empty-hint">暂无改进建议，完成批改后将自动生成。</div>
        </section>
      </template>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick, reactive, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  Document,
  TrendCharts,
  Trophy,
  Warning,
  Flag,
} from '@element-plus/icons-vue'
import * as echarts from 'echarts'
import { getMyLearningProfile, getMyClassWeak } from '../../api/analytics'
import { getMyArchive } from '../../api/user'
import { buildRadarChartMeta } from '../../utils/echartsRadar'
import {
  computeLearningSummary,
  learningDiagnostic,
  buildDimensionProfile,
  buildTopProblems,
  buildImprovementList,
  buildRecentTrend,
  radarSeriesFromDimensions,
  collectRecentScores,
} from '../../utils/studentLearningDisplay'

const router = useRouter()
const loading = ref(true)
const profile = ref(null)
const classWeak = ref(null)
const archiveItems = ref([])
const radarRef = ref(null)
const expandedKeys = reactive(new Set())
let radarChart = null

const recentScores = computed(() => collectRecentScores(archiveItems.value, 30))

const summary = computed(() =>
  computeLearningSummary(profile.value, classWeak.value, recentScores.value)
)
const hasData = computed(() => summary.value.hasData)

const diagnosis = computed(() => learningDiagnostic(profile.value?.avgScore))

const dimensions = computed(() =>
  buildDimensionProfile(profile.value?.weakPoints || [], classWeak.value?.weakDimensions || [])
)

const topProblems = computed(() =>
  buildTopProblems(profile.value?.weakPoints || [], classWeak.value?.problemSamples || [])
)

const improvementList = computed(() =>
  buildImprovementList(
    profile.value?.improvementSuggestions || [],
    profile.value?.weakPoints || []
  )
)

const trend = computed(() => buildRecentTrend(profile.value, recentScores.value))

const radarReady = computed(() => radarSeriesFromDimensions(dimensions.value).length >= 3)

const statCards = computed(() => [
  {
    key: 'done',
    label: '完成实训',
    value: summary.value.completed,
    hint: '近期批改样本',
    icon: Document,
    tone: 'blue',
  },
  {
    key: 'avg',
    label: '平均成绩',
    value: summary.value.avgScore,
    hint: '综合得分均值',
    icon: TrendCharts,
    tone: 'teal',
  },
  {
    key: 'max',
    label: '最高成绩',
    value: summary.value.maxScore,
    hint: '历史最佳',
    icon: Trophy,
    tone: 'indigo',
  },
  {
    key: 'need',
    label: '待提升任务',
    value: summary.value.needImproveTasks,
    hint: '含待改进反馈',
    icon: Flag,
    tone: 'orange',
  },
  {
    key: 'weak',
    label: '主要薄弱点',
    value: summary.value.mainWeakPoints,
    hint: '能力维度待加强',
    icon: Warning,
    tone: 'red',
  },
])

function formatScore(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  return `${Number(value).toFixed(1)} 分`
}

function dimensionBarColor(levelKey) {
  if (levelKey === 'strong') return '#16a34a'
  if (levelKey === 'normal') return '#1677ff'
  if (levelKey === 'fair') return '#d97706'
  return '#dc2626'
}

function isExpanded(idx) {
  return expandedKeys.has(idx)
}

function toggleExpand(idx) {
  if (expandedKeys.has(idx)) expandedKeys.delete(idx)
  else expandedKeys.add(idx)
}

function goTasks() {
  router.push('/student/tasks')
}

const renderRadar = async () => {
  await nextTick()
  if (!radarRef.value || !radarReady.value) {
    radarChart?.dispose()
    radarChart = null
    return
  }

  const seriesData = radarSeriesFromDimensions(dimensions.value)
  const { indicators, splitNumber } = buildRadarChartMeta(seriesData)
  if (!indicators.length) return

  if (!radarChart) {
    radarChart = echarts.getInstanceByDom(radarRef.value) || echarts.init(radarRef.value)
  }

  radarChart.setOption(
    {
      animation: true,
      animationDuration: 400,
      tooltip: { trigger: 'item' },
      radar: {
        indicator: indicators,
        splitNumber,
        axisName: { color: '#64748b', fontSize: 11 },
        splitLine: { lineStyle: { color: '#e2e8f0' } },
        axisLine: { lineStyle: { color: '#cbd5e1' } },
      },
      series: [
        {
          type: 'radar',
          data: [
            {
              value: seriesData.map((d) => d.score),
              name: '能力表现',
              areaStyle: { color: 'rgba(22, 119, 255, 0.12)' },
              lineStyle: { color: '#1677ff', width: 2 },
              itemStyle: { color: '#1677ff' },
            },
          ],
        },
      ],
    },
    { notMerge: true }
  )
  radarChart.resize()
}

const load = async () => {
  loading.value = true
  try {
    const [p, c, a] = await Promise.all([
      getMyLearningProfile(),
      getMyClassWeak(),
      getMyArchive(),
    ])
    if (p.success) profile.value = p.data
    if (c.success) classWeak.value = c.data
    if (a.success) archiveItems.value = a.data || []
    else archiveItems.value = []
    await renderRadar()
  } finally {
    loading.value = false
  }
}

const onResize = () => radarChart?.resize()

watch([dimensions, radarReady], () => {
  renderRadar()
})

onMounted(() => {
  load()
  window.addEventListener('resize', onResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  radarChart?.dispose()
})
</script>

<style scoped>
.learning-portrait {
  max-width: 1040px;
  margin: -20px -24px -36px;
  padding: 20px 24px 36px;
  min-height: calc(100vh - 120px);
  background: #eef2f7;
  box-sizing: border-box;
}

.portrait-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}

.portrait-title {
  margin: 0 0 8px;
  font-size: 24px;
  font-weight: 700;
  color: #0f172a;
  letter-spacing: -0.02em;
}

.portrait-subtitle {
  margin: 0;
  max-width: 40rem;
  font-size: 14px;
  line-height: 1.65;
  color: #64748b;
}

.portrait-head__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
  gap: 14px;
  margin-bottom: 16px;
}

.metric-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  background: #fff;
  border: 1px solid #e8edf3;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
}

.metric-card__icon {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}

.metric-card__icon--blue { background: #eff6ff; color: #1677ff; }
.metric-card__icon--teal { background: #f0fdfa; color: #0d9488; }
.metric-card__icon--indigo { background: #eef2ff; color: #4f46e5; }
.metric-card__icon--orange { background: #fff7ed; color: #ea580c; }
.metric-card__icon--red { background: #fef2f2; color: #dc2626; }

.metric-card__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.metric-card__value {
  font-size: 24px;
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

.panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px 12px;
  border-bottom: 1px solid #eef2f7;
}

.panel__title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.panel__meta {
  font-size: 12px;
  color: #94a3b8;
}

.diagnosis-panel {
  padding: 16px 18px;
}

.diagnosis-panel__text {
  margin: 8px 0 0;
  font-size: 14px;
  line-height: 1.65;
  color: #475569;
}

.diagnosis-panel--success {
  border-color: #bbf7d0;
  background: #f0fdf4;
}

.diagnosis-panel--primary {
  border-color: #bfdbfe;
  background: #f8fbff;
}

.diagnosis-panel--warning {
  border-color: #fde68a;
  background: #fffbeb;
}

.diagnosis-panel--danger {
  border-color: #fecaca;
  background: #fef2f2;
}

.diagnosis-panel--info {
  border-color: #e2e8f0;
  background: #f8fafc;
}

.content-grid {
  display: grid;
  grid-template-columns: 1.2fr 0.8fr;
  gap: 16px;
  margin-bottom: 0;
}

.dimension-panel,
.side-panel {
  margin-bottom: 16px;
}

.dimension-list {
  padding: 12px 18px 8px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.dimension-row__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.dimension-row__name {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
}

.dimension-row__right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dimension-row__score {
  font-size: 12px;
  color: #64748b;
  font-variant-numeric: tabular-nums;
}

.dimension-tier {
  border: none !important;
}

.dimension-row__empty {
  font-size: 11px;
  color: #cbd5e1;
}

.radar-chart {
  height: 260px;
  width: 100%;
  padding: 0 12px 12px;
}

.trend-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  padding: 14px 18px 8px;
}

.trend-stat {
  padding: 10px 12px;
  background: #f8fafc;
  border-radius: 8px;
}

.trend-stat__label {
  display: block;
  font-size: 11px;
  color: #94a3b8;
  margin-bottom: 4px;
}

.trend-stat__value {
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
  font-variant-numeric: tabular-nums;
}

.trend-stat__value--primary {
  color: #1677ff;
}

.trend-hint {
  margin: 0;
  padding: 0 18px 8px;
  font-size: 13px;
  line-height: 1.6;
  color: #64748b;
}

.trend-scores {
  margin: 0;
  padding: 0 18px 8px;
  list-style: none;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
  gap: 8px;
}

.trend-scores li {
  padding: 8px 10px;
  background: #f8fafc;
  border-radius: 8px;
  text-align: center;
}

.trend-scores__label {
  display: block;
  font-size: 11px;
  color: #94a3b8;
  margin-bottom: 2px;
}

.trend-scores__value {
  font-size: 14px;
  font-weight: 700;
  color: #1677ff;
  font-variant-numeric: tabular-nums;
}

.trend-tasks {
  margin: 0;
  padding: 0 18px 16px;
  list-style: none;
}

.trend-tasks li {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 0;
  border-top: 1px dashed #eef2f7;
  font-size: 13px;
}

.trend-tasks__name {
  color: #334155;
  font-weight: 600;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trend-tasks__meta {
  color: #94a3b8;
  flex-shrink: 0;
}

.problem-list {
  padding: 8px 18px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.problem-item {
  padding: 12px 14px;
  border: 1px solid #eef2f7;
  border-radius: 10px;
  background: #fafbfc;
}

.problem-item__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.problem-item__rank {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: #eff6ff;
  color: #1677ff;
  font-size: 12px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.problem-item__title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
  flex: 1;
  min-width: 0;
}

.problem-tag {
  background: #f1f5f9 !important;
  border-color: #e2e8f0 !important;
  color: #475569 !important;
}

.problem-item__freq {
  font-size: 11px;
  color: #94a3b8;
}

.problem-item__summary {
  margin: 0;
  font-size: 13px;
  line-height: 1.65;
  color: #64748b;
}

.problem-item__summary--clamp {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.text-toggle {
  margin-top: 6px;
  padding: 0;
  border: none;
  background: none;
  font-size: 12px;
  font-weight: 600;
  color: #1677ff;
  cursor: pointer;
}

.improve-list {
  margin: 0;
  padding: 12px 18px 18px;
  list-style: none;
}

.improve-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px dashed #eef2f7;
}

.improve-item:last-child {
  border-bottom: none;
}

.improve-item__dot {
  width: 8px;
  height: 8px;
  margin-top: 6px;
  border-radius: 50%;
  background: #1677ff;
  flex-shrink: 0;
}

.improve-item__text {
  font-size: 14px;
  line-height: 1.65;
  color: #475569;
}

.panel-empty-hint {
  padding: 16px 18px 18px;
  margin: 0;
  font-size: 13px;
  color: #94a3b8;
}

.portrait-skeleton {
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
  margin: 0 auto;
  max-width: 28rem;
  font-size: 14px;
  line-height: 1.6;
  color: #64748b;
}

@media (max-width: 900px) {
  .content-grid {
    grid-template-columns: 1fr;
  }

  .metric-grid {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 520px) {
  .metric-grid {
    grid-template-columns: 1fr;
  }
}
</style>
