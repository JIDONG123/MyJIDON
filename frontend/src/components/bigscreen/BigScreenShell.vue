<template>
  <div class="bs-page" :class="{ 'bs-ready': vizReady, 'bs-fullscreen': isFs }">
    <div class="bs-grid-bg" aria-hidden="true" />

    <header class="bs-header">
      <div class="bs-header__brand">
        <h1 class="bs-title">{{ title }}</h1>
        <p class="bs-subtitle">{{ subtitle }}</p>
      </div>

      <div class="bs-header__scope">
        <slot name="scope" />
      </div>

      <div class="bs-header__meta">
        <div class="meta-block">
          <span class="meta-label">当前时间</span>
          <span class="meta-value">{{ nowClock }}</span>
        </div>
        <div class="meta-block">
          <span class="meta-label">最近更新</span>
          <span class="meta-value">{{ lastUpdated || '—' }}</span>
        </div>
        <button type="button" class="fs-btn" :class="{ 'fs-btn--active': isFs }" @click="toggleFs">
          <span class="fs-btn__icon" aria-hidden="true">
            <svg v-if="!isFs" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />
            </svg>
            <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" />
            </svg>
          </span>
          {{ isFs ? '退出全屏' : '全屏展示' }}
        </button>
      </div>
    </header>

    <slot name="alert" />

    <div v-if="loading" class="bs-loading">
      <el-skeleton :rows="6" animated />
    </div>

    <template v-else-if="scopeReady">
      <section class="kpi-grid" :key="'kpi-' + dataKey">
        <article
          v-for="(k, idx) in kpiItems"
          :key="k.key"
          class="kpi-card"
          :class="`kpi-card--${k.tone}`"
          :style="{ animationDelay: `${idx * 0.06}s` }"
        >
          <div class="kpi-card__icon" aria-hidden="true">
            <component :is="kpiIcon(k.icon)" />
          </div>
          <div class="kpi-card__body">
            <span class="kpi-card__val">{{ k.value }}</span>
            <span class="kpi-card__lab">{{ k.label }}</span>
            <span v-if="k.sub" class="kpi-card__sub">{{ k.sub }}</span>
          </div>
        </article>
      </section>

      <section class="row-2" :key="'row2-' + dataKey">
        <article class="panel panel--chart">
          <header class="panel__head">
            <h3>成绩分布</h3>
            <span class="panel__hint">分段：&lt;60 · 60-69 · 70-79 · 80-89 · 90+</span>
          </header>
          <div v-if="hasScoreData" ref="barRef" class="chart" />
          <div v-else class="chart chart--empty">
            <el-empty description="当前班级暂无成绩统计数据" :image-size="64" />
          </div>
        </article>

        <article class="panel panel--weak">
          <header class="panel__head">
            <h3>高频问题 Top 5</h3>
            <span class="panel__hint">基于 AI 批改反馈聚合</span>
          </header>
          <ul v-if="weakTop5.length" class="weak-list">
            <li v-for="(item, i) in weakTop5" :key="i" class="weak-item">
              <span class="weak-rank">{{ i + 1 }}</span>
              <div class="weak-body">
                <span class="weak-tag">{{ item.tag }}</span>
                <p class="weak-desc">{{ item.desc }}</p>
              </div>
              <span class="weak-count">{{ item.count }} 次</span>
            </li>
          </ul>
          <div v-else class="chart chart--empty chart--short">
            <el-empty description="暂无薄弱问题分析数据" :image-size="56" />
          </div>
        </article>
      </section>

      <section class="row-3" :key="'row3-' + dataKey">
        <article class="panel panel--chart">
          <header class="panel__head">
            <h3>任务完成概览</h3>
          </header>
          <div v-if="hasOverviewData" ref="rankRef" class="chart chart--short" />
          <div v-else class="chart chart--empty chart--short">
            <el-empty description="暂无任务完成数据" :image-size="56" />
          </div>
        </article>

        <article class="panel panel--chart">
          <header class="panel__head">
            <h3>批改状态分布</h3>
          </header>
          <div v-if="hasGradingPie" ref="pieRef" class="chart chart--short" />
          <div v-else class="chart chart--empty chart--short">
            <el-empty description="暂无批改状态数据" :image-size="56" />
          </div>
        </article>

        <article class="panel panel--summary">
          <header class="panel__head">
            <h3>知识点薄弱分布</h3>
          </header>
          <div v-if="hasWeakTagChart" ref="weakTagRef" class="chart chart--short" />
          <div v-else class="summary-fallback">
            <div class="ai-summary">
              <p class="ai-summary__title">AI 分析摘要</p>
              <p v-if="aiSummaryText" class="ai-summary__text">{{ aiSummaryText }}</p>
              <el-empty v-else description="暂无 AI 分析摘要" :image-size="48" />
            </div>
          </div>
        </article>
      </section>
    </template>

    <div v-else class="bs-no-scope">
      <el-empty :description="noScopeText" :image-size="80" />
    </div>

  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, h } from 'vue'
