<template>
  <div class="bs-page" :class="{ 'bs-ready': vizReady, 'bs-page--fs': isFs }">
    <header class="bs-head">
      <div class="bs-head__main">
        <h1 class="bs-head__title">我的班级学情看板</h1>
        <p class="bs-head__sub">
          查看所在班级的实训进度、成绩分布与共性薄弱点，帮助了解个人学习位置与改进方向。
        </p>
        <div class="bs-head__meta">
          <span class="meta-chip">当前班级：{{ currentScopeLabel }}</span>
          <span class="meta-chip">数据更新：{{ updatedAtText }}</span>
          <span class="meta-chip meta-chip--privacy">数据范围：仅展示本人所在班级的匿名汇总数据</span>
        </div>
      </div>
      <div class="bs-head__actions">
        <el-select
          v-if="scopeOptions.length > 1"
          v-model="scopeKey"
          size="default"
          class="scope-select"
          placement="bottom-end"
          :teleported="!isFs"
          popper-class="bs-scope-popper"
          @change="load"
        >
          <el-option v-for="o in scopeOptions" :key="o.key" :label="o.label" :value="o.key" />
        </el-select>
        <el-button type="primary" plain @click="toggleFs">
          {{ isFs ? '退出展示模式' : '全屏 / 展示模式' }}
        </el-button>
      </div>
    </header>

    <div class="bs-scroll">
    <el-skeleton v-if="loading && !hasData" :rows="6" animated class="bs-skeleton" />

    <div v-else-if="!hasData" class="bs-empty">
      <el-empty :image-size="96">
        <template #description>
          <h3 class="bs-empty__title">暂无班级学情数据</h3>
          <p class="bs-empty__desc">
            完成实训任务并通过批改后，系统会生成班级匿名汇总、成绩分布与共性薄弱点分析。
          </p>
        </template>
        <el-button type="primary" @click="router.push('/student/tasks')">去实训中心</el-button>
      </el-empty>
    </div>

    <template v-else>
      <el-alert
        v-if="smallSample"
        type="warning"
        show-icon
        :closable="false"
        title="班级有效样本较少（少于 5 人），以下数据仅作参考，不展示个人精确位置与排名。"
        class="bs-alert"
      />

      <section class="kpi-section">
        <h2 class="section-title">我的学习概况</h2>
        <el-row :gutter="14" class="kpis">
          <el-col v-for="k in kpiItems" :key="k.key" :xs="12" :sm="8" :md="4">
            <div class="kpi" :class="`kpi--${k.tone}`">
              <span class="kpi-val">{{ k.value }}</span>
              <span class="kpi-lab">{{ k.label }}</span>
            </div>
          </el-col>
        </el-row>
      </section>

      <section class="overview-section">
        <h2 class="section-title">班级实训概览</h2>
        <div class="overview-grid">
          <div v-for="item in classOverviewItems" :key="item.label" class="overview-item">
            <span class="overview-item__val">{{ item.value }}</span>
            <span class="overview-item__lab">{{ item.label }}</span>
          </div>
        </div>
        <p class="overview-note">以上均为班级聚合值，不包含任何同学个人信息。</p>
      </section>

      <el-row :gutter="16" class="charts-row">
        <el-col :xs="24" :lg="14">
          <div class="panel">
            <div class="panel__head">
              <h3 class="panel__title">班级成绩分布</h3>
              <span v-if="smallSample" class="panel__hint">样本较少，分布仅供参考</span>
            </div>
            <div v-if="hasChartData" ref="barRef" class="chart" />
            <div v-else class="chart chart--empty">
              <el-empty
                description="暂无分数分布（需存在已批改记录）"
                :image-size="56"
              />
            </div>
          </div>
        </el-col>
        <el-col :xs="24" :lg="10">
          <div class="panel">
            <h3 class="panel__title">班级共性薄弱点</h3>
            <p class="panel__desc">由班级批改反馈归纳的匿名标签，不展示原始评语。</p>
            <ul v-if="weakTags.length" class="weak-tags">
              <li v-for="(w, i) in weakTags" :key="i" class="weak-tag">
                <span class="weak-tag__label">{{ w.tag }}</span>
                <span class="weak-tag__meta">出现 {{ w.count }} 次 · 约 {{ w.pct }}%</span>
              </li>
            </ul>
            <el-empty
              v-else
              description="暂无共性薄弱点数据"
              :image-size="48"
            />
          </div>
        </el-col>
      </el-row>

      <section class="panel suggest-panel">
        <h3 class="panel__title">我的下一步建议</h3>
        <ul class="suggest-list">
          <li v-for="(tip, i) in learningTips" :key="i">{{ tip }}</li>
        </ul>
        <div class="suggest-links">
          <el-button
            v-for="link in navLinks"
            :key="link.path"
            size="small"
            plain
            type="primary"
            @click="router.push(link.path)"
          >
            {{ link.label }}
          </el-button>
        </div>
      </section>
    </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, onActivated, onDeactivated, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { getBigScreenStats } from '../../api/dashboard'
