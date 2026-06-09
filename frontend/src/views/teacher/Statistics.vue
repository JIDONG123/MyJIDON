<template>
  <div class="page-statistics">
    <header class="page-head">
      <div>
        <h1 class="page-title">实训数据统计</h1>
        <p class="page-desc">按行政班、教学班或课程查看分数分布、等级占比与维度雷达；导出含课程/教学班/学期/实训项目字段</p>
      </div>
    </header>

    <el-card class="toolbar-card" shadow="never">
      <div class="toolbar">
        <div class="toolbar-left">
          <span class="toolbar-label">统计范围</span>
          <el-select v-model="statScope" class="scope-select" @change="onScopeChange">
            <el-option label="行政班" value="legacy_class" />
            <el-option label="教学班" value="teaching_class" />
            <el-option v-if="canUseCourseScope" label="课程（负责人）" value="course" />
          </el-select>
          <el-select
            v-model="selectedScopeId"
            placeholder="请选择"
            class="class-select"
            :loading="scopeLoading"
            clearable
            filterable
          >
            <el-option
              v-for="opt in scopeOptions"
              :key="opt.id"
              :label="opt.label"
              :value="opt.id"
            />
          </el-select>
        </div>
        <div class="toolbar-actions">
          <el-button
            type="success"
            class="export-btn"
            :disabled="!selectedScopeId"
            @click="exportExcel"
          >
            <el-icon class="btn-icon"><Download /></el-icon>
            导出 Excel
          </el-button>
          <el-button
            type="primary"
            plain
            class="export-btn export-btn--pdf"
            :disabled="!selectedScopeId"
            @click="exportPdf"
          >
            <el-icon class="btn-icon"><Document /></el-icon>
            导出 PDF
          </el-button>
        </div>
      </div>
    </el-card>

    <el-skeleton v-if="scopeLoading" animated :rows="5" class="sk-block" />

    <template v-else-if="!scopeOptions.length">
      <el-empty description="暂无可用统计范围，请先创建行政班/教学班或课程" :image-size="120">
        <template #image>
          <div class="empty-illus">
            <el-icon><OfficeBuilding /></el-icon>
          </div>
        </template>
      </el-empty>
    </template>

    <template v-else>
      <div v-loading="statsLoading" class="stats-body" element-loading-text="统计数据加载中…">
        <template v-if="!statsLoading">
          <el-row v-if="statistics" :gutter="20" class="metric-row">
            <el-col v-for="m in metricItems" :key="m.key" :xs="12" :sm="8" :md="4">
              <div :class="['metric-card', m.tone]">
                <div class="metric-card__inner">
                  <div class="metric-icon-wrap" aria-hidden="true">
                    <el-icon class="metric-icon"><component :is="m.icon" /></el-icon>
                  </div>
                  <div class="metric-card__text">
                    <span class="metric-label">{{ m.label }}</span>
                    <span class="metric-value">{{ formatMetric(m.key) }}</span>
                  </div>
                </div>
              </div>
            </el-col>
          </el-row>

          <el-empty
            v-else-if="selectedScopeId"
            description="暂无统计数据"
            :image-size="100"
            class="empty-stats"
          />

          <el-row v-if="statistics" :gutter="20" class="chart-row charts-fade">
            <el-col :xs="24" :lg="12">
              <el-card class="chart-card" shadow="never">
                <template #header>
                  <div class="chart-card-head">
                    <div class="chart-card-head__titles">
                      <span class="chart-card-title">分数分布</span>
                      <span class="chart-card-sub">成绩区间人数（不及格 / 及格 / 良好 / 优秀）</span>
                    </div>
                    <span class="chart-hint">柱状图</span>
                  </div>
                </template>
                <div v-if="!hasDistribution" class="chart-empty">
                  <el-empty description="暂无分数分布数据，请等待学生提交并完成批改" :image-size="72" />
                </div>
                <div v-else ref="distributionChartRef" class="chart-box" />
              </el-card>
            </el-col>
            <el-col :xs="24" :lg="12">
              <el-card class="chart-card" shadow="never">
                <template #header>
                  <div class="chart-card-head">
                    <div class="chart-card-head__titles">
                      <span class="chart-card-title">成绩等级占比</span>
                      <span class="chart-card-sub">各等级人数与占比，中心为班级汇总</span>
                    </div>
                    <span class="chart-hint">环形图</span>
                  </div>
                </template>
                <div v-if="!hasDistribution" class="chart-empty">
                  <el-empty description="暂无等级数据" :image-size="72" />
                </div>
                <div v-else ref="pieChartRef" class="chart-box" />
              </el-card>
            </el-col>
            <el-col :xs="24">
              <el-card class="chart-card chart-card--wide" shadow="never">
                <template #header>
                  <div class="chart-card-head">
                    <div class="chart-card-head__titles">
                      <span class="chart-card-title">维度雷达（班级聚合）</span>
                      <span class="chart-card-sub">基于 AI 批改维度得分的班级平均达成度（0–100）</span>
                    </div>
                    <span class="chart-hint">雷达图</span>
                  </div>
                </template>
                <div v-if="!dimensionRadar.length" class="chart-empty chart-empty--tall">
                  <el-empty description="暂无维度样本，请先完成带维度得分的 AI 批改" :image-size="80" />
                </div>
                <template v-else>
                  <div ref="radarChartRef" class="chart-box chart-box--tall" />
                  <div class="radar-legend">
                    <p class="radar-legend__title">维度说明</p>
                    <ul class="radar-legend__list">
                      <li v-for="line in radarDimensionLines" :key="line">{{ line }}</li>
                    </ul>
                  </div>
                </template>
              </el-card>
            </el-col>
          </el-row>
        </template>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, computed, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import {
  OfficeBuilding,
  DataLine,
  Top,
  Bottom,
  User,
  DocumentCopy,
  CircleCheck,
  Download,
  Document,
} from '@element-plus/icons-vue'
import { getAllClasses } from '../../api/class'
import { listMyTeachingClasses } from '../../api/teachingClass'
import { listMyCourses, listCourses } from '../../api/course'
import { getPracticeStatistics, exportPracticeScores } from '../../api/dashboard'
import { downloadPracticePdf } from '../../api/report'
import { useUserStore } from '../../stores/user'
import * as echarts from 'echarts'
import { ElMessage } from 'element-plus'

