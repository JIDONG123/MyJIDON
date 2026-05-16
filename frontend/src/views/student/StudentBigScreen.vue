<template>
  <div class="bs-page" :class="{ 'bs-ready': vizReady }">
    <div class="bs-toolbar">
      <h1>本班实训数据大屏</h1>
      <el-button type="primary" plain @click="toggleFs">{{ isFs ? '退出全屏' : '全屏' }}</el-button>
    </div>
    <el-skeleton v-if="loading" :rows="4" animated />
    <template v-else-if="data && !data.empty">
      <el-row :gutter="16" class="kpis" :key="'kpi-' + dataBlockKey">
        <el-col :xs="12" :sm="6" v-for="k in kpiItems" :key="k.label">
          <div class="kpi">
            <span class="kpi-val">{{ k.value }}</span>
            <span class="kpi-lab">{{ k.label }}</span>
          </div>
        </el-col>
      </el-row>
      <el-row :gutter="16" class="charts" :key="'chart-' + dataBlockKey">
        <el-col :xs="24" :lg="14">
          <div class="panel">
            <h3>成绩分布</h3>
            <div v-if="data.scoreBuckets?.length" ref="barRef" class="chart" />
            <div v-else class="chart chart--empty">
              <el-empty
                description="暂无分数分布（需存在已批改且总分/最终分不为空的记录）"
                :image-size="56"
              />
            </div>
          </div>
        </el-col>
        <el-col :xs="24" :lg="10">
          <div class="panel panel--secondary">
            <h3>薄弱提示（节选）</h3>
            <ul class="hints">
              <li v-for="(h, i) in data.weakHints || []" :key="i">{{ h }}</li>
            </ul>
            <el-empty v-if="!(data.weakHints?.length)" description="暂无" :image-size="48" />
          </div>
        </el-col>
      </el-row>
    </template>
    <el-empty v-else description="暂无大屏数据或未分班" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import * as echarts from 'echarts'
import { getBigScreenStats } from '../../api/dashboard'

const loading = ref(true)
const data = ref(null)
const barRef = ref(null)
let chart = null
const isFs = ref(false)

const vizReady = computed(() => !loading.value && !!(data.value && !data.value.empty))

const dataBlockKey = computed(() => {
  const d = data.value
  if (!d || d.empty) return '0'
  const o = d.overview || {}
  return [d.classId, o.submissionCount, o.gradedCount].join('-')
})

const kpiItems = computed(() => {
  const o = data.value?.overview || {}
  return [
    { label: '学生数', value: o.studentCount ?? '—' },
    { label: '任务数', value: o.taskCount ?? '—' },
    { label: '提交数', value: o.submissionCount ?? '—' },
    { label: '已批改', value: o.gradedCount ?? '—' },
    { label: '平均分', value: o.avgScore != null ? Number(o.avgScore).toFixed(2) : '—' },
  ]
})

const render = async () => {
  await nextTick()
  if (!barRef.value || !data.value?.scoreBuckets?.length) {
    chart?.dispose()
    chart = null
    return
  }
  if (!chart) chart = echarts.init(barRef.value)
  const b = data.value.scoreBuckets
  chart.setOption(
    {
      animation: true,
      animationDuration: 520,
      animationDurationUpdate: 420,
      animationEasing: 'cubicOut',
      color: ['#38bdf8', '#22d3ee'],
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(15, 23, 42, 0.94)',
        borderColor: 'rgba(148, 163, 184, 0.35)',
        textStyle: { color: '#e2e8f0' },
      },
      grid: { left: 44, right: 16, bottom: 36, top: 20 },
      xAxis: {
        type: 'category',
        data: b.map((x) => x.bucket),
        axisLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.35)' } },
        axisLabel: { color: '#94a3b8' },
      },
      yAxis: {
        type: 'value',
        name: '人数',
        nameTextStyle: { color: '#94a3b8' },
        splitLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.1)' } },
        axisLabel: { color: '#94a3b8' },
      },
      series: [
        {
          type: 'bar',
          data: b.map((x) => x.cnt),
          barMaxWidth: 48,
          itemStyle: {
            borderRadius: [8, 8, 0, 0],
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#7dd3fc' },
              { offset: 1, color: '#0284c7' },
            ]),
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 16,
              shadowColor: 'rgba(56, 189, 248, 0.45)',
            },
          },
        },
      ],
    },
    { notMerge: true }
  )
}

const load = async () => {
  loading.value = true
  try {
    const res = await getBigScreenStats({})
    if (res.success) data.value = res.data
  } finally {
    loading.value = false
  }
  // 须在骨架屏消失、图表容器挂载后再 init ECharts，否则会一直空白
  await nextTick()
  await render()
}