import { listTeachingClasses } from '../../api/teachingClass'
import { getTasksByClass, getTasksByTeachingClass } from '../../api/task'
import { getMyArchive } from '../../api/user'
import { useUserStore } from '../../stores/user'
import { ensureChartInstance, disposeChartInstance, createChartRenderScheduler } from '../../utils/echartsInstance'
import {
  normalizeScoreBuckets,
  aggregateClassWeakTags,
  isSmallSample,
  buildStudentKpis,
  buildClassOverviewItems,
  buildLearningSuggestions,
  computePersonalInScope,
  scoreBucketForValue,
  formatUpdatedAt,
  STUDENT_BS_NAV_LINKS,
} from '../../utils/studentBigScreenDisplay'

const router = useRouter()
const userStore = useUserStore()
const loading = ref(true)
const data = ref(null)
const archiveRows = ref([])
const taskIdsInScope = ref([])
const scopeKey = ref('legacy')
const teachingClasses = ref([])
const updatedAtText = ref('—')
const barRef = ref(null)
let chart = null
const isFs = ref(false)

const scopeOptions = computed(() => {
  const opts = []
  if (userStore.user?.classId) {
    opts.push({
      key: 'legacy',
      label: `行政班 · ${userStore.user.className || userStore.user.class_name || userStore.user.classId}`,
    })
  }
  for (const tc of teachingClasses.value) {
    opts.push({
      key: `tc-${tc.id}`,
      label: `教学班 · ${[tc.class_name, tc.course_name].filter(Boolean).join(' ')}`,
    })
  }
  return opts
})

const currentScopeLabel = computed(() => {
  const hit = scopeOptions.value.find((o) => o.key === scopeKey.value)
  return hit?.label || '—'
})

function bigScreenParams() {
  if (scopeKey.value.startsWith('tc-')) {
    return { teachingClassId: Number(scopeKey.value.replace('tc-', '')) }
  }
  return { classId: userStore.user?.classId }
}

const hasData = computed(() => !!(data.value && !data.value.empty))
const overview = computed(() => data.value?.overview || {})
const smallSample = computed(() => isSmallSample(overview.value))
const personal = computed(() => computePersonalInScope(archiveRows.value, taskIdsInScope.value))
const kpiItems = computed(() => buildStudentKpis(overview.value, personal.value))
const classOverviewItems = computed(() => buildClassOverviewItems(overview.value))
const weakTags = computed(() => aggregateClassWeakTags(data.value?.weakHints, 5))
const learningTips = computed(() =>
  buildLearningSuggestions({
    myAvg: personal.value.myAvg,
    classAvg: overview.value.avgScore != null ? Number(overview.value.avgScore) : null,
    weakTags: weakTags.value,
    smallSample: smallSample.value,
  })
)
const navLinks = STUDENT_BS_NAV_LINKS
const normalizedBuckets = computed(() => normalizeScoreBuckets(data.value?.scoreBuckets))
const hasChartData = computed(() => normalizedBuckets.value.some((b) => b.cnt > 0))
const vizReady = computed(() => !loading.value && hasData.value)

