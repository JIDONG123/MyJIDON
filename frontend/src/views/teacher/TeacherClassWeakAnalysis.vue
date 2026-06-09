<template>
  <div class="analytics-workbench">
    <header class="workbench-head">
      <div class="workbench-head__main">
        <h1 class="workbench-title">能力画像 / 薄弱点</h1>
        <p class="workbench-subtitle">
          基于本班批改结果与 AI 分析，汇总能力维度表现与高频问题
        </p>
      </div>
      <div class="workbench-head__actions">
        <el-select
          v-model="selectedClassId"
          filterable
          placeholder="选择行政班"
          class="class-select"
          :loading="classesLoading"
          @change="loadWeak"
        >
          <el-option v-for="c in classes" :key="c.id" :label="classLabel(c)" :value="c.id" />
        </el-select>
      </div>
    </header>

    <el-alert
      v-if="!classesLoading && !classes.length"
      type="warning"
      show-icon
      :closable="false"
      title="暂无负责班级，请联系管理员分配行政班。"
      class="alert-block"
    />

    <template v-else-if="selectedClassId">
      <div
        v-if="!loading"
        class="diagnosis-strip"
        :class="{ 'diagnosis-strip--empty': !diagnosis.hasData }"
      >
        <el-icon class="diagnosis-strip__icon"><InfoFilled /></el-icon>
        <p class="diagnosis-strip__text">{{ diagnosis.text }}</p>
      </div>

      <section class="metric-grid">
        <div v-for="card in metricCards" :key="card.key" class="metric-card">
          <div class="metric-card__icon" :class="`metric-card__icon--${card.tone}`">
            <el-icon><component :is="card.icon" /></el-icon>
          </div>
          <div class="metric-card__body">
            <span class="metric-card__value">{{ card.value }}</span>
            <span class="metric-card__label">{{ card.label }}</span>
          </div>
        </div>
      </section>

      <section v-loading="loading" class="analysis-row">
        <div class="panel">
          <div class="panel__header">
            <h2 class="panel__title">薄弱评价维度</h2>
            <span class="panel__meta">低分占比 ≥ 25%</span>
          </div>
          <div v-if="hasDims" ref="barRef" class="chart" />
          <div v-else class="chart chart--empty">
            <el-empty description="样本较少或尚无批改记录" :image-size="64">
              <template #description>
                <p class="empty-inline__title">暂无维度分析</p>
                <p class="empty-inline__desc">完成批改后将自动生成统计</p>
              </template>
            </el-empty>
          </div>
        </div>

        <div class="panel">
          <div class="panel__header">
            <h2 class="panel__title">典型问题摘要</h2>
            <span class="panel__meta">Top {{ Math.min(5, problemCards.length) || 5 }}</span>
          </div>
          <ul v-if="problemCards.length" class="problem-cards">
            <li v-for="(item, i) in problemCards" :key="i" class="problem-card">
              <div class="problem-card__head">
                <span class="problem-card__rank">{{ i + 1 }}</span>
                <el-tag size="small" effect="plain">{{ item.tag }}</el-tag>
                <span v-if="item.count > 1" class="problem-card__count">{{ item.count }} 次</span>
              </div>
              <p class="problem-card__desc">{{ item.desc }}</p>
              <p class="problem-card__tip">
                <el-icon><Promotion /></el-icon>
                {{ item.suggestion }}
              </p>
            </li>
          </ul>
          <div v-else class="chart chart--empty chart--short">
            <el-empty description="暂无问题摘要" :image-size="56" />
          </div>
        </div>
      </section>

      <section v-if="hasDims" v-loading="loading" class="panel panel--radar">
        <div class="panel__header">
          <h2 class="panel__title">能力维度总览</h2>
          <span class="panel__meta">得分率 = 100% − 低分占比</span>
        </div>
        <div ref="radarRef" class="chart chart--radar" />
      </section>

      <div class="panel panel--table">
        <div class="panel__header">
          <div>
            <h2 class="panel__title">维度诊断明细</h2>
            <span class="panel__meta">共 {{ dimensionRows.length }} 个需关注维度</span>
          </div>
        </div>
        <el-table
          v-loading="loading"
          :data="dimensionRows"
          border
          stripe
          class="detail-table"
          :default-sort="{ prop: 'lowRate', order: 'descending' }"
        >
          <template #empty>
            <div class="table-empty">
              <p>暂无维度明细</p>
              <span>批改数据积累后将生成诊断报告</span>
            </div>
          </template>
          <el-table-column prop="name" label="评价维度" min-width="120" />
          <el-table-column prop="lowRate" label="低分占比" width="110" align="center" sortable>
            <template #default="{ row }">
              <span :class="lowRateClass(row.lowRate)">{{ row.lowRate }}%</span>
            </template>
          </el-table-column>
          <el-table-column prop="sample" label="样本数" width="90" align="center" />
          <el-table-column prop="topProblem" label="高频问题" min-width="200" show-overflow-tooltip />
          <el-table-column prop="advice" label="教学建议" min-width="240" show-overflow-tooltip />
        </el-table>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import * as echarts from 'echarts'
