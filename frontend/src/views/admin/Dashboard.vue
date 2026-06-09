<template>
  <div class="admin-overview">
    <header class="overview-head">
      <div class="overview-head__main">
        <h1 class="overview-title">数据概览</h1>
        <p class="overview-subtitle">
          校企协同实训评价平台运行总览，汇总用户组织、课程教学、任务提交与批改评价数据。
        </p>
        <div class="overview-meta">
          <span class="meta-chip">数据范围：全平台</span>
          <span class="meta-chip">更新时间：{{ updatedAtText }}</span>
        </div>
      </div>
      <el-button type="primary" plain :loading="loading" @click="refreshAll">
        <el-icon><Refresh /></el-icon>
        刷新数据
      </el-button>
    </header>

    <el-skeleton v-if="loading && !loadedOnce" animated :rows="12" class="overview-skeleton" />

    <div v-else-if="!hasPlatformData" class="tw-panel overview-empty">
      <el-empty :image-size="96">
        <template #description>
          <h3 class="tw-empty-title">暂无平台统计数据</h3>
          <p class="tw-empty-desc">
            完成课程、班级、任务与提交数据初始化后，系统将自动生成平台运行概览。
          </p>
        </template>
      </el-empty>
    </div>

    <template v-else>
      <section v-for="group in kpiGroups" :key="group.key" class="tw-panel kpi-group-panel">
        <div class="tw-panel__header">
          <h2 class="tw-panel__title">{{ group.title }}</h2>
        </div>
        <div class="tw-panel__body">
          <div class="kpi-group__grid">
            <div v-for="item in group.items" :key="item.key" class="kpi-card">
              <div class="kpi-card__icon" :class="`kpi-card__icon--${item.tone}`">
                <el-icon><component :is="item.icon" /></el-icon>
              </div>
              <div class="kpi-card__body">
                <span class="kpi-card__label">{{ item.label }}</span>
                <span class="kpi-card__value">{{ displayMetric(item.key) }}</span>
                <span class="kpi-card__hint">{{ item.hint }}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="tw-panel status-panel">
        <div class="tw-panel__header">
          <h2 class="tw-panel__title">平台运行状态</h2>
          <el-tag :type="platformStatusTag" effect="plain" size="small">{{ platformStatusText }}</el-tag>
        </div>
        <div class="tw-panel__body">
          <div class="status-grid">
            <div class="status-item">
              <span class="status-item__label">待批改提交</span>
              <span class="status-item__value">{{ pendingCount }}</span>
              <span class="status-item__unit">条</span>
            </div>
            <div class="status-item">
              <span class="status-item__label">批改完成率</span>
              <span class="status-item__value">{{ formatRate(gradeCompletionRate) }}</span>
            </div>
            <div class="status-item">
              <span class="status-item__label">提交完成率</span>
              <span class="status-item__value">{{ formatRate(submitActivityRate) }}</span>
            </div>
            <div v-if="platformAvgScore != null" class="status-item">
              <span class="status-item__label">平台平均成绩</span>
              <span class="status-item__value">{{ platformAvgScore.toFixed(1) }}</span>
              <span class="status-item__unit">分</span>
            </div>
          </div>
          <p v-if="lowScoreClassHint" class="status-note status-note--warn">{{ lowScoreClassHint }}</p>
          <p v-else class="status-note">各班级成绩与提交情况正常，暂无低分班级预警。</p>
        </div>
      </section>

      <el-row :gutter="16" class="chart-row">
        <el-col :xs="24" :lg="12">
          <section class="tw-panel chart-panel">
            <div class="tw-panel__header">
              <h2 class="tw-panel__title">班级学生规模</h2>
              <span class="tw-panel__meta">各班级学生占比</span>
            </div>
            <div class="tw-panel__body chart-panel__body">
              <div v-if="!classStatsRaw.length" class="chart-empty">
                <el-empty description="暂无班级学生数据" :image-size="72" />
              </div>
              <div v-else ref="classChartRef" class="chart-box" />
            </div>
          </section>
        </el-col>
        <el-col :xs="24" :lg="12">
          <section class="tw-panel chart-panel">
            <div class="tw-panel__header">
              <h2 class="tw-panel__title">班级平均分排行</h2>
              <span class="tw-panel__meta">横向对比</span>
            </div>
            <div class="tw-panel__body chart-panel__body">
              <div v-if="!rankedScoreClasses.length" class="chart-empty">
                <el-empty description="暂无有效成绩数据" :image-size="72" />
              </div>
              <div
                v-else
                ref="scoreChartRef"
                class="chart-box"
                :style="{ height: `${Math.max(320, rankedScoreClasses.length * 40)}px` }"
              />
            </div>
          </section>
        </el-col>
      </el-row>

      <el-row :gutter="16" class="chart-row">
        <el-col :xs="24" :lg="14">
          <section class="tw-panel chart-panel">
            <div class="tw-panel__header">
              <h2 class="tw-panel__title">任务提交与批改概况</h2>
              <span class="tw-panel__meta">全平台数量汇总</span>
            </div>
            <div class="tw-panel__body chart-panel__body">
              <div v-if="!stats.taskCount && !stats.submissionCount" class="chart-empty">
                <el-empty description="暂无任务与提交数据" :image-size="72" />
              </div>
              <div v-else ref="summaryChartRef" class="chart-box chart-box--compact" />
            </div>
          </section>
        </el-col>
        <el-col :xs="24" :lg="10">
          <section class="tw-panel chart-panel">
            <div class="tw-panel__header">
              <h2 class="tw-panel__title">批改状态占比</h2>
              <span class="tw-panel__meta">已批改 / 待批改</span>
            </div>
            <div class="tw-panel__body chart-panel__body">
              <div v-if="!stats.submissionCount" class="chart-empty">
                <el-empty description="暂无提交与批改数据" :image-size="72" />
              </div>
              <div v-else ref="gradeRingChartRef" class="chart-box chart-box--compact" />
            </div>
          </section>
        </el-col>
      </el-row>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import {
  User,
  OfficeBuilding,
  Document,
  Upload,
  CircleCheck,
  Reading,
  School,
  EditPen,
  TrendCharts,
  Refresh,
  Briefcase,
} from '@element-plus/icons-vue'
import { getDashboardStats, getAllClassStatistics } from '../../api/dashboard'
import { listEnterpriseUsers } from '../../api/user'
import { formatDateTime } from '../../utils/format'
import * as echarts from 'echarts'