const myBucket = computed(() => {
  if (smallSample.value) return null
  return scoreBucketForValue(personal.value.myAvg)
})

function disposeChart() {
  chart = disposeChartInstance(chart)
}

const renderChartImpl = async () => {
  await nextTick()
  if (loading.value && !hasData.value) {
    disposeChart()
    return
  }
  if (!hasChartData.value) {
    disposeChart()
    return
  }
  const dom = barRef.value
  if (!dom) return
  if (dom.clientWidth === 0 || dom.clientHeight === 0) {
    requestAnimationFrame(() => scheduleRenderChart())
    return
  }

  chart = ensureChartInstance(dom, chart)
  if (!chart) return

  const buckets = normalizedBuckets.value
  const highlight = myBucket.value

  chart.setOption(
    {
      animation: true,
      animationDuration: 480,
      color: ['#38bdf8'],
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(15, 23, 42, 0.94)',
        borderColor: 'rgba(148, 163, 184, 0.35)',
        textStyle: { color: '#e2e8f0' },
        formatter(params) {
          const p = params?.[0]
          if (!p) return ''
          const suffix = highlight && p.name === highlight ? '（我的大致区间）' : ''
          return `${p.name}：${p.value} 人${suffix}`
        },
      },
      grid: { left: 44, right: 16, bottom: 36, top: 24 },
      xAxis: {
        type: 'category',
        data: buckets.map((x) => x.bucket),
        axisLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.35)' } },
        axisLabel: { color: '#94a3b8' },
      },
      yAxis: {
        type: 'value',
        name: '人数',
        minInterval: 1,
        nameTextStyle: { color: '#94a3b8' },
        splitLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.1)' } },
        axisLabel: { color: '#94a3b8' },
      },
      series: [
        {
          type: 'bar',
          data: buckets.map((x) => ({
            value: x.cnt,
            itemStyle: {
              color: highlight && x.bucket === highlight ? '#22c55e' : '#38bdf8',
              borderRadius: [6, 6, 0, 0],
            },
          })),
          barMaxWidth: 44,
        },
      ],
    },
    { notMerge: false, lazyUpdate: true }
  )
  chart.resize()
}

const scheduleRenderChart = createChartRenderScheduler(() => {
  void renderChartImpl()
})

const renderChart = () => {
  scheduleRenderChart()
}

async function loadTasksInScope() {
  if (scopeKey.value.startsWith('tc-')) {
    const tcId = Number(scopeKey.value.replace('tc-', ''))
    const res = await getTasksByTeachingClass(tcId)
    if (res.success) {
      taskIdsInScope.value = (res.data || []).map((t) => Number(t.id))
    } else {
      taskIdsInScope.value = []
    }
    return
  }
  const cid = userStore.user?.classId
  if (!cid) {
    taskIdsInScope.value = []
    return
  }
  const res = await getTasksByClass(cid)
  if (res.success) {
    taskIdsInScope.value = (res.data || []).map((t) => Number(t.id))
  } else {
    taskIdsInScope.value = []
  }
}

const load = async () => {
  const firstLoad = !data.value
  if (firstLoad) loading.value = true
  try {
    await loadTasksInScope()
    const [bsRes, arRes] = await Promise.all([
      getBigScreenStats(bigScreenParams()),
      getMyArchive(),
    ])
    if (bsRes.success) data.value = bsRes.data
    if (arRes.success) archiveRows.value = arRes.data || []
    updatedAtText.value = formatUpdatedAt(new Date())
  } finally {
    loading.value = false
    renderChart()
  }
}