import { Document, DataAnalysis, Warning, ChatLineRound, View, InfoFilled, Promotion } from '@element-plus/icons-vue'
import { getMyTeachingOverview } from '../../api/class'
import { getClassWeak } from '../../api/analytics'
import {
  buildWeakKpis,
  buildDiagnosisSummary,
  buildProblemCards,
  buildDimensionRows,
  buildRadarSeries,
} from '../../utils/weakAnalysisData'

const classes = ref([])
const classesLoading = ref(true)
const selectedClassId = ref(null)
const loading = ref(false)
const weakData = ref(null)
const barRef = ref(null)
const radarRef = ref(null)
const charts = []

const hasDims = computed(() => (weakData.value?.weakDimensions?.length || 0) > 0)
const diagnosis = computed(() => buildDiagnosisSummary(weakData.value))
const kpis = computed(() => buildWeakKpis(weakData.value))
const problemCards = computed(() => buildProblemCards(weakData.value?.problemSamples, 5))
const dimensionRows = computed(() => buildDimensionRows(weakData.value))
const radarMeta = computed(() => buildRadarSeries(weakData.value?.weakDimensions))

const metricCards = computed(() => [
  { key: 'sample', label: '样本作业数', value: kpis.value.sampleCount || '—', icon: Document, tone: 'blue' },
  { key: 'avg', label: '平均得分', value: kpis.value.avgScore ?? '—', icon: DataAnalysis, tone: 'slate' },
  { key: 'weak', label: '薄弱维度数', value: kpis.value.weakDimCount, icon: Warning, tone: 'orange' },
  { key: 'problem', label: '高频问题数', value: kpis.value.problemCount, icon: ChatLineRound, tone: 'green' },
  { key: 'attention', label: '需关注项', value: kpis.value.attentionCount, icon: View, tone: 'red' },
])

const classLabel = (c) => {
  const parts = [c.class_name, c.major, c.grade].filter(Boolean)
  return parts.length ? parts.join(' · ') : `班级 ${c.id}`
}

function lowRateClass(rate) {
  const r = Number(rate) || 0
  if (r >= 50) return 'rate rate--high'
  if (r >= 35) return 'rate rate--mid'
  return 'rate'
}

function barColor(rate) {
  const r = Number(rate) || 0
  if (r >= 50) return '#ea580c'
  if (r >= 35) return '#2563eb'
  return '#059669'
}

function disposeCharts() {
  for (const c of charts) {
    if (c && !c.isDisposed()) c.dispose()
  }
  charts.length = 0
}

function getChart(dom) {
  if (!dom || dom.clientWidth === 0) return null
  let inst = echarts.getInstanceByDom(dom)
  if (inst && !inst.isDisposed()) return inst
  inst = echarts.init(dom)
  charts.push(inst)
  return inst
}

const TOOLTIP = {
  backgroundColor: 'rgba(255,255,255,0.96)',
  borderColor: '#e2e8f0',
  textStyle: { color: '#334155' },
}

async function renderCharts() {
  await nextTick()
  if (loading.value) return

  const dims = weakData.value?.weakDimensions || []
  if (barRef.value && dims.length) {
    const chart = getChart(barRef.value)
    if (chart) {
      chart.setOption(
        {
          tooltip: {
            ...TOOLTIP,
            trigger: 'axis',
            formatter(params) {
              const p = params[0]
              const d = dims[p.dataIndex]
              return `${d.name}<br/>低分占比 ${p.value}% · 样本 ${d.sample}`
            },
          },
          grid: { left: 48, right: 24, bottom: 56, top: 32 },
          xAxis: {
            type: 'category',
            data: dims.map((d) => d.name),
            axisLabel: { rotate: dims.length > 4 ? 24 : 0, color: '#64748b', fontSize: 11 },
            axisLine: { lineStyle: { color: '#e2e8f0' } },
          },
          yAxis: {
            type: 'value',
            name: '低分占比 %',
            max: 100,
            nameTextStyle: { color: '#94a3b8' },
            splitLine: { lineStyle: { color: '#f1f5f9' } },
            axisLabel: { color: '#64748b' },
          },
          series: [
            {
              type: 'bar',
              data: dims.map((d) => ({
                value: d.lowRate,
                itemStyle: { color: barColor(d.lowRate), borderRadius: [6, 6, 0, 0] },
              })),
              barMaxWidth: 48,
              label: { show: true, position: 'top', formatter: '{c}%', color: '#64748b', fontSize: 11 },
            },
          ],
        },
        true
      )
      chart.resize()
    }
  }

  const radar = radarMeta.value
  if (radarRef.value && radar.indicators.length) {
    const chart = getChart(radarRef.value)
    if (chart) {
      chart.setOption(
        {
          tooltip: { ...TOOLTIP },
          radar: {
            indicator: radar.indicators,
            radius: '62%',
            splitNumber: radar.splitNumber,
            axisName: { color: '#64748b', fontSize: 11 },
            splitLine: { lineStyle: { color: '#e2e8f0' } },
            splitArea: { areaStyle: { color: ['#fff', '#f8fafc'] } },
          },
          series: [
            {
              type: 'radar',
              data: [{ value: radar.values, name: '能力得分率', areaStyle: { color: 'rgba(37,99,235,0.15)' } }],
              itemStyle: { color: '#2563eb' },
              lineStyle: { width: 2, color: '#2563eb' },
            },
          ],
        },
        true
      )
      chart.resize()
    }
  }
}