const stats = ref({
  studentCount: 0,
  teacherCount: 0,
  classCount: 0,
  courseCount: 0,
  teachingClassCount: 0,
  curriculumTaskCount: 0,
  taskCount: 0,
  submissionCount: 0,
  gradedCount: 0,
})

const enterpriseCount = ref(null)
const loading = ref(true)
const loadedOnce = ref(false)
const updatedAtText = ref('—')
const classStatsRaw = ref([])

const classChartRef = ref(null)
const scoreChartRef = ref(null)
const summaryChartRef = ref(null)
const gradeRingChartRef = ref(null)
let classChartInstance = null
let scoreChartInstance = null
let summaryChartInstance = null
let gradeRingChartInstance = null

const CHART_PALETTE = ['#1677ff', '#52c41a', '#13c2c2', '#722ed1', '#faad14', '#eb2f96', '#2f54eb', '#fa8c16']

const pendingCount = computed(() =>
  Math.max(0, Number(stats.value.submissionCount) - Number(stats.value.gradedCount))
)

const gradeCompletionRate = computed(() => {
  const sub = Number(stats.value.submissionCount) || 0
  if (!sub) return null
  return (Number(stats.value.gradedCount) / sub) * 100
})

const submitActivityRate = computed(() => {
  const rows = classStatsRaw.value.filter((c) => Number(c.studentCount) > 0)
  if (!rows.length) return null
  const sum = rows.reduce((s, c) => {
    const rate = Math.min(100, (Number(c.submissionCount) / Number(c.studentCount)) * 100)
    return s + rate
  }, 0)
  return sum / rows.length
})

const platformAvgScore = computed(() => {
  const rows = classStatsRaw.value.filter(
    (c) => Number(c.submissionCount) > 0 && parseFloat(c.avgScore) > 0
  )
  if (!rows.length) return null
  const sum = rows.reduce((s, c) => s + parseFloat(c.avgScore), 0)
  return sum / rows.length
})