const onResize = () => {
  if (chart && !chart.isDisposed()) chart.resize()
}

const onFullscreenChange = () => {
  isFs.value = Boolean(document.fullscreenElement)
  onResize()
}

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

onMounted(async () => {
  await userStore.fetchUserInfo()
  const tcRes = await listTeachingClasses()
  if (tcRes.success) teachingClasses.value = tcRes.data || []
  if (!userStore.user?.classId && teachingClasses.value.length) {
    scopeKey.value = `tc-${teachingClasses.value[0].id}`
  }
  await load()
  window.addEventListener('resize', onResize, { passive: true })
  document.addEventListener('fullscreenchange', onFullscreenChange)
})

onActivated(() => {
  if (chart && !chart.isDisposed()) {
    chart.resize()
  } else if (hasChartData.value) {
    renderChart()
  }
})

onDeactivated(() => {
  /* 保留实例，避免 keep-alive 往返重复 init */
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  disposeChart()
})
</script>

<style scoped>
.bs-page {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: calc(100vh - 120px);
  padding: 18px 20px 0;
  background: #0b1220;
  color: #e2e8f0;
  box-sizing: border-box;
}

.bs-page--fs {
  height: 100vh;
  min-height: 100vh;
  max-height: 100vh;
  padding: 20px 24px 0;
  overflow: hidden;
}

.bs-scroll {
  flex: 1;
  min-height: 0;
  padding-bottom: 16px;
}

.bs-page--fs .bs-scroll {
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 20px;
  scrollbar-width: thin;
  scrollbar-color: rgba(148, 163, 184, 0.22) transparent;
}

.bs-page--fs .bs-scroll::-webkit-scrollbar {
  width: 6px;
}

.bs-page--fs .bs-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.bs-page--fs .bs-scroll::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.2);
  border-radius: 999px;
}

.bs-page--fs .bs-scroll:hover::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.38);
}

.bs-page--fs .bs-scroll::-webkit-scrollbar-button,
.bs-page--fs .bs-scroll::-webkit-scrollbar-corner {
  display: none;
  width: 0;
  height: 0;
}

.bs-page:not(.bs-page--fs) .bs-scroll {
  flex: none;
  padding-bottom: 8px;
}

.bs-page:not(.bs-page--fs) {
  padding-bottom: 20px;
}

.bs-head {
  position: relative;
  z-index: 2;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 20px;
  flex-shrink: 0;
}

.bs-head__title {
  margin: 0 0 8px;
  font-size: 22px;
  font-weight: 700;
  color: #f8fafc;
  letter-spacing: -0.02em;
}

.bs-head__sub {
  margin: 0 0 12px;
  font-size: 14px;
  line-height: 1.6;
  color: #94a3b8;
  max-width: 640px;
}

.bs-head__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.meta-chip {
  display: inline-block;
  padding: 4px 10px;
  font-size: 12px;
  color: #cbd5e1;
  background: rgba(30, 41, 59, 0.85);
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 999px;
}

.meta-chip--privacy {
  color: #7dd3fc;
  border-color: rgba(56, 189, 248, 0.35);
}

.bs-head__actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
  flex-shrink: 0;
}

.scope-select {
  width: min(100%, 360px);
}

.scope-select :deep(.el-input__wrapper) {
  background: rgba(20, 30, 48, 0.95);
  box-shadow: 0 0 0 1px rgba(148, 163, 184, 0.25) inset;
}

.bs-alert {
  margin-bottom: 16px;
  background: rgba(245, 158, 11, 0.08);
  border-color: rgba(245, 158, 11, 0.35);
}

.section-title {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 600;
  color: #94a3b8;
  letter-spacing: 0.04em;
}

.kpi-section {
  margin-bottom: 18px;
}

.kpis {
  margin-bottom: 4px;
}