async function loadClasses() {
  classesLoading.value = true
  try {
    const res = await getMyTeachingOverview()
    if (res.success) {
      classes.value = res.data || []
      if (!selectedClassId.value && classes.value.length) {
        selectedClassId.value = classes.value[0].id
      }
    }
  } finally {
    classesLoading.value = false
  }
}

async function loadWeak() {
  if (!selectedClassId.value) return
  loading.value = true
  disposeCharts()
  try {
    const res = await getClassWeak(selectedClassId.value)
    if (res.success) weakData.value = res.data
    else weakData.value = null
  } catch {
    weakData.value = null
  } finally {
    loading.value = false
    await renderCharts()
  }
}

watch(weakData, () => {
  disposeCharts()
  requestAnimationFrame(() => void renderCharts())
})

const onResize = () => {
  for (const c of charts) {
    if (c && !c.isDisposed()) c.resize()
  }
}

onMounted(async () => {
  await loadClasses()
  if (selectedClassId.value) await loadWeak()
  window.addEventListener('resize', onResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  disposeCharts()
})
</script>

<style scoped>
.analytics-workbench {
  max-width: 1280px;
  margin: 0 auto;
  padding-bottom: 32px;
}

.workbench-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.workbench-title {
  margin: 0 0 8px;
  font-size: 24px;
  font-weight: 700;
  color: #0f172a;
}

.workbench-subtitle {
  margin: 0;
  max-width: 640px;
  font-size: 14px;
  line-height: 1.65;
  color: #64748b;
}

.class-select {
  width: min(280px, 100%);
}

.alert-block {
  margin-bottom: 16px;
}

.diagnosis-strip {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 16px;
  margin-bottom: 16px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 12px;
}

.diagnosis-strip--empty {
  background: #f8fafc;
  border-color: #e2e8f0;
}

.diagnosis-strip__icon {
  flex-shrink: 0;
  margin-top: 2px;
  color: #2563eb;
  font-size: 16px;
}

.diagnosis-strip--empty .diagnosis-strip__icon {
  color: #94a3b8;
}

.diagnosis-strip__text {
  margin: 0;
  font-size: 13px;
  line-height: 1.65;
  color: #334155;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 18px;
}

.metric-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px 18px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
}

.metric-card__icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
}

.metric-card__icon--blue { background: #eff6ff; color: #2563eb; }
.metric-card__icon--slate { background: #f1f5f9; color: #475569; }
.metric-card__icon--orange { background: #fff7ed; color: #ea580c; }
.metric-card__icon--green { background: #ecfdf5; color: #059669; }
.metric-card__icon--red { background: #fef2f2; color: #dc2626; }

.metric-card__value {
  display: block;
  font-size: 26px;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.1;
}

.metric-card__label {
  display: block;
  font-size: 13px;
  color: #64748b;
  margin-top: 4px;
}

.analysis-row {
  display: grid;
  grid-template-columns: 1.25fr 1fr;
  gap: 14px;
  margin-bottom: 14px;
}

.panel {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 16px 18px 14px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
}

.panel--radar {
  margin-bottom: 14px;
}

.panel--table {
  margin-top: 0;
}

.panel__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
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

.chart {
  height: 320px;
  width: 100%;
}

.chart--short {
  height: 280px;
}

.chart--radar {
  height: 280px;
}

.chart--empty {
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-inline__title {
  margin: 0 0 4px;
  font-size: 14px;
  font-weight: 600;
  color: #475569;
}

.empty-inline__desc {
  margin: 0;
  font-size: 12px;
  color: #94a3b8;
}

.problem-cards {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 320px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(37, 99, 235, 0.2) transparent;
}

.problem-cards::-webkit-scrollbar {
  width: 4px;
}

.problem-cards::-webkit-scrollbar-thumb {
  background: rgba(37, 99, 235, 0.18);
  border-radius: 4px;
}

.problem-card {
  padding: 12px 14px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
}

.problem-card__head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.problem-card__rank {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: #eff6ff;
  color: #2563eb;
  font-size: 11px;
  font-weight: 700;
}

.problem-card__count {
  margin-left: auto;
  font-size: 11px;
  color: #ea580c;
  font-weight: 600;
}

.problem-card__desc {
  margin: 0 0 8px;
  font-size: 13px;
  line-height: 1.55;
  color: #475569;
}

.problem-card__tip {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: #059669;
}

.rate--high {
  color: #ea580c;
  font-weight: 600;
}

.rate--mid {
  color: #2563eb;
  font-weight: 600;
}

.table-empty {
  padding: 24px;
  text-align: center;
  color: #64748b;
}

.table-empty span {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: #94a3b8;
}

@media (max-width: 1100px) {
  .metric-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .analysis-row {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
