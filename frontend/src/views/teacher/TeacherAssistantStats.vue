<template>
  <div class="analytics-workbench">
    <header class="workbench-head">
      <div class="workbench-head__main">
        <h1 class="workbench-title">学生助手统计</h1>
        <p class="workbench-subtitle">
          汇总本班学生在 AI 助手中的高频提问，辅助教师识别共性疑问与教学盲点
        </p>
      </div>
      <div class="workbench-head__actions">
        <el-button :loading="loading" @click="load">
          <el-icon><Refresh /></el-icon>
          刷新
        </el-button>
      </div>
    </header>

    <section class="metric-grid">
      <div v-for="card in metricCards" :key="card.key" class="metric-card">
        <div class="metric-card__icon" :class="`metric-card__icon--${card.tone}`">
          <el-icon><component :is="card.icon" /></el-icon>
        </div>
        <div class="metric-card__body">
          <span class="metric-card__value">{{ card.value }}</span>
          <span class="metric-card__label">{{ card.label }}</span>
          <span v-if="card.hint" class="metric-card__hint">{{ card.hint }}</span>
        </div>
      </div>
    </section>

    <section class="analysis-row">
      <div class="panel">
        <div class="panel__header">
          <h2 class="panel__title">热门问题排行</h2>
          <span class="panel__meta">Top {{ Math.min(8, tableRows.length) || 8 }} · 按提问次数</span>
        </div>
        <div v-if="hasData" ref="barRef" class="chart" v-loading="loading" />
        <div v-else class="chart chart--empty" v-loading="loading">
          <el-empty description="暂无排行数据">
            <template #description>
              <p class="empty-inline__title">暂无热门问题</p>
              <p class="empty-inline__desc">学生使用 AI 助手提问后，将自动聚合排行</p>
            </template>
          </el-empty>
        </div>
      </div>

      <div class="panel">
        <div class="panel__header">
          <h2 class="panel__title">问题类型分布</h2>
          <span class="panel__meta">按关键词轻量归类</span>
        </div>
        <div v-if="hasData && typeStats.length" ref="pieRef" class="chart" v-loading="loading" />
        <div v-else-if="hasData && !typeStats.length" class="type-tags" v-loading="loading">
          <span v-for="t in fallbackTypes" :key="t" class="type-tag">{{ t }}</span>
        </div>
        <div v-else class="chart chart--empty" v-loading="loading">
          <el-empty description="暂无类型分布" :image-size="64" />
        </div>
      </div>
    </section>

    <div class="panel panel--table">
      <div class="panel__header">
        <div>
          <h2 class="panel__title">问题明细</h2>
          <span class="panel__meta">共 {{ tableRows.length }} 条去重问题 · 默认按次数降序</span>
        </div>
      </div>

      <el-table
        v-loading="loading"
        :data="tableRows"
        border
        stripe
        class="detail-table"
        :default-sort="{ prop: 'count', order: 'descending' }"
      >
        <template #empty>
          <div class="table-empty">
            <p>暂无问题明细</p>
            <span>学生提问后将自动汇总展示</span>
          </div>
        </template>
        <el-table-column prop="rank" label="排名" width="72" align="center" />
        <el-table-column prop="text" label="问题内容" min-width="320" show-overflow-tooltip />
        <el-table-column prop="count" label="次数" width="100" align="center" sortable />
        <el-table-column prop="type" label="类型" width="120" align="center">
          <template #default="{ row }">
            <el-tag size="small" effect="plain" :type="typeTagTone(row.type)">{{ row.type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="lastAsked" label="最近提问" width="120" align="center">
          <template #default>
            <span class="text-muted">—</span>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import * as echarts from 'echarts'
import { ChatDotRound, Document, User, TrendCharts, Refresh } from '@element-plus/icons-vue'
import { getAssistantTeacherStats } from '../../api/analytics'
import { ElMessage } from 'element-plus'
import {
  enrichAssistantRows,
  buildAssistantKpis,
  buildQuestionTypeStats,
  buildTopQuestionBars,
} from '../../utils/assistantStatsData'

const loading = ref(true)
const rawRows = ref([])
const barRef = ref(null)
const pieRef = ref(null)
const charts = []

const tableRows = computed(() => enrichAssistantRows(rawRows.value))
const kpis = computed(() => buildAssistantKpis(rawRows.value))
const typeStats = computed(() => buildQuestionTypeStats(rawRows.value))
const hasData = computed(() => tableRows.value.length > 0)
const fallbackTypes = ['概念理解', '操作指南', '代码调试', '作业任务', '其他咨询']

const metricCards = computed(() => [
  { key: 'total', label: '总提问次数', value: kpis.value.totalQuestions, icon: ChatDotRound, tone: 'blue' },
  { key: 'unique', label: '去重问题数', value: kpis.value.uniqueQuestions, icon: Document, tone: 'slate' },
  {
    key: 'students',
    label: '参与提问学生数',
    value: kpis.value.participatingStudents ?? '—',
    hint: kpis.value.participatingStudents == null ? '接口暂未提供' : '',
    icon: User,
    tone: 'green',
  },
  { key: 'hot', label: '最热门问题次数', value: kpis.value.topHotCount || '—', icon: TrendCharts, tone: 'orange' },
])

function typeTagTone(type) {
  const map = { 概念理解: '', 操作指南: 'success', 代码调试: 'danger', 作业任务: 'warning', 成绩评语: 'info' }
  return map[type] || 'info'
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
  if (loading.value || !hasData.value) {
    disposeCharts()
    return
  }

  const bars = buildTopQuestionBars(rawRows.value)
  if (barRef.value && bars.length) {
    const chart = getChart(barRef.value)
    if (chart) {
      chart.setOption(
        {
          tooltip: {
            ...TOOLTIP,
            trigger: 'axis',
            formatter(params) {
              const p = params[0]
              const item = bars[p.dataIndex]
              return `${item.fullText}<br/>提问 ${p.value} 次`
            },
          },
          grid: { left: 12, right: 52, top: 8, bottom: 8, containLabel: true },
          xAxis: { type: 'value', splitLine: { lineStyle: { color: '#f1f5f9' } } },
          yAxis: {
            type: 'category',
            data: bars.map((b) => b.name).reverse(),
            axisLabel: { color: '#64748b', fontSize: 11, width: 140, overflow: 'truncate' },
            axisLine: { show: false },
            axisTick: { show: false },
          },
          series: [
            {
              type: 'bar',
              data: bars.map((b) => b.value).reverse(),
              barWidth: 16,
              itemStyle: {
                borderRadius: [0, 4, 4, 0],
                color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                  { offset: 0, color: '#2563eb' },
                  { offset: 1, color: '#60a5fa' },
                ]),
              },
              label: { show: true, position: 'right', color: '#64748b', fontSize: 11 },
            },
          ],
        },
        true
      )
      chart.resize()
    }
  }

  const types = typeStats.value
  if (pieRef.value && types.length) {
    const chart = getChart(pieRef.value)
    if (chart) {
      chart.setOption(
        {
          color: ['#2563eb', '#059669', '#ea580c', '#7c3aed', '#0891b2', '#64748b'],
          tooltip: { ...TOOLTIP, trigger: 'item', formatter: '{b}：{c} 次 ({d}%)' },
          legend: { bottom: 0, textStyle: { color: '#64748b', fontSize: 11 } },
          series: [
            {
              type: 'pie',
              radius: ['42%', '68%'],
              center: ['50%', '44%'],
              data: types,
              label: { show: false },
              emphasis: { label: { show: true, fontSize: 12 } },
            },
          ],
        },
        true
      )
      chart.resize()
    }
  }
}