const route = useRoute()
const userStore = useUserStore()

const classes = ref([])
const teachingClasses = ref([])
const courses = ref([])
const scopeLoading = ref(true)
const statScope = ref('legacy_class')
const selectedScopeId = ref('')

const scopeOptions = computed(() => {
  if (statScope.value === 'teaching_class') {
    return (teachingClasses.value || []).map((tc) => ({
      id: tc.id,
      label: [tc.class_name, tc.course_name, tc.term_name].filter(Boolean).join(' · '),
    }))
  }
  if (statScope.value === 'course') {
    return leaderCourses.value.map((co) => ({
      id: co.id,
      label: [co.course_code, co.course_name].filter(Boolean).join(' '),
    }))
  }
  return (classes.value || []).map((c) => ({
    id: c.id,
    label: c.class_name || c.className,
  }))
})

const leaderCourses = computed(() => {
  const list = courses.value || []
  if (userStore.user?.role === 'admin') return list
  return list.filter((c) => (c.my_roles || []).includes('course_leader'))
})

const canUseCourseScope = computed(() => leaderCourses.value.length > 0)

/** 兼容导出 PDF 等仍用 classId 的场景 */
const selectedClass = computed(() =>
  statScope.value === 'legacy_class' ? selectedScopeId.value : ''
)
const statistics = ref(null)
const statsLoading = ref(false)
const dimensionRadar = ref([])

const distributionChartRef = ref(null)
const pieChartRef = ref(null)
const radarChartRef = ref(null)
let distributionChartInstance = null
let pieChartInstance = null
let radarChartInstance = null

/** 等级 → 环形图颜色：红 / 黄 / 浅绿 / 深绿 */
const GRADE_PIE_COLORS = {
  不及格: '#ef4444',
  及格: '#eab308',
  良好: '#4ade80',
  优秀: '#166534',
}