.kpi {
  background: #141e30;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 12px;
  padding: 16px 12px;
  text-align: center;
  margin-bottom: 12px;
  opacity: 0;
  transform: translateY(8px);
}

.bs-ready .kpi {
  animation: bs-in 0.45s ease forwards;
}

.bs-ready .kpis :deep(.el-col:nth-child(1) .kpi) { animation-delay: 0.04s; }
.bs-ready .kpis :deep(.el-col:nth-child(2) .kpi) { animation-delay: 0.08s; }
.bs-ready .kpis :deep(.el-col:nth-child(3) .kpi) { animation-delay: 0.12s; }
.bs-ready .kpis :deep(.el-col:nth-child(4) .kpi) { animation-delay: 0.16s; }
.bs-ready .kpis :deep(.el-col:nth-child(5) .kpi) { animation-delay: 0.2s; }
.bs-ready .kpis :deep(.el-col:nth-child(6) .kpi) { animation-delay: 0.24s; }

.kpi-val {
  display: block;
  font-size: 22px;
  font-weight: 800;
  color: #38bdf8;
}

.kpi--green .kpi-val { color: #4ade80; }
.kpi--orange .kpi-val { color: #fb923c; }
.kpi--cyan .kpi-val { color: #22d3ee; }
.kpi--muted .kpi-val { color: #94a3b8; }

.kpi-lab {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  color: #94a3b8;
}

.overview-section {
  margin-bottom: 18px;
}

.overview-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.overview-item {
  background: #141e30;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 12px;
  padding: 14px;
  text-align: center;
}

.overview-item__val {
  display: block;
  font-size: 20px;
  font-weight: 700;
  color: #e2e8f0;
}

.overview-item__lab {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: #94a3b8;
}

.overview-note {
  margin: 10px 0 0;
  font-size: 12px;
  color: #64748b;
}

.charts-row {
  margin-bottom: 16px;
}

.panel {
  background: #141e30;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 14px;
  padding: 16px 16px 18px;
  min-height: 300px;
  margin-bottom: 16px;
}

.panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}

.panel__title {
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 600;
  color: #f1f5f9;
}

.panel__head .panel__title {
  margin-bottom: 0;
}

.panel__hint {
  font-size: 12px;
  color: #fbbf24;
}

.panel__desc {
  margin: 0 0 12px;
  font-size: 12px;
  color: #64748b;
  line-height: 1.5;
}

.chart {
  height: 280px;
  width: 100%;
}

.chart--empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 240px;
}

.weak-tags {
  list-style: none;
  margin: 0;
  padding: 0;
}

.weak-tag {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  margin-bottom: 8px;
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.15);
  border-radius: 10px;
}

.weak-tag__label {
  font-size: 13px;
  font-weight: 600;
  color: #e2e8f0;
}

.weak-tag__meta {
  font-size: 11px;
  color: #94a3b8;
  white-space: nowrap;
}

.suggest-panel {
  min-height: auto;
}

.suggest-list {
  margin: 0 0 14px;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.75;
  color: #cbd5e1;
}

.suggest-links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.bs-empty {
  padding: 48px 16px;
}

.bs-empty__title {
  margin: 0 0 8px;
  font-size: 16px;
  color: #e2e8f0;
}

.bs-empty__desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: #94a3b8;
  max-width: 420px;
}

@keyframes bs-in {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 992px) {
  .overview-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .overview-grid {
    grid-template-columns: 1fr 1fr;
  }

  .weak-tag {
    flex-direction: column;
    align-items: flex-start;
  }
}

@media (prefers-reduced-motion: reduce) {
  .kpi,
  .bs-ready .kpi {
    animation: none !important;
    opacity: 1;
    transform: none;
  }
}
</style>

<style>
/* 顶部班级选择下拉（全屏时 teleported=false，需全局 popper 样式） */
.bs-scope-popper.el-popper {
  z-index: 100001 !important;
}
</style>