const rankedScoreClasses = computed(() =>
  [...classStatsRaw.value]
    .filter((c) => Number(c.submissionCount) > 0 && parseFloat(c.avgScore) > 0)
    .sort((a, b) => parseFloat(b.avgScore) - parseFloat(a.avgScore))
)

const lowScoreClasses = computed(() =>
  classStatsRaw.value.filter(
    (c) =>
      Number(c.submissionCount) > 0 &&
      parseFloat(c.avgScore) > 0 &&
      parseFloat(c.avgScore) < 60
  )
)

const lowScoreClassHint = computed(() => {
  if (!lowScoreClasses.value.length) return ''
  const names = lowScoreClasses.value
    .slice(0, 3)
    .map((c) => c.class_name)
    .join('、')
  const suffix = lowScoreClasses.value.length > 3 ? ` 等 ${lowScoreClasses.value.length} 个班` : ''
  return `低分班级预警：${names}${suffix}（平均分低于 60）`
})

const platformStatusText = computed(() => {
  if (pendingCount.value > 20) return '待批改较多'
  if (pendingCount.value > 0) return '有待处理'
  return '正常'
})

const platformStatusTag = computed(() => {
  if (pendingCount.value > 20) return 'warning'
  if (pendingCount.value > 0) return 'info'
  return 'success'
})

const hasPlatformData = computed(() => {
  const s = stats.value
  return (
    Object.values(s).some((v) => Number(v) > 0) ||
    classStatsRaw.value.length > 0
  )
})

const kpiGroups = computed(() => {
  const orgItems = [
    {
      key: 'studentCount',
      label: '学生',
      hint: '平台学生账号总量',
      icon: User,
      tone: 'blue',
    },
    {
      key: 'teacherCount',
      label: '教师',
      hint: '平台教师账号总量',
      icon: User,
      tone: 'indigo',
    },
    {
      key: 'classCount',
      label: '行政班',
      hint: '行政班级组织数量',
      icon: OfficeBuilding,
      tone: 'slate',
    },
  ]
  if (enterpriseCount.value != null) {
    orgItems.push({
      key: 'enterpriseCount',
      label: '企业导师',
      hint: '企业导师账号总量',
      icon: Briefcase,
      tone: 'teal',
    })
  }

  return [
    { key: 'org', title: '用户组织', items: orgItems },
    {
      key: 'resource',
      title: '教学资源',
      items: [
        { key: 'courseCount', label: '课程', hint: '平台课程资源总量', icon: Reading, tone: 'violet' },
        { key: 'teachingClassCount', label: '教学班', hint: '课程教学班数量', icon: School, tone: 'cyan' },
        { key: 'curriculumTaskCount', label: '课程任务', hint: '关联课程/教学班任务', icon: Document, tone: 'blue' },
      ],
    },
    {
      key: 'practice',
      title: '实训评价',
      items: [
        { key: 'taskCount', label: '任务总数', hint: '全平台实训任务', icon: Document, tone: 'amber' },
        { key: 'submissionCount', label: '提交数', hint: '学生成果提交总量', icon: Upload, tone: 'orange' },
        { key: 'gradedCount', label: '已批改', hint: '已完成 AI/人工批改', icon: CircleCheck, tone: 'green' },
        { key: 'pendingCount', label: '待批改', hint: '提交数 − 已批改', icon: EditPen, tone: 'rose' },
      ],
    },
    {
      key: 'runtime',
      title: '运行状态',
      items: [
        {
          key: 'submitActivityRate',
          label: '提交完成率',
          hint: '各班级人均提交比例均值',
          icon: TrendCharts,
          tone: 'cyan',
        },
        {
          key: 'gradeCompletionRate',
          label: '批改完成率',
          hint: '已批改 / 提交数',
          icon: CircleCheck,
          tone: 'green',
        },
        {
          key: 'platformAvgScore',
          label: '平均成绩',
          hint: '有成绩班级的均值',
          icon: TrendCharts,
          tone: 'blue',
        },
      ],
    },
  ]
})