const metricItems = [
  { key: 'avgScore', label: '平均分', tone: 'tone-rose', icon: DataLine },
  { key: 'maxScore', label: '最高分', tone: 'tone-teal', icon: Top },
  { key: 'minScore', label: '最低分', tone: 'tone-amber', icon: Bottom },
  { key: 'studentCount', label: '学生数', tone: 'tone-blue', icon: User },
  { key: 'submissionCount', label: '提交数', tone: 'tone-violet', icon: DocumentCopy },
  { key: 'gradedCount', label: '已批改', tone: 'tone-sky', icon: CircleCheck },
]

const DIMENSION_HINTS = {
  代码质量: '结构清晰度、规范性与可维护性等综合代码水平。',
  文档规范性: '说明文档、注释与交付材料的完整与规范程度。',
  功能实现度: '需求覆盖、正确性与功能完整度。',
  综合表现: '整体完成度、问题处理与工程化表现的综合评分。',
}

const radarDimensionLines = computed(() => {
  const dims = dimensionRadar.value
  if (!dims.length) return []
  return dims.map((d) => {
    const hint = DIMENSION_HINTS[d.name]
    return hint ? `${d.name}：${hint}` : `${d.name}：该维度班级平均 ${Number(d.value).toFixed(1)} 分。`
  })
})

const hasDistribution = computed(() => {
  const d = statistics.value?.scoreDistribution
  return Array.isArray(d) && d.length > 0 && d.some((x) => (x.count || 0) > 0)
})

const num = (v) => (v == null || v === '' ? '0.0' : Number(v).toFixed(1))

const formatMetric = (key) => {
  if (!statistics.value) return '—'
  if (key === 'avgScore' || key === 'maxScore' || key === 'minScore') {
    return num(statistics.value[key])
  }
  return statistics.value[key] ?? 0
}

function pieColorForGrade(name) {
  return GRADE_PIE_COLORS[name] || '#64748b'
}

const tooltipTheme = {
  triggerOn: 'mousemove|click',
  backgroundColor: 'rgba(15, 23, 42, 0.92)',
  borderColor: 'rgba(59, 130, 246, 0.45)',
  borderWidth: 1,
  padding: [10, 14],
  textStyle: {
    color: '#f1f5f9',
    fontSize: 13,
  },
  extraCssText: 'border-radius:10px;box-shadow:0 8px 24px rgba(15,23,42,0.25);',
}

const disposeCharts = () => {
  distributionChartInstance?.dispose()
  pieChartInstance?.dispose()
  radarChartInstance?.dispose()
  distributionChartInstance = null
  pieChartInstance = null
  radarChartInstance = null
}

function practiceStatsParams() {
  const base = { scopeType: statScope.value, scopeId: selectedScopeId.value }
  if (statScope.value === 'legacy_class') base.classId = selectedScopeId.value
  if (statScope.value === 'teaching_class') base.teachingClassId = selectedScopeId.value
  if (statScope.value === 'course') base.courseId = selectedScopeId.value
  return base
}

const onScopeChange = () => {
  if (statScope.value === 'course' && !canUseCourseScope.value) {
    statScope.value = 'teaching_class'
  }
  selectedScopeId.value = scopeOptions.value[0]?.id || ''
  loadStatistics()
}

const loadScopeLists = async () => {
  scopeLoading.value = true
  try {
    const role = userStore.user?.role
    const courseRequest =
      role === 'teacher'
        ? listMyCourses()
        : role === 'admin'
          ? listCourses()
          : Promise.resolve({ success: true, data: [] })

    const [clsRes, tcRes, coRes] = await Promise.all([
      getAllClasses(),
      listMyTeachingClasses(),
      courseRequest,
    ])
    if (clsRes.success) classes.value = clsRes.data || []
    if (tcRes.success) teachingClasses.value = tcRes.data || []
    if (coRes.success) courses.value = coRes.data || []

    const qid = route.query.classId
    if (qid && classes.value.some((c) => String(c.id) === String(qid))) {
      statScope.value = 'legacy_class'
      selectedScopeId.value = Number(qid)
    } else if (statScope.value === 'course' && !canUseCourseScope.value) {
      statScope.value = teachingClasses.value.length ? 'teaching_class' : 'legacy_class'
      selectedScopeId.value = scopeOptions.value[0]?.id || ''
    } else if (!selectedScopeId.value) {
      selectedScopeId.value = scopeOptions.value[0]?.id || ''
    }
  } catch (error) {
    console.error(error)
  } finally {
    scopeLoading.value = false
  }
}