import * as echarts from 'echarts'
import {
  normalizeScoreBuckets,
  aggregateWeakHints,
  buildKpiItems,
  buildGradingPie,
  buildCompletionBars,
  buildWeakTagChart,
} from '../../utils/bigScreenData'

const props = defineProps({
  title: { type: String, default: '数据大屏' },
  subtitle: { type: String, default: '班级实训总览与评价分析' },
  loading: { type: Boolean, default: false },
  data: { type: Object, default: null },
  scopeReady: { type: Boolean, default: false },
  layoutRootSelector: { type: String, default: '.bs-page' },
  noScopeText: { type: String, default: '请选择班级后查看数据' },
})

const barRef = ref(null)
const pieRef = ref(null)
const rankRef = ref(null)
const weakTagRef = ref(null)
const charts = []
const isFs = ref(false)
const nowClock = ref('')
const lastUpdated = ref('')
let clockTimer = null

const overview = computed(() => props.data?.overview || {})
const scoreBuckets = computed(() => normalizeScoreBuckets(props.data?.scoreBuckets))
const weakTop5 = computed(() => aggregateWeakHints(props.data?.weakHints, 5))
const kpiItems = computed(() => buildKpiItems(overview.value))

const hasScoreData = computed(() => scoreBuckets.value.some((b) => b.cnt > 0))
const hasOverviewData = computed(() => {
  const o = overview.value
  return (Number(o.studentCount) || 0) > 0 || (Number(o.taskCount) || 0) > 0
})
const gradingPieData = computed(() => buildGradingPie(overview.value))
const hasGradingPie = computed(() => gradingPieData.value.length > 0)
const weakTagData = computed(() => buildWeakTagChart(props.data?.weakHints))
const hasWeakTagChart = computed(() => weakTagData.value.length > 0)

const aiSummaryText = computed(() => {
  const hints = props.data?.weakHints || []
  if (!hints.length) return ''
  const top = weakTop5.value[0]
  const tagChart = weakTagData.value
  const topTag = tagChart.length ? tagChart.sort((a, b) => b.value - a.value)[0]?.name : ''
  const parts = [`共识别 ${hints.length} 条批改反馈线索`]
  if (topTag) parts.push(`主要薄弱维度：${topTag}`)
  if (top) parts.push(`最高频问题：${top.desc.slice(0, 48)}${top.desc.length > 48 ? '…' : ''}`)
  return parts.join('；') + '。'
})

const dataKey = computed(() => {
  const d = props.data
  if (!d) return 'empty'
  const o = d.overview || {}
  return [d.classId, d.teachingClassId, o.submissionCount, o.gradedCount].join('-')
})

const vizReady = computed(() => !props.loading && props.scopeReady)