function displayMetric(key) {
  if (key === 'pendingCount') return pendingCount.value
  if (key === 'enterpriseCount') return enterpriseCount.value ?? '—'
  if (key === 'submitActivityRate') return formatRate(submitActivityRate.value)
  if (key === 'gradeCompletionRate') return formatRate(gradeCompletionRate.value)
  if (key === 'platformAvgScore') {
    return platformAvgScore.value != null ? platformAvgScore.value.toFixed(1) : '—'
  }
  const v = stats.value[key]
  return v != null && v !== '' ? v : '—'
}

function formatRate(val) {
  if (val == null || Number.isNaN(val)) return '—'
  return `${val.toFixed(1)}%`
}

function truncateLabel(name, max = 8) {
  const s = String(name || '')
  return s.length > max ? `${s.slice(0, max)}…` : s
}

function classGradeRate(row) {
  const sub = Number(row.submissionCount) || 0
  if (!sub) return 0
  return Math.round((Number(row.gradedCount) / sub) * 100)
}

const renderClassChart = () => {
  const data = classStatsRaw.value
  if (!classChartRef.value || !data.length) return
  classChartInstance?.dispose()
  classChartInstance = echarts.init(classChartRef.value)
  const totalStudents = data.reduce((s, item) => s + (Number(item.studentCount) || 0), 0)
  classChartInstance.setOption({
    color: CHART_PALETTE,
    title: totalStudents
      ? {
          text: String(totalStudents),
          subtext: '学生总数',
          left: '36%',
          top: '42%',
          textAlign: 'center',
          textStyle: { fontSize: 26, fontWeight: 700, color: '#0f172a' },
          subtextStyle: { fontSize: 12, color: '#94a3b8' },
        }
      : undefined,
    tooltip: {
      trigger: 'item',
      formatter: (p) => {
        const row = data[p.dataIndex]
        const pct = totalStudents ? ((p.value / totalStudents) * 100).toFixed(1) : '0'
        return `${row.class_name}<br/>学生数：${p.value}<br/>占比：${pct}%`
      },
    },
    legend: {
      type: 'scroll',
      orient: 'vertical',
      right: 8,
      top: 'middle',
      textStyle: { color: '#64748b', fontSize: 12 },
      formatter: (name) => {
        const row = data.find((item) => item.class_name === name)
        const count = row ? Number(row.studentCount) || 0 : 0
        return `${truncateLabel(name, 10)}  ${count} 人`
      },
    },
    series: [
      {
        name: '学生数',
        type: 'pie',
        radius: ['42%', '68%'],
        center: ['38%', '50%'],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
        label: { show: false },
        labelLine: { show: false },
        emphasis: {
          scale: true,
          scaleSize: 6,
        },
        data: data.map((item) => ({
          name: item.class_name,
          value: Number(item.studentCount) || 0,
        })),
      },
    ],
  })
}

const renderScoreChart = () => {
  const data = rankedScoreClasses.value
  if (!scoreChartRef.value || !data.length) return
  scoreChartInstance?.dispose()
  scoreChartInstance = echarts.init(scoreChartRef.value)
  const names = data.map((item) => truncateLabel(item.class_name, 10)).reverse()
  const scores = data.map((item) => parseFloat(item.avgScore).toFixed(1)).reverse()
  scoreChartInstance.setOption({
    color: CHART_PALETTE,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params) => {
        const idx = data.length - 1 - params[0].dataIndex
        const row = data[idx]
        return [
          row.class_name,
          `平均分：${parseFloat(row.avgScore).toFixed(1)}`,
          `提交数：${row.submissionCount ?? 0}`,
          `批改率：${classGradeRate(row)}%`,
        ].join('<br/>')
      },
    },
    grid: { left: '4%', right: '12%', bottom: '4%', top: '4%', containLabel: true },
    xAxis: {
      type: 'value',
      max: 100,
      splitLine: { lineStyle: { type: 'dashed', color: '#e8edf3' } },
    },
    yAxis: {
      type: 'category',
      data: names,
      axisLabel: { color: '#64748b' },
    },
    series: [
      {
        name: '平均分',
        type: 'bar',
        data: scores.map((val, i) => ({
          value: val,
          itemStyle: {
            color: CHART_PALETTE[i % CHART_PALETTE.length],
            borderRadius: [0, 4, 4, 0],
          },
        })),
        barMaxWidth: 18,
        label: { show: true, position: 'right', formatter: '{c} 分', color: '#475569', fontSize: 11 },
      },
    ],
  })
}

