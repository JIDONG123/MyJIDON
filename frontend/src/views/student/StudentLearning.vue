<template>
  <div class="page-learning">
    <header class="page-head">
      <h1 class="page-title">学情画像</h1>
      <p class="page-desc">基于历史批改记录的个人总结与本班薄弱维度（示意统计，随数据增多更准确）。</p>
    </header>

    <el-skeleton v-if="loading" :rows="6" animated />

    <template v-else>
      <el-row :gutter="16">
        <el-col :xs="24" :md="12">
          <el-card shadow="never" class="card-block">
            <template #header>个人概况</template>
            <p v-if="profile?.avgScore != null" class="stat-line">
              近期作业平均分：<strong>{{ profile.avgScore }}</strong>（最近 {{ profile.recentCount }} 条有成绩记录）
            </p>
            <p v-else class="muted">暂无足够成绩数据</p>
            <h4 class="sub-h">改进建议（节选）</h4>
            <ul class="list">
              <li v-for="(s, i) in profile?.improvementSuggestions || []" :key="i">{{ s.text }}</li>
            </ul>
            <el-empty v-if="!(profile?.improvementSuggestions?.length)" description="暂无建议" :image-size="60" />
          </el-card>
        </el-col>
        <el-col :xs="24" :md="12">
          <el-card shadow="never" class="card-block">
            <template #header>个人高频问题（节选）</template>
            <ul class="list">
              <li v-for="(w, i) in profile?.weakPoints || []" :key="i">{{ w.text }}</li>
            </ul>
            <el-empty v-if="!(profile?.weakPoints?.length)" description="暂无记录" :image-size="60" />
          </el-card>
        </el-col>
      </el-row>

      <el-card shadow="never" class="card-block chart-card">
        <template #header>本班薄弱评价维度（相对低分占比）</template>
        <div ref="barRef" class="chart" />
        <p v-if="!classWeak?.weakDimensions?.length" class="muted">样本较少或未批改时暂无统计</p>
      </el-card>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import * as echarts from 'echarts'
import { getMyLearningProfile, getMyClassWeak } from '../../api/analytics'

const loading = ref(true)
const profile = ref(null)
const classWeak = ref(null)
const barRef = ref(null)
let chart = null

const renderBar = async () => {
  await nextTick()
  if (!barRef.value) return
  const dims = classWeak.value?.weakDimensions || []
  if (!dims.length) {
    chart?.dispose()
    chart = null
    return
  }
  if (!chart) chart = echarts.init(barRef.value)
  chart.setOption(
    {
      animation: true,
      animationDuration: 480,
      animationEasing: 'cubicOut',
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(255, 255, 255, 0.96)',
        borderColor: '#e2e8f0',
        textStyle: { color: '#0f172a' },
      },
      grid: { left: 52, right: 20, bottom: 40, top: 28 },
      xAxis: {
        type: 'category',
        data: dims.map((d) => d.name),
        axisLabel: { rotate: 28, color: '#64748b' },
        axisLine: { lineStyle: { color: '#cbd5e1' } },
      },
      yAxis: {
        type: 'value',
        name: '低分占比%',
        max: 100,
        nameTextStyle: { color: '#64748b' },
        splitLine: { lineStyle: { color: '#e2e8f0' } },
        axisLabel: { color: '#64748b' },
      },
      series: [
        {
          type: 'bar',
          data: dims.map((d) => d.lowRate),
          barMaxWidth: 36,
          itemStyle: {
            borderRadius: [8, 8, 0, 0],
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#818cf8' },
              { offset: 1, color: '#4f46e5' },
            ]),
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
    const [p, c] = await Promise.all([getMyLearningProfile(), getMyClassWeak()])
    if (p.success) profile.value = p.data
    if (c.success) classWeak.value = c.data
    await renderBar()
  } finally {
    loading.value = false
  }
}

const onResize = () => chart?.resize()

onMounted(() => {
  load()
  window.addEventListener('resize', onResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  chart?.dispose()
})
</script>

<style scoped>
.page-learning {
  max-width: 1040px;
  margin: 0 auto;
}
.page-head {
  margin-bottom: 20px;
}
.page-title {
  margin: 0 0 8px;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--sg-text);
}
.page-desc {
  margin: 0;
  font-size: 14px;
  color: var(--sg-text-secondary);
}
.card-block {
  margin-bottom: 16px;
  border-radius: var(--sg-radius-lg);
}
.sub-h {
  margin: 16px 0 8px;
  font-size: 14px;
  color: var(--sg-text);
}
.list {
  margin: 0;
  padding-left: 18px;
  color: var(--sg-text-secondary);
  font-size: 13px;
  line-height: 1.6;
}
.stat-line {
  margin: 0 0 8px;
  font-size: 14px;
}
.muted {
  color: var(--sg-text-placeholder);
  font-size: 13px;
}
.chart-card .chart {
  height: 320px;
  width: 100%;
  transition: opacity 0.35s ease;
}
</style>