const loadStatistics = async () => {
  if (!selectedScopeId.value) {
    statistics.value = null
    dimensionRadar.value = []
    disposeCharts()
    return
  }

  statsLoading.value = true
  statistics.value = null
  dimensionRadar.value = []
  disposeCharts()

  try {
    const response = await getPracticeStatistics(practiceStatsParams())
    if (response.success) {
      statistics.value = response.data
      dimensionRadar.value = response.data.dimensionRadar || []
    }
  } catch (error) {
    console.error(error)
  } finally {
    statsLoading.value = false
  }

  await nextTick()
  // 拆成两帧：减轻单帧 rAF 耗时告警，并避免雷达与其它图同时抢主线程
  requestAnimationFrame(() => {
    if (!statistics.value) return
    const dist = statistics.value.scoreDistribution || []
    renderCharts(dist)
    requestAnimationFrame(() => {
      if (!statistics.value) return
      renderRadar(dimensionRadar.value)
    })
  })
}

const renderCharts = (distribution) => {
  if (!distributionChartRef.value || !pieChartRef.value) return

  const total = distribution.reduce((s, x) => s + (Number(x.count) || 0), 0)
  const passGrades = ['及格', '良好', '优秀']
  const passCount = distribution
    .filter((d) => passGrades.includes(d.grade))
    .reduce((s, d) => s + (Number(d.count) || 0), 0)
  const passRate = total > 0 ? Math.round((passCount / total) * 100) : 0

  if (distributionChartInstance) distributionChartInstance.dispose()
  distributionChartInstance = echarts.init(distributionChartRef.value)
  distributionChartInstance.setOption({
    title: {
      text: '成绩区间人数分布',
      subtext: '横轴为等级区间，纵轴为提交人次',
      left: 'center',
      top: 0,
      textStyle: { fontSize: 13, fontWeight: 600, color: '#334155' },
      subtextStyle: { fontSize: 11, color: '#94a3b8' },
    },
    tooltip: {
      ...tooltipTheme,
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(22, 119, 255, 0.12)' } },
      formatter: (params) => {
        const p = params[0]
        const name = p?.axisValueLabel ?? p?.name ?? ''
        const n = p?.data ?? 0
        const pct = total > 0 ? ((Number(n) / total) * 100).toFixed(1) : '0.0'
        return `<div style="font-weight:600;margin-bottom:4px">${name}</div>人数：<b>${n}</b> 人<br/>占班级提交：<b>${pct}%</b>`
      },
    },
    grid: { left: '3%', right: '3%', bottom: '10%', top: 56, containLabel: true },
    xAxis: {
      type: 'category',
      data: distribution.map((item) => item.grade),
      axisLine: { lineStyle: { color: '#cbd5e1' } },
      axisTick: { show: false },
      axisLabel: { color: '#475569', fontSize: 12, margin: 12 },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#64748b', fontSize: 11 },
      splitLine: { lineStyle: { type: 'dashed', color: '#e2e8f0' } },
    },
    series: [
      {
        type: 'bar',
        barMaxWidth: 48,
        data: distribution.map((item) => item.count),
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#2563eb' },
            { offset: 1, color: '#93c5fd' },
          ]),
          borderRadius: [10, 10, 4, 4],
        },
        emphasis: {
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#1d4ed8' },
              { offset: 1, color: '#60a5fa' },
            ]),
          },
        },
      },
    ],
  })

  if (pieChartInstance) pieChartInstance.dispose()
  pieChartInstance = echarts.init(pieChartRef.value)
  const pieData = distribution.map((item) => ({
    value: item.count,
    name: item.grade,
    itemStyle: {
      color: pieColorForGrade(item.grade),
      borderRadius: 6,
      borderColor: '#fff',
      borderWidth: 2,
    },
  }))

  pieChartInstance.setOption({
    tooltip: {
      ...tooltipTheme,
      trigger: 'item',
      formatter: (p) => {
        const v = p.value ?? 0
        const pct = p.percent != null ? Number(p.percent).toFixed(1) : total > 0 ? ((v / total) * 100).toFixed(1) : '0.0'
        return `<div style="font-weight:600;margin-bottom:4px">${p.name}</div>人数：<b>${v}</b> 人<br/>占比：<b>${pct}%</b>`
      },
    },
    legend: {
      type: 'scroll',
      bottom: 4,
      left: 'center',
      itemWidth: 12,
      itemHeight: 12,
      itemGap: 16,
      textStyle: { color: '#475569', fontSize: 12 },
      formatter: (name) => {
        const item = distribution.find((d) => d.grade === name)
        const c = item?.count ?? 0
        const pct = total > 0 ? ((Number(c) / total) * 100).toFixed(1) : '0.0'
        return `${name}  ${c}人 (${pct}%)`
      },
    },
    series: [
      {
        name: '等级',
        type: 'pie',
        radius: ['44%', '70%'],
        center: ['50%', '44%'],
        avoidLabelOverlap: true,
        label: { show: false },
        labelLine: { show: false },
        emphasis: {
          scale: true,
          scaleSize: 6,
          itemStyle: { shadowBlur: 12, shadowColor: 'rgba(15, 23, 42, 0.18)' },
        },
        data: pieData,
      },
    ],
    graphic: [
      {
        type: 'group',
        left: 'center',
        top: '38%',
        children: [
          {
            type: 'text',
            style: {
              text: '总人数',
              fill: '#64748b',
              font: '12px sans-serif',
              textAlign: 'center',
            },
            top: 0,
          },
          {
            type: 'text',
            style: {
              text: String(total),
              fill: '#0f172a',
              font: 'bold 22px sans-serif',
              textAlign: 'center',
            },
            top: 18,
          },
          {
            type: 'text',
            style: {
              text: `及格率 ${passRate}%`,
              fill: '#3b82f6',
              font: '600 12px sans-serif',
              textAlign: 'center',
            },
            top: 48,
          },
        ],
      },
    ],
  })
}