function kpiIcon(name) {
  const paths = {
    users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
    tasks: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
    upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
    check: 'M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3',
    score: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
    rate: 'M22 12h-4l-3 9L9 3l-3 9H2',
  }
  return {
    render() {
      return h(
        'svg',
        { viewBox: '0 0 24 24', width: 22, height: 22, fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8' },
        [h('path', { d: paths[name] || paths.tasks })]
      )
    },
  }
}

function tickClock() {
  nowClock.value = new Date().toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

function disposeCharts() {
  for (const c of charts) {
    if (c && !c.isDisposed()) c.dispose()
  }
  charts.length = 0
}

function getOrInit(dom) {
  if (!dom || dom.clientWidth === 0 || dom.clientHeight === 0) return null
  let inst = echarts.getInstanceByDom(dom)
  if (inst && !inst.isDisposed()) return inst
  inst = echarts.init(dom, undefined, { renderer: 'canvas' })
  charts.push(inst)
  return inst
}

const CHART_TEXT = { color: '#94a3b8' }
const TOOLTIP = {
  backgroundColor: 'rgba(15, 23, 42, 0.94)',
  borderColor: 'rgba(148, 163, 184, 0.35)',
  textStyle: { color: '#e2e8f0' },
}

async function renderCharts() {
  await nextTick()
  if (props.loading || !props.scopeReady) {
    disposeCharts()
    return
  }

  if (hasScoreData.value && barRef.value) {
    const chart = getOrInit(barRef.value)
    if (chart) {
      const b = scoreBuckets.value
      chart.setOption(
        {
          animation: true,
          animationDuration: 640,
          color: ['#38bdf8'],
          tooltip: { ...TOOLTIP, trigger: 'axis' },
          grid: { left: 48, right: 20, bottom: 40, top: 28 },
          xAxis: {
            type: 'category',
            data: b.map((x) => x.bucket),
            axisLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.35)' } },
            axisLabel: { color: CHART_TEXT.color, fontSize: 12, fontWeight: 500 },
          },
          yAxis: {
            type: 'value',
            name: '人数',
            nameTextStyle: { color: CHART_TEXT.color, padding: [0, 0, 0, 0] },
            splitLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.1)' } },
            axisLabel: { color: CHART_TEXT.color },
          },
          series: [
            {
              type: 'bar',
              data: b.map((x) => x.cnt),
              barWidth: '52%',
              barMaxWidth: 72,
              itemStyle: {
                borderRadius: [6, 6, 0, 0],
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: '#67e8f9' },
                  { offset: 1, color: '#0284c7' },
                ]),
              },
              emphasis: {
                itemStyle: { shadowBlur: 12, shadowColor: 'rgba(56, 189, 248, 0.45)' },
              },
            },
          ],
        },
        true
      )
      chart.resize()
    }
  }

  if (hasGradingPie.value && pieRef.value) {
    const chart = getOrInit(pieRef.value)
    if (chart) {
      chart.setOption(
        {
          animation: true,
          color: ['#34d399', '#fb923c', '#64748b'],
          tooltip: { ...TOOLTIP, trigger: 'item' },
          legend: {
            bottom: 4,
            textStyle: { color: CHART_TEXT.color, fontSize: 11 },
            itemWidth: 10,
            itemHeight: 10,
          },
          series: [
            {
              type: 'pie',
              radius: ['42%', '68%'],
              center: ['50%', '46%'],
              avoidLabelOverlap: true,
              itemStyle: { borderRadius: 6, borderColor: '#0f172a', borderWidth: 2 },
              label: { color: '#cbd5e1', fontSize: 11 },
              data: gradingPieData.value,
            },
          ],
        },
        true
      )
      chart.resize()
    }
  }

  if (hasOverviewData.value && rankRef.value) {
    const chart = getOrInit(rankRef.value)
    if (chart) {
      const bars = buildCompletionBars(overview.value)
      chart.setOption(
        {
          animation: true,
          grid: { left: 100, right: 36, top: 16, bottom: 16 },
          tooltip: { ...TOOLTIP, trigger: 'axis', axisPointer: { type: 'shadow' } },
          xAxis: {
            type: 'value',
            max: 100,
            axisLabel: { formatter: '{value}%', color: CHART_TEXT.color },
            splitLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.1)' } },
          },
          yAxis: {
            type: 'category',
            data: bars.map((x) => x.name),
            axisLabel: { color: CHART_TEXT.color, fontSize: 11 },
            axisLine: { show: false },
            axisTick: { show: false },
          },
          series: [
            {
              type: 'bar',
              data: bars.map((x) => x.value),
              barWidth: 16,
              itemStyle: {
                borderRadius: [0, 6, 6, 0],
                color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                  { offset: 0, color: '#059669' },
                  { offset: 1, color: '#6ee7b7' },
                ]),
              },
              label: {
                show: true,
                position: 'right',
                formatter: '{c}%',
                color: '#a7f3d0',
                fontSize: 11,
              },
            },
          ],
        },
        true
      )
      chart.resize()
    }
  }

  if (hasWeakTagChart.value && weakTagRef.value) {
    const chart = getOrInit(weakTagRef.value)
    if (chart) {
      chart.setOption(
        {
          animation: true,
          color: ['#f97316', '#fb7185', '#a78bfa', '#38bdf8', '#34d399', '#fbbf24'],
          tooltip: { ...TOOLTIP, trigger: 'item' },
          legend: {
            orient: 'vertical',
            right: 8,
            top: 'center',
            textStyle: { color: CHART_TEXT.color, fontSize: 11 },
            itemWidth: 10,
            itemHeight: 10,
          },
          series: [
            {
              type: 'pie',
              radius: ['36%', '62%'],
              center: ['38%', '50%'],
              data: weakTagData.value,
              label: { show: false },
              emphasis: {
                label: { show: true, fontSize: 12, color: '#f1f5f9' },
              },
            },
          ],
        },
        true
      )
      chart.resize()
    }
  }
}