const renderSummaryChart = () => {
  if (!summaryChartRef.value) return
  const s = stats.value
  if (!s.taskCount && !s.submissionCount) return
  summaryChartInstance?.dispose()
  summaryChartInstance = echarts.init(summaryChartRef.value)
  const categories = ['任务总数', '提交数', '已批改', '待批改']
  const values = [
    Number(s.taskCount) || 0,
    Number(s.submissionCount) || 0,
    Number(s.gradedCount) || 0,
    pendingCount.value,
  ]
  summaryChartInstance.setOption({
    color: CHART_PALETTE,
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { show: false },
    grid: { left: '3%', right: '4%', bottom: '8%', top: '12%', containLabel: true },
    xAxis: {
      type: 'category',
      data: categories,
      axisLabel: { color: '#64748b' },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      splitLine: { lineStyle: { type: 'dashed', color: '#e8edf3' } },
    },
    series: [
      {
        name: '数量',
        type: 'bar',
        barMaxWidth: 48,
        data: values.map((val, i) => ({
          value: val,
          itemStyle: {
            color: CHART_PALETTE[i],
            borderRadius: [6, 6, 0, 0],
          },
        })),
        label: { show: true, position: 'top', color: '#475569' },
      },
    ],
  })
}

const renderGradeRingChart = () => {
  if (!gradeRingChartRef.value) return
  const sub = Number(stats.value.submissionCount) || 0
  if (!sub) return
  gradeRingChartInstance?.dispose()
  gradeRingChartInstance = echarts.init(gradeRingChartRef.value)
  const graded = Number(stats.value.gradedCount) || 0
  const pending = pendingCount.value
  const rate = gradeCompletionRate.value
  gradeRingChartInstance.setOption({
    color: ['#52c41a', '#faad14'],
    title: rate != null
      ? {
          text: `${rate.toFixed(1)}%`,
          subtext: '批改完成率',
          left: '50%',
          top: '44%',
          textAlign: 'center',
          textVerticalAlign: 'middle',
          itemGap: 4,
          textStyle: { fontSize: 26, fontWeight: 700, color: '#0f172a' },
          subtextStyle: { fontSize: 12, color: '#94a3b8' },
        }
      : undefined,
    tooltip: {
      trigger: 'item',
      formatter: (p) => {
        const pct = sub ? ((p.value / sub) * 100).toFixed(1) : '0'
        return `${p.name}<br/>${p.value} 条（${pct}%）`
      },
    },
    legend: {
      bottom: 8,
      left: 'center',
      itemGap: 28,
      textStyle: { color: '#64748b', fontSize: 12 },
      formatter: (name) => {
        const val = name === '已批改' ? graded : pending
        return `${name}  ${val} 条`
      },
    },
    series: [
      {
        name: '批改状态',
        type: 'pie',
        radius: ['50%', '72%'],
        center: ['50%', '44%'],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 8, borderColor: '#fff', borderWidth: 2 },
        label: { show: false },
        labelLine: { show: false },
        emphasis: {
          scale: true,
          scaleSize: 6,
        },
        data: [
          { name: '已批改', value: graded },
          { name: '待批改', value: pending },
        ],
      },
    ],
  })
}

const initCharts = async () => {
  await nextTick()
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)))
  renderClassChart()
  renderScoreChart()
  renderSummaryChart()
  renderGradeRingChart()
}

const loadStats = async () => {
  const response = await getDashboardStats()
  if (response.success) {
    stats.value = { ...stats.value, ...response.data }
  }
}

const loadClassStatistics = async () => {
  const response = await getAllClassStatistics()
  if (response.success) {
    classStatsRaw.value = response.data || []
  }
}

const loadEnterpriseCount = async () => {
  try {
    const res = await listEnterpriseUsers()
    if (res.success) enterpriseCount.value = (res.data || []).length
  } catch {
    enterpriseCount.value = null
  }
}