const renderRadar = (dims) => {
  if (!radarChartRef.value) return
  if (radarChartInstance) radarChartInstance.dispose()
  radarChartInstance = echarts.init(radarChartRef.value)
  if (!dims.length) {
    return
  }
  radarChartInstance.setOption({
    title: {
      text: '班级维度达成度',
      left: 'center',
      top: 4,
      textStyle: { fontSize: 13, fontWeight: 600, color: '#334155' },
    },
    tooltip: {
      ...tooltipTheme,
      trigger: 'item',
      formatter: (params) => {
        if (!params?.data?.value) return ''
        const indicators = dims.map((d) => d.name)
        const vals = params.data.value
        const lines = indicators.map((name, i) => {
          const v = vals[i] != null ? Number(vals[i]).toFixed(1) : '—'
          return `${name}：${v} 分`
        })
        return `<div style="font-weight:600;margin-bottom:6px">维度得分</div>${lines.join('<br/>')}`
      },
    },
    radar: {
      indicator: dims.map((d) => ({ name: d.name, max: 100 })),
      center: ['50%', '54%'],
      radius: '58%',
      // 与 ECharts 雷达默认 splitNumber 5 一致：0–100 五等分刻度更「整」，可减少 alignScaleTicks 的开发态告警
      splitNumber: 5,
      axisName: {
        color: '#475569',
        fontSize: 12,
        lineHeight: 16,
        formatter: (name) => (name.length > 12 ? `${name.slice(0, 12)}…` : name),
      },
      axisLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.45)' } },
      splitLine: { lineStyle: { color: 'rgba(203, 213, 225, 0.65)', type: 'dashed' } },
      splitArea: {
        show: true,
        areaStyle: {
          color: ['rgba(241, 245, 249, 0.45)', 'rgba(255, 255, 255, 0.02)'],
        },
      },
    },
    series: [
      {
        type: 'radar',
        symbol: 'circle',
        symbolSize: 7,
        lineStyle: { width: 2.5, color: '#2563eb' },
        itemStyle: { color: '#1d4ed8', borderColor: '#fff', borderWidth: 1 },
        areaStyle: {
          color: new echarts.graphic.RadialGradient(0.5, 0.5, 0.95, [
            { offset: 0, color: 'rgba(37, 99, 235, 0.35)' },
            { offset: 1, color: 'rgba(37, 99, 235, 0.06)' },
          ]),
        },
        data: [{ value: dims.map((d) => d.value), name: '班级维度达成度(%)' }],
        emphasis: {
          lineStyle: { width: 3 },
          areaStyle: { opacity: 0.35 },
        },
      },
    ],
  })
}

