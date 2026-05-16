<template>
  <div class="page-dashboard">
    <header class="page-head">
      <div>
        <h1 class="page-title">数据概览</h1>
        <p class="page-desc">高校–企业协同实训评价：全平台用户、任务与批改数据一览</p>
      </div>
    </header>

    <el-skeleton v-if="loading" animated :rows="6" class="sk-main" />

    <template v-else>
      <el-row :gutter="16" class="stat-grid">
        <el-col v-for="item in statItems" :key="item.key" :xs="24" :sm="12" :md="8" :lg="4" :xl="4">
          <div :class="['metric-card', item.tone]">
            <div class="metric-icon">
              <el-icon><component :is="item.icon" /></el-icon>
            </div>
            <div class="metric-body">
              <span class="metric-value">{{ stats[item.key] ?? 0 }}</span>
              <span class="metric-label">{{ item.label }}</span>
            </div>
          </div>
        </el-col>
      </el-row>

      <el-row :gutter="16" class="chart-row">
        <el-col :xs="24" :lg="12">
          <el-card class="chart-card" shadow="never">
            <template #header>
              <div class="chart-card-head">
                <span>各班级学生数</span>
                <span class="chart-hint">柱状</span>
              </div>
            </template>
            <div v-if="!classStatsRaw.length" class="chart-empty">
              <el-empty description="暂无班级数据" :image-size="80" />
            </div>
            <div v-else ref="classChart" class="chart-box" />
          </el-card>
        </el-col>
        <el-col :xs="24" :lg="12">
          <el-card class="chart-card" shadow="never">
            <template #header>
              <div class="chart-card-head">
                <span>班级平均分分布</span>
                <span class="chart-hint">环形</span>
              </div>
            </template>
            <div v-if="!classStatsRaw.length" class="chart-empty">
              <el-empty description="暂无班级数据" :image-size="80" />
            </div>
            <div v-else ref="scoreChart" class="chart-box" />
          </el-card>
        </el-col>
      </el-row>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { User, OfficeBuilding, Document, Upload, CircleCheck } from '@element-plus/icons-vue'
import { getDashboardStats, getAllClassStatistics } from '../../api/dashboard'
import * as echarts from 'echarts'

const stats = ref({
  studentCount: 0,
  teacherCount: 0,
  classCount: 0,
  taskCount: 0,
  submissionCount: 0,
  gradedCount: 0,
})

const statItems = [
  { key: 'studentCount', label: '学生', icon: User, tone: 'm--violet' },
  { key: 'teacherCount', label: '教师', icon: User, tone: 'm--rose' },
  { key: 'classCount', label: '班级', icon: OfficeBuilding, tone: 'm--cyan' },
  { key: 'taskCount', label: '任务', icon: Document, tone: 'm--blue' },
  { key: 'submissionCount', label: '提交', icon: Upload, tone: 'm--amber' },
  { key: 'gradedCount', label: '已批改', icon: CircleCheck, tone: 'm--teal' },
]

const loading = ref(true)
const classStatsRaw = ref([])
const classChart = ref(null)
const scoreChart = ref(null)
let classChartInstance = null
let scoreChartInstance = null

const loadStats = async () => {
  const response = await getDashboardStats()
  if (response.success) {
    stats.value = response.data
  }
}

const loadClassStatistics = async () => {
  const response = await getAllClassStatistics()
  if (response.success) {
    classStatsRaw.value = response.data || []
  }
}

const initChartsAfterPaint = async () => {
  await nextTick()
  await nextChartTick()
  renderClassChart(classStatsRaw.value)
  renderScoreChart(classStatsRaw.value)
}

const nextChartTick = () =>
  new Promise((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve, 0))
  })