const refreshAll = async () => {
  loading.value = true
  try {
    await Promise.all([loadStats(), loadClassStatistics(), loadEnterpriseCount()])
    updatedAtText.value = formatDateTime(new Date())
    loadedOnce.value = true
  } finally {
    loading.value = false
  }
  await initCharts()
}

const handleResize = () => {
  classChartInstance?.resize()
  scoreChartInstance?.resize()
  summaryChartInstance?.resize()
  gradeRingChartInstance?.resize()
}

onMounted(async () => {
  await refreshAll()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  classChartInstance?.dispose()
  scoreChartInstance?.dispose()
  summaryChartInstance?.dispose()
  gradeRingChartInstance?.dispose()
})
</script>

<style scoped>
.admin-overview {
  max-width: 1400px;
  margin: 0 auto;
  padding: 4px 4px 32px;
  min-height: calc(100vh - 120px);
  background: #eef2f7;
}

.overview-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px 24px;
  margin-bottom: 20px;
}

.overview-title {
  margin: 0 0 8px;
  font-size: 24px;
  font-weight: 700;
  color: #0f172a;
  letter-spacing: -0.02em;
}

.overview-subtitle {
  margin: 0 0 12px;
  max-width: 42rem;
  font-size: 14px;
  line-height: 1.65;
  color: #64748b;
}

.overview-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.meta-chip {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 500;
  color: #475569;
  background: #fff;
  border: 1px solid #e8edf3;
  border-radius: 999px;
}

.overview-skeleton {
  padding: 12px 0;
}

.overview-empty {
  padding: 48px 24px;
}

.kpi-group-panel {
  margin-bottom: 20px;
}

.kpi-group__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 14px;
}

.kpi-card {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  min-height: 96px;
  padding: 14px 16px;
  background: #f8fafc;
  border: 1px solid #eef2f7;
  border-radius: 10px;
}

.kpi-card__icon {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
}

.kpi-card__icon--blue { background: #eff6ff; color: #2563eb; }
.kpi-card__icon--indigo { background: #eef2ff; color: #4f46e5; }
.kpi-card__icon--slate { background: #f1f5f9; color: #475569; }
.kpi-card__icon--teal { background: #f0fdfa; color: #0d9488; }
.kpi-card__icon--violet { background: #f5f3ff; color: #7c3aed; }
.kpi-card__icon--cyan { background: #ecfeff; color: #0891b2; }
.kpi-card__icon--amber { background: #fffbeb; color: #d97706; }
.kpi-card__icon--orange { background: #fff7ed; color: #ea580c; }
.kpi-card__icon--green { background: #f0fdf4; color: #16a34a; }
.kpi-card__icon--rose { background: #fff1f2; color: #e11d48; }

.kpi-card__body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.kpi-card__label {
  font-size: 13px;
  font-weight: 600;
  color: #64748b;
}

.kpi-card__value {
  font-size: 26px;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
}

.kpi-card__hint {
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.4;
}

.status-panel {
  margin-bottom: 20px;
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 16px;
}

.status-item {
  padding: 14px 16px;
  background: #f8fafc;
  border-radius: 10px;
  border: 1px solid #eef2f7;
}

.status-item__label {
  display: block;
  font-size: 12px;
  color: #64748b;
  margin-bottom: 6px;
}

.status-item__value {
  font-size: 24px;
  font-weight: 700;
  color: #0f172a;
  font-variant-numeric: tabular-nums;
}

.status-item__unit {
  margin-left: 4px;
  font-size: 13px;
  font-weight: 500;
  color: #94a3b8;
}

.status-note {
  margin: 16px 0 0;
  font-size: 13px;
  color: #64748b;
  line-height: 1.55;
}

.status-note--warn {
  color: #b45309;
}

.chart-row {
  margin-bottom: 16px;
}

.chart-panel {
  height: 100%;
  margin-bottom: 16px;
}

.chart-panel__body {
  padding-top: 8px;
}

.chart-box {
  height: 320px;
}

.chart-box--tall {
  height: max(320px, min(480px, 40px * var(--rows, 6)));
}

.chart-box--compact {
  height: 280px;
}

.chart-empty {
  height: 280px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