const exportExcel = async () => {
  if (!selectedScopeId.value) {
    ElMessage.warning('请先选择统计范围')
    return
  }
  try {
    const response = await exportPracticeScores(practiceStatsParams())
    const blob = new Blob([response], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `实训成绩_${statScope.value}_${selectedScopeId.value}.xlsx`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
    ElMessage.success('导出成功')
  } catch (error) {
    ElMessage.error('导出失败')
    console.error(error)
  }
}

const exportPdf = async () => {
  if (!selectedScopeId.value) {
    ElMessage.warning('请先选择统计范围')
    return
  }
  try {
    await downloadPracticePdf(practiceStatsParams())
    ElMessage.success('已开始下载 PDF 报告')
  } catch (e) {
    ElMessage.error(e?.message || '导出 PDF 失败')
  }
}

const handleResize = () => {
  distributionChartInstance?.resize()
  pieChartInstance?.resize()
  radarChartInstance?.resize()
}

onMounted(async () => {
  await loadScopeLists()
  if (selectedScopeId.value) await loadStatistics()
  window.addEventListener('resize', handleResize)
})

watch([statScope, selectedScopeId], () => {
  loadStatistics()
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  disposeCharts()
})
</script>

<style scoped>
.page-statistics {
  max-width: 1280px;
  margin: 0 auto;
  padding: 8px 4px 40px;
}

.page-head {
  margin-bottom: 28px;
  padding: 0 4px;
}

.page-title {
  margin: 0 0 10px;
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--sg-text, #0f172a);
  line-height: 1.25;
}

.page-desc {
  margin: 0;
  max-width: 40rem;
  font-size: 13px;
  line-height: 1.65;
  font-weight: 400;
  color: var(--sg-text-secondary, #64748b);
  opacity: 0.92;
}

.toolbar-card {
  margin-bottom: 28px;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: linear-gradient(180deg, #fafbfc 0%, #ffffff 100%);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 28px rgba(15, 76, 129, 0.06);
  overflow: hidden;
}

.toolbar-card :deep(.el-card__body) {
  padding: 18px 20px;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px 20px;
}

.toolbar-left {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 14px;
  min-width: 0;
}

.toolbar-label {
  font-size: 13px;
  font-weight: 600;
  color: #475569;
}

.class-select {
  min-width: 240px;
  max-width: 100%;
}

.toolbar-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.export-btn {
  border-radius: 10px;
  font-weight: 600;
  padding: 10px 18px;
  transition:
    transform 0.18s ease,
    box-shadow 0.2s ease;
}

.export-btn:not(:disabled):hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.12);
}

.export-btn--pdf:not(:disabled):hover {
  box-shadow: 0 6px 16px rgba(37, 99, 235, 0.2);
}

.btn-icon {
  margin-right: 6px;
  vertical-align: middle;
}

.sk-block {
  padding: 20px 4px;
}

.stats-body {
  min-height: 420px;
  border-radius: 12px;
}

.empty-illus {
  width: 120px;
  height: 120px;
  margin: 0 auto;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(22, 119, 255, 0.12), rgba(100, 116, 139, 0.08));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 48px;
  color: var(--sg-primary);
}