function scheduleRender() {
  requestAnimationFrame(() => {
    void renderCharts()
  })
}

watch(
  () => [props.data, props.loading, props.scopeReady],
  ([d, loading]) => {
    if (!loading && d) {
      lastUpdated.value = new Date().toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })
    }
    disposeCharts()
    scheduleRender()
  },
  { deep: true }
)

const onResize = () => {
  for (const c of charts) {
    if (c && !c.isDisposed()) c.resize()
  }
}

async function toggleFs() {
  const el = document.querySelector(props.layoutRootSelector)
  if (!el) return
  if (!document.fullscreenElement) {
    await el.requestFullscreen?.()
    isFs.value = true
  } else {
    await document.exitFullscreen?.()
    isFs.value = false
  }
  setTimeout(onResize, 120)
}

onMounted(() => {
  tickClock()
  clockTimer = setInterval(tickClock, 1000)
  window.addEventListener('resize', onResize)
  document.addEventListener('fullscreenchange', () => {
    isFs.value = Boolean(document.fullscreenElement)
    setTimeout(onResize, 120)
  })
  scheduleRender()
})

onBeforeUnmount(() => {
  if (clockTimer) clearInterval(clockTimer)
  window.removeEventListener('resize', onResize)
  disposeCharts()
})
</script>