const onResize = () => chart?.resize()

const toggleFs = async () => {
  const el = document.querySelector('.student-layout .bs-page') || document.querySelector('.bs-page')
  if (!el) return
  if (!document.fullscreenElement) {
    await el.requestFullscreen?.()
    isFs.value = true
  } else {
    await document.exitFullscreen?.()
    isFs.value = false
  }
}

watch(
  () => data.value,
  () => render(),
  { deep: true }
)

onMounted(() => {
  load()
  window.addEventListener('resize', onResize)
  document.addEventListener('fullscreenchange', () => {
    isFs.value = Boolean(document.fullscreenElement)
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  chart?.dispose()
})
</script>

<style scoped>
.bs-page {
  position: relative;
  min-height: calc(100vh - 120px);
  padding: 20px 22px 28px;
  background: radial-gradient(ellipse 110% 70% at 10% -5%, rgba(14, 165, 233, 0.2), transparent 52%),
    radial-gradient(ellipse 90% 55% at 100% 10%, rgba(45, 212, 191, 0.12), transparent 48%), #0a0f1a;
  color: #e2e8f0;
  overflow: hidden;
}

.bs-page::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: linear-gradient(rgba(148, 163, 184, 0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(148, 163, 184, 0.035) 1px, transparent 1px);
  background-size: 40px 40px;
  mask-image: radial-gradient(ellipse 88% 65% at 50% 42%, black 22%, transparent 72%);
  pointer-events: none;
}

.bs-toolbar {
  position: relative;
  z-index: 1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 22px;
  flex-wrap: wrap;
  gap: 12px;
}

.bs-toolbar h1 {
  margin: 0;
  font-size: 21px;
  font-weight: 700;
  letter-spacing: -0.02em;
  text-shadow: 0 2px 24px rgba(0, 0, 0, 0.35);
}

.kpis {
  position: relative;
  z-index: 1;
  margin-bottom: 20px;
}

.kpi {
  position: relative;
  background: linear-gradient(145deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 0.88) 100%);
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 14px;
  padding: 18px 14px;
  text-align: center;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
  opacity: 0;
  transform: translateY(10px);
  transition:
    border-color 0.3s ease,
    box-shadow 0.3s ease;
}

.bs-ready .kpi {
  animation: bs-kpi-in 0.55s var(--sg-ease-out) forwards;
}

.bs-ready .kpis :deep(.el-col:nth-child(1) .kpi) {
  animation-delay: 0.05s;
}
.bs-ready .kpis :deep(.el-col:nth-child(2) .kpi) {
  animation-delay: 0.1s;
}
.bs-ready .kpis :deep(.el-col:nth-child(3) .kpi) {
  animation-delay: 0.15s;
}
.bs-ready .kpis :deep(.el-col:nth-child(4) .kpi) {
  animation-delay: 0.2s;
}
.bs-ready .kpis :deep(.el-col:nth-child(5) .kpi) {
  animation-delay: 0.25s;
}

.kpi:hover {
  border-color: rgba(56, 189, 248, 0.45);
  box-shadow: 0 12px 40px rgba(14, 165, 233, 0.14);
}

@keyframes bs-kpi-in {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.kpi-val {
  display: block;
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -0.03em;
  background: linear-gradient(120deg, #bae6fd, #38bdf8);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.kpi-lab {
  font-size: 12px;
  color: #94a3b8;
  margin-top: 6px;
  font-weight: 500;
}

.charts {
  position: relative;
  z-index: 1;
}

.panel {
  position: relative;
  background: linear-gradient(160deg, rgba(30, 41, 59, 0.96) 0%, rgba(15, 23, 42, 0.9) 100%);
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 16px;
  padding: 18px 18px 20px;
  min-height: 280px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.28);
  opacity: 0;
  animation: bs-panel-in 0.5s var(--sg-ease-out) 0.12s forwards;
}

.panel--secondary {
  animation-delay: 0.18s;
}

@keyframes bs-panel-in {
  to {
    opacity: 1;
  }
}

.panel h3 {
  margin: 0 0 14px;
  font-size: 15px;
  font-weight: 600;
  color: #f1f5f9;
  letter-spacing: 0.02em;
}

.chart {
  height: 272px;
  width: 100%;
}

.chart--empty {
  display: flex;
  align-items: center;
  justify-content: center;
}

.chart--empty :deep(.el-empty__description) {
  color: #94a3b8;
}

.hints {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.75;
  color: #cbd5e1;
}

@media (prefers-reduced-motion: reduce) {
  .kpi,
  .bs-ready .kpi,
  .panel {
    animation: none !important;
    opacity: 1;
    transform: none;
  }
}
</style>