.metric-row {
  margin-bottom: 28px;
}

.metric-card {
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: linear-gradient(165deg, #ffffff 0%, #f8fafc 100%);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 24px rgba(15, 76, 129, 0.06);
  height: 100%;
  min-height: 104px;
  transition:
    transform 0.22s ease,
    box-shadow 0.22s ease;
}

.metric-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.08), 0 16px 40px rgba(15, 76, 129, 0.1);
}

.metric-card__inner {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 16px;
  height: 100%;
}

.metric-icon-wrap {
  flex-shrink: 0;
  width: 46px;
  height: 46px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.metric-icon {
  font-size: 22px;
}

.tone-blue .metric-icon-wrap {
  background: linear-gradient(135deg, #dbeafe 0%, #eff6ff 100%);
  color: #2563eb;
}
.tone-teal .metric-icon-wrap {
  background: linear-gradient(135deg, #ccfbf1 0%, #e0f2fe 100%);
  color: #0d9488;
}
.tone-amber .metric-icon-wrap {
  background: linear-gradient(135deg, #fef3c7 0%, #fffbeb 100%);
  color: #d97706;
}
.tone-rose .metric-icon-wrap {
  background: linear-gradient(135deg, #ffe4e6 0%, #fff1f2 100%);
  color: #e11d48;
}
.tone-violet .metric-icon-wrap {
  background: linear-gradient(135deg, #ede9fe 0%, #f5f3ff 100%);
  color: #7c3aed;
}
.tone-sky .metric-icon-wrap {
  background: linear-gradient(135deg, #e0f2fe 0%, #f0f9ff 100%);
  color: #0284c7;
}

.metric-card__text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.metric-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--sg-text-secondary, #64748b);
}

.metric-value {
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: var(--sg-text, #0f172a);
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}

.empty-stats {
  margin: 28px 0;
}

.chart-row {
  align-items: stretch;
}

.charts-fade {
  animation: charts-enter 0.55s ease-out both;
}

@keyframes charts-enter {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.chart-card {
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: #fff;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 10px 28px rgba(15, 76, 129, 0.07);
  height: 100%;
  margin-bottom: 20px;
  transition: box-shadow 0.25s ease;
}

.chart-card:hover {
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.06), 0 16px 40px rgba(15, 76, 129, 0.09);
}

.chart-card--wide {
  margin-bottom: 0;
}

.chart-card :deep(.el-card__header) {
  padding: 16px 20px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.95);
  background: linear-gradient(180deg, #fafbfc 0%, #ffffff 100%);
}

.chart-card :deep(.el-card__body) {
  padding: 16px 18px 20px;
}

.chart-card-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.chart-card-head__titles {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.chart-card-title {
  font-weight: 700;
  font-size: 16px;
  color: var(--sg-text, #0f172a);
}

.chart-card-sub {
  font-size: 12px;
  font-weight: 500;
  color: var(--sg-text-placeholder, #94a3b8);
  line-height: 1.45;
}

.chart-hint {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #94a3b8;
  padding: 4px 10px;
  border-radius: 999px;
  background: #f1f5f9;
}

.chart-box {
  height: 320px;
}

.chart-box--tall {
  height: 340px;
}

.chart-empty {
  height: 280px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.chart-empty--tall {
  height: 320px;
}

.radar-legend {
  margin-top: 8px;
  padding: 14px 16px 4px;
  border-radius: 10px;
  background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
  border: 1px solid rgba(226, 232, 240, 0.9);
}

.radar-legend__title {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 700;
  color: #475569;
}

.radar-legend__list {
  margin: 0;
  padding: 0 0 0 18px;
  font-size: 12px;
  line-height: 1.65;
  color: #64748b;
}

@media (max-width: 768px) {
  .page-statistics {
    padding-left: 0;
    padding-right: 0;
  }

  .chart-box {
    height: 280px;
  }

  .chart-box--tall {
    height: 300px;
  }

  .metric-value {
    font-size: 22px;
  }
}
</style>