<style scoped>
.bs-page {
  position: relative;
  min-height: calc(100vh - 120px);
  padding: 18px 22px 24px;
  background:
    radial-gradient(ellipse 120% 80% at 15% -15%, rgba(37, 99, 235, 0.22), transparent 55%),
    radial-gradient(ellipse 90% 60% at 100% 0%, rgba(6, 182, 212, 0.14), transparent 50%),
    linear-gradient(180deg, #070d18 0%, #0b1220 45%, #0a101c 100%);
  color: #e2e8f0;
  overflow: hidden;
  box-sizing: border-box;
}

.bs-page:fullscreen,
.bs-fullscreen {
  min-height: 100vh;
  padding: 22px 28px 28px;
}

.bs-grid-bg {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(56, 189, 248, 0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(56, 189, 248, 0.035) 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: radial-gradient(ellipse 90% 75% at 50% 35%, black 15%, transparent 78%);
  pointer-events: none;
}

.bs-header {
  position: relative;
  z-index: 2;
  display: grid;
  grid-template-columns: minmax(180px, 1fr) auto minmax(280px, 1fr);
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(56, 189, 248, 0.12);
}

.bs-title {
  margin: 0;
  font-size: 26px;
  font-weight: 800;
  letter-spacing: 0.04em;
  background: linear-gradient(120deg, #e0f2fe, #38bdf8);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.bs-subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  color: #64748b;
  font-weight: 500;
}

.bs-header__scope {
  justify-self: center;
  min-width: 240px;
}

.bs-header__scope :deep(.el-select) {
  width: 280px;
}

.bs-header__scope :deep(.el-input__wrapper) {
  background: rgba(15, 23, 42, 0.72);
  box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.25) inset;
  border-radius: 10px;
}

.bs-header__scope :deep(.el-input__inner) {
  color: #e2e8f0;
}

.bs-header__meta {
  justify-self: end;
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.meta-block {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 12px;
  background: rgba(15, 23, 42, 0.55);
  border: 1px solid rgba(148, 163, 184, 0.15);
  border-radius: 10px;
}

.meta-label {
  font-size: 10px;
  color: #64748b;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.meta-value {
  font-size: 13px;
  font-weight: 600;
  color: #cbd5e1;
  font-variant-numeric: tabular-nums;
}

.fs-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  border: 1px solid rgba(56, 189, 248, 0.45);
  border-radius: 10px;
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.35), rgba(6, 182, 212, 0.25));
  color: #e0f2fe;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: box-shadow 0.25s ease, border-color 0.25s ease, transform 0.2s ease;
}

.fs-btn:hover {
  border-color: rgba(56, 189, 248, 0.75);
  box-shadow: 0 0 20px rgba(56, 189, 248, 0.25);
  transform: translateY(-1px);
}

.fs-btn--active {
  background: linear-gradient(135deg, rgba(249, 115, 22, 0.35), rgba(239, 68, 68, 0.25));
  border-color: rgba(251, 146, 60, 0.55);
  color: #ffedd5;
}

.kpi-grid {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 16px;
}

.kpi-card {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 96px;
  padding: 16px 14px;
  background: rgba(15, 23, 42, 0.72);
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.22);
  opacity: 0;
  transform: translateY(8px);
}

.bs-ready .kpi-card {
  animation: bs-kpi-in 0.55s var(--sg-ease-out, cubic-bezier(0.22, 1, 0.36, 1)) forwards;
}