const renderClassChart = (data) => {
  if (!classChart.value || !data.length) return
  classChartInstance?.dispose()
  classChartInstance = echarts.init(classChart.value)
  classChartInstance.setOption({
    color: ['#1677ff'],
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: '3%', right: '4%', bottom: '8%', top: '12%', containLabel: true },
    xAxis: {
      type: 'category',
      data: data.map((item) => item.class_name),
      axisLabel: { color: '#64748b', rotate: data.length > 6 ? 28 : 0 },
    },
    yAxis: { type: 'value', splitLine: { lineStyle: { type: 'dashed', color: '#e5e6eb' } } },
    series: [
      {
        name: '学生数',
        type: 'bar',
        barMaxWidth: 36,
        data: data.map((item) => item.studentCount || 0),
        itemStyle: {
          borderRadius: [6, 6, 0, 0],
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#4096ff' },
            { offset: 1, color: '#1677ff' },
          ]),
        },
      },
    ],
  })
}

const renderScoreChart = (data) => {
  if (!scoreChart.value || !data.length) return
  scoreChartInstance?.dispose()
  scoreChartInstance = echarts.init(scoreChart.value)
  const pieData = data.map((item) => ({
    value: parseFloat(item.avgScore) || 0,
    name: item.class_name,
  }))
  scoreChartInstance.setOption({
    tooltip: { trigger: 'item' },
    legend: { type: 'scroll', bottom: 0, textStyle: { color: '#64748b' } },
    series: [
      {
        name: '平均分',
        type: 'pie',
        radius: ['38%', '68%'],
        center: ['50%', '46%'],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 8, borderColor: '#fff', borderWidth: 2 },
        label: { formatter: '{b}\n{c}分', fontSize: 11 },
        data: pieData,
      },
    ],
  })
}

const handleResize = () => {
  classChartInstance?.resize()
  scoreChartInstance?.resize()
}

onMounted(async () => {
  loading.value = true
  try {
    await loadStats()
    await loadClassStatistics()
  } finally {
    loading.value = false
  }
  await initChartsAfterPaint()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  classChartInstance?.dispose()
  scoreChartInstance?.dispose()
})
</script>

<style scoped>
.page-dashboard {
  max-width: 1400px;
}

.page-head {
  margin-bottom: 20px;
}

.page-title {
  margin: 0 0 6px;
  font-size: 22px;
  font-weight: 600;
  color: var(--sg-text);
}

.page-desc {
  margin: 0;
  font-size: 14px;
  color: var(--sg-text-secondary);
}

.sk-main {
  padding: 12px 0;
}

.stat-grid {
  margin-bottom: 20px;
}

.metric-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 16px;
  border-radius: var(--sg-radius-lg);
  background: #fff;
  border: 1px solid var(--sg-border);
  box-shadow: var(--sg-shadow-card);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  height: 100%;
}

.metric-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
}

.metric-icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  color: #fff;
}

.m--violet .metric-icon {
  background: linear-gradient(135deg, #64748b 0%, #475569 100%);
}
.m--rose .metric-icon {
  background: linear-gradient(135deg, #f472b6 0%, #ec4899 100%);
}
.m--cyan .metric-icon {
  background: linear-gradient(135deg, #22d3ee 0%, #0891b2 100%);
}
.m--blue .metric-icon {
  background: linear-gradient(135deg, #60a5fa 0%, #1677ff 100%);
}
.m--amber .metric-icon {
  background: linear-gradient(135deg, #fbbf24 0%, #f97316 100%);
}
.m--teal .metric-icon {
  background: linear-gradient(135deg, #34d399 0%, #059669 100%);
}

.metric-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.metric-value {
  font-size: 22px;
  font-weight: 700;
  color: var(--sg-text);
  line-height: 1.2;
}

.metric-label {
  font-size: 12px;
  color: var(--sg-text-secondary);
}

.chart-row {
  align-items: stretch;
}

.chart-card {
  border-radius: var(--sg-radius-lg);
  border: 1px solid var(--sg-border);
  height: 100%;
}

.chart-card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
  color: var(--sg-text);
}

.chart-hint {
  font-size: 12px;
  font-weight: normal;
  color: var(--sg-text-placeholder);
}

.chart-box {
  height: 320px;
}

.chart-empty {
  height: 280px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
