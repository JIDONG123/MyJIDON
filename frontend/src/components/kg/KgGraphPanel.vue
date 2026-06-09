<template>
  <el-card class="kg-graph-card" :class="`kg-graph-card--${graphMode}`" shadow="never">
    <template #header>
      <div class="kg-head">
        <span class="kg-title">{{ title }}</span>
        <div class="kg-actions">
          <el-button v-if="showBuild" type="primary" size="small" :loading="building" @click="onBuild">
            构建/更新图谱
          </el-button>
          <el-button size="small" :loading="loading" @click="load">刷新</el-button>
        </div>
      </div>
    </template>

    <el-alert
      v-if="buildHint"
      :title="buildHint"
      type="info"
      show-icon
      :closable="false"
      class="kg-hint"
    />

    <div v-show="loading" class="kg-loading">加载图谱数据…</div>
    <el-empty v-if="!loading && empty" description="暂无图谱数据，请先点击「构建/更新图谱」" />
    <div v-show="!loading && !empty" ref="chartRef" class="kg-chart" />
  </el-card>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, onActivated, watch, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { buildKgGraphOption, resizeGraph } from '../../utils/echartsGraph'
import { ensureChartInstance, disposeChartInstance } from '../../utils/echartsInstance'
import { postKgBuild, getKgBuildJob } from '../../api/kg'
import { subscribeRt } from '../../socket/rtBus'

const props = defineProps({
  title: { type: String, default: '知识图谱' },
  /** class | course | student | default */
  graphMode: { type: String, default: 'default' },
  loadGraph: { type: Function, required: true },
  buildPayload: { type: Object, default: null },
  showBuild: { type: Boolean, default: true },
})

const chartRef = ref(null)
const loading = ref(false)
const building = ref(false)
const empty = ref(false)
const buildHint = ref('')
let chart = null
let unsub = null
let pollTimer = null

async function render(graph) {
  const hasNodes = Array.isArray(graph?.nodes) && graph.nodes.length > 0
  empty.value = !hasNodes
  if (!hasNodes) {
    chart = disposeChartInstance(chart)
    return
  }
  await nextTick()
  if (!chartRef.value) {
    await nextTick()
  }
  if (!chartRef.value) return
  chart = ensureChartInstance(chartRef.value, chart)
  if (!chart) return
  chart.setOption(buildKgGraphOption(graph, props.graphMode), {
    notMerge: false,
    replaceMerge: ['series'],
    lazyUpdate: true,
  })
  resizeGraph(chart)
  if (graph.layoutStyle === 'force' || graph.viewMode === 'course-force') {
    window.setTimeout(() => resizeGraph(chart), 400)
    window.setTimeout(() => resizeGraph(chart), 1200)
  }
}

async function load() {
  loading.value = true
  let graphPayload = null
  try {
    const res = await props.loadGraph()
    if (res.success) {
      graphPayload = res.data?.graph || res.data
      const stats = res.data?.stats
      if (stats && stats.nodeCount != null && !buildHint.value?.includes('节点')) {
        let hint = `共 ${stats.nodeCount} 个节点、${stats.edgeCount ?? 0} 条关系`
        if (stats.layoutHint) hint += ` · ${stats.layoutHint}`
        buildHint.value = buildHint.value ? `${buildHint.value}（${hint}）` : hint
      }
    } else {
      ElMessage.error(res.message || '加载图谱失败')
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || e.message || '加载图谱失败')
  } finally {
    loading.value = false
  }
  await nextTick()
  if (graphPayload) {
    await render(graphPayload)
  }
}

function pollJob(jobId) {
  clearInterval(pollTimer)
  pollTimer = setInterval(async () => {
    try {
      const res = await getKgBuildJob(jobId)
      if (!res.success) return
      const j = res.data
      buildHint.value = j.message || j.status
      if (j.status === 'done') {
        clearInterval(pollTimer)
        building.value = false
        buildHint.value = '构建完成'
        await load()
      } else if (j.status === 'failed') {
        clearInterval(pollTimer)
        building.value = false
        ElMessage.error(j.error_message || '构建失败')
      }
    } catch {
      /* ignore */
    }
  }, 2000)
}

async function onBuild() {
  if (!props.buildPayload) {
    ElMessage.warning('缺少构建参数')
    return
  }
  building.value = true
  buildHint.value = '任务已排队，异步构建中…'
  try {
    const res = await postKgBuild(props.buildPayload)
    if (res.success && res.data?.jobId) {
      pollJob(res.data.jobId)
    } else {
      building.value = false
      ElMessage.error(res.message || '创建任务失败')
    }
  } catch (e) {
    building.value = false
    ElMessage.error(e?.response?.data?.message || e.message || '创建任务失败')
  }
}

function onRt(payload) {
  if (!payload || payload.domain !== 'kg') return
  if (payload.action === 'kg_build_done') {
    building.value = false
    buildHint.value = '构建完成'
    void load()
  }
}

onMounted(() => {
  void load()
  unsub = subscribeRt(onRt)
  window.addEventListener('resize', onResize, { passive: true })
})

onActivated(() => {
  resizeGraph(chart)
})

function onResize() {
  resizeGraph(chart)
}

onBeforeUnmount(() => {
  clearInterval(pollTimer)
  if (unsub) unsub()
  window.removeEventListener('resize', onResize)
  chart = disposeChartInstance(chart)
})

watch(
  () => [props.loadGraph, props.graphMode],
  () => {
    void load()
  }
)
</script>

<style scoped>
.kg-graph-card {
  margin-top: 16px;
  border-radius: 12px;
  border: 1px solid var(--sg-border, #e8eef5);
}
.kg-graph-card--class {
  border-color: #fed7aa;
  background: linear-gradient(180deg, #fffbeb 0%, #fff 48px);
}
.kg-graph-card--class .kg-title {
  color: #9a3412;
}
.kg-graph-card--course {
  border-color: #bae6fd;
  background: linear-gradient(180deg, #f0f9ff 0%, #fff 48px);
}
.kg-graph-card--course .kg-title {
  color: #0c4a6e;
}
.kg-graph-card--student {
  border-color: #ddd6fe;
  background: linear-gradient(180deg, #f5f3ff 0%, #fff 48px);
}
.kg-graph-card--student .kg-title {
  color: #5b21b6;
}
.kg-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.kg-title {
  font-weight: 600;
  font-size: 15px;
  color: var(--sg-text, #0b3d6d);
}
.kg-actions {
  display: flex;
  gap: 8px;
}
.kg-hint {
  margin-bottom: 12px;
}
.kg-loading {
  padding: 48px;
  text-align: center;
  color: #64748b;
}
.kg-chart {
  width: 100%;
  height: min(62vh, 520px);
  min-height: 360px;
}
</style>