@keyframes bs-kpi-in {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.kpi-card__icon {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: rgba(56, 189, 248, 0.12);
  color: #38bdf8;
}

.kpi-card--cyan .kpi-card__icon { background: rgba(6, 182, 212, 0.12); color: #22d3ee; }
.kpi-card--green .kpi-card__icon { background: rgba(52, 211, 153, 0.12); color: #34d399; }
.kpi-card--teal .kpi-card__icon { background: rgba(20, 184, 166, 0.12); color: #2dd4bf; }
.kpi-card--purple .kpi-card__icon { background: rgba(167, 139, 250, 0.12); color: #a78bfa; }
.kpi-card--gold .kpi-card__icon { background: rgba(251, 191, 36, 0.12); color: #fbbf24; }

.kpi-card__body {
  min-width: 0;
  flex: 1;
}

.kpi-card__val {
  display: block;
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.1;
  color: #f1f5f9;
  font-variant-numeric: tabular-nums;
}

.kpi-card--blue .kpi-card__val { color: #7dd3fc; }
.kpi-card--green .kpi-card__val { color: #6ee7b7; }
.kpi-card--purple .kpi-card__val { color: #c4b5fd; }
.kpi-card--gold .kpi-card__val { color: #fcd34d; }

.kpi-card__lab {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: #64748b;
  font-weight: 500;
}

.kpi-card__sub {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  color: #fb923c;
}

.row-2 {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: 1.35fr 1fr;
  gap: 14px;
  margin-bottom: 14px;
}

.row-3 {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.panel {
  background: rgba(15, 23, 42, 0.72);
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 16px;
  padding: 16px 18px 14px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  opacity: 0;
  animation: bs-panel-in 0.5s var(--sg-ease-out, cubic-bezier(0.22, 1, 0.36, 1)) 0.1s forwards;
}

@keyframes bs-panel-in {
  to { opacity: 1; }
}

.panel__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.panel__head h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #f1f5f9;
}

.panel__hint {
  font-size: 11px;
  color: #475569;
  white-space: nowrap;
}

.chart {
  height: 280px;
  width: 100%;
}

.chart--short {
  height: 220px;
}

.chart--empty {
  display: flex;
  align-items: center;
  justify-content: center;
}

.chart--empty :deep(.el-empty__description) {
  color: #64748b;
}

.weak-list {
  list-style: none;
  margin: 0;
  padding: 0 2px 0 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 280px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(56, 189, 248, 0.22) transparent;
}

.weak-list::-webkit-scrollbar {
  width: 4px;
}

.weak-list::-webkit-scrollbar-track {
  background: transparent;
}

.weak-list::-webkit-scrollbar-thumb {
  background: rgba(56, 189, 248, 0.18);
  border-radius: 4px;
}

.weak-list:hover::-webkit-scrollbar-thumb {
  background: rgba(56, 189, 248, 0.38);
}

.weak-list::-webkit-scrollbar-button,
.weak-list::-webkit-scrollbar-corner {
  display: none;
  width: 0;
  height: 0;
}

.weak-item {
  display: grid;
  grid-template-columns: 28px 1fr auto;
  gap: 10px;
  align-items: start;
  padding: 10px 12px;
  background: rgba(30, 41, 59, 0.55);
  border: 1px solid rgba(148, 163, 184, 0.12);
  border-radius: 12px;
}

.weak-rank {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
  font-size: 12px;
  font-weight: 700;
}

.weak-item:nth-child(1) .weak-rank {
  background: rgba(249, 115, 22, 0.2);
  color: #fb923c;
}

.weak-tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  background: rgba(6, 182, 212, 0.15);
  color: #22d3ee;
  margin-bottom: 4px;
}

.weak-desc {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: #94a3b8;
}

.weak-count {
  font-size: 12px;
  font-weight: 600;
  color: #f87171;
  white-space: nowrap;
  padding-top: 2px;
}

.ai-summary {
  min-height: 220px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 8px 4px;
}

.ai-summary__title {
  margin: 0 0 12px;
  font-size: 13px;
  font-weight: 600;
  color: #94a3b8;
}

.ai-summary__text {
  margin: 0;
  font-size: 13px;
  line-height: 1.75;
  color: #cbd5e1;
}

.bs-loading,
.bs-no-scope {
  position: relative;
  z-index: 1;
  padding: 24px 0;
}

@media (max-width: 1400px) {
  .kpi-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .row-2 {
    grid-template-columns: 1fr;
  }
  .row-3 {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 900px) {
  .bs-header {
    grid-template-columns: 1fr;
  }
  .bs-header__scope,
  .bs-header__meta {
    justify-self: stretch;
  }
  .kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (prefers-reduced-motion: reduce) {
  .kpi-card,
  .bs-ready .kpi-card,
  .panel {
    animation: none !important;
    opacity: 1;
    transform: none;
  }
}
</style>