watch([rawRows, loading], () => {
  disposeCharts()
  requestAnimationFrame(() => void renderCharts())
})

const onResize = () => {
  for (const c of charts) {
    if (c && !c.isDisposed()) c.resize()
  }
}

async function load() {
  loading.value = true
  try {
    const res = await getAssistantTeacherStats()
    if (res.success) rawRows.value = res.data?.topQuestions || []
    else ElMessage.error(res.message || '加载失败')
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '加载失败')
  } finally {
    loading.value = false
    await renderCharts()
  }
}

onMounted(async () => {
  await load()
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
  margin-bottom: 20px;
}

.workbench-title {
  margin: 0 0 8px;
  font-size: 24px;
  font-weight: 700;
  color: #0f172a;
}

.workbench-subtitle {
  margin: 0;
  max-width: 720px;
  font-size: 14px;
  line-height: 1.65;
  color: #64748b;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
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
.metric-card__icon--green { background: #ecfdf5; color: #059669; }
.metric-card__icon--orange { background: #fff7ed; color: #ea580c; }

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

.metric-card__hint {
  display: block;
  font-size: 11px;
  color: #94a3b8;
  margin-top: 2px;
}

.analysis-row {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
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
  height: 300px;
  width: 100%;
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

.type-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-height: 300px;
  align-content: center;
  justify-content: center;
  padding: 24px;
}

.type-tag {
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 13px;
  color: #475569;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
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

.text-muted {
  color: #94a3b8;
  font-size: 12px;
}

@media (max-width: 960px) {
  .metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .analysis-row { grid-template-columns: 1fr; }
}
</style>
