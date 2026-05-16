<template>
  <div class="result-detail">
    <div class="header">
      <el-button type="primary" @click="$router.back()">返回</el-button>
      <h2>实训评价报告</h2>
      <el-button type="success" plain @click="exportPdf">导出 PDF</el-button>
    </div>

    <div v-if="result" class="content">
      <div class="info-card">
        <h3>基本信息</h3>
        <div class="info-row">
          <span class="label">任务名称：</span>
          <span>{{ result.title }}</span>
        </div>
        <div class="info-row">
          <span class="label">满分：</span>
          <span>{{ result.max_score }}分</span>
        </div>
        <div class="info-row">
          <span class="label">批改状态：</span>
          <el-tag :type="gradingStatusType(result.status)">{{ gradingStatusText(result.status) }}</el-tag>
        </div>
        <div class="info-row">
          <span class="label">提交时间：</span>
          <span>{{ formatDateTime(result.submitted_at) }}</span>
        </div>
      </div>

      <SubmissionWorkDisplay
        v-if="submissionWork"
        class="submission-work-wrap"
        :text="submissionWork.text"
        :file-name="submissionWork.fileName"
        :file-url="submissionWork.fileUrl"
        :file-type="submissionWork.fileType"
      />

      <div class="score-card">
        <h3>成绩概览</h3>
        <div class="score-row">
          <div class="score-item">
            <span class="score-label">AI 评分</span>
            <span class="score-value ai">{{ result.total_score }}</span>
          </div>
          <div v-if="result.human_score != null && result.human_score !== ''" class="score-item">
            <span class="score-label">教师评分</span>
            <span class="score-value teacher">{{ result.human_score }}</span>
          </div>
          <div class="score-item">
            <span class="score-label">综合得分</span>
            <span class="score-value final">{{ result.final_score ?? result.display_score ?? result.total_score }}</span>
          </div>
        </div>

        <div ref="radarRef" class="radar" />

        <div v-if="result.dimension_scores?.length" class="dimension-scores">
          <h4>维度得分</h4>
          <el-table :data="result.dimension_scores" border>
            <el-table-column prop="name" label="维度" />
            <el-table-column prop="score" label="得分" />
            <el-table-column prop="maxScore" label="满分" />
          </el-table>
        </div>
      </div>

      <div v-if="result.verification_result" class="verify-card">
        <h3>智能核查</h3>
        <p class="block-title">与任务要求对比</p>
        <p class="block-text">{{ result.verification_result.requirementComparison || '—' }}</p>
        <p class="block-title">校企标准对齐（岗位交付）</p>
        <p class="block-text">{{ result.verification_result.enterpriseAlignment || '—' }}</p>
        <p class="block-title">逻辑与问题</p>
        <ul>
          <li v-for="(it, i) in result.verification_result.logicIssues || []" :key="i">
            <strong>{{ it.title }}</strong> — {{ it.detail }}
          </li>
        </ul>
        <p class="block-title">步骤完整性</p>
        <p class="block-text">已覆盖：{{ (result.verification_result.stepCompleteness?.covered || []).join('、') || '—' }}</p>
        <p class="block-text">待补充：{{ (result.verification_result.stepCompleteness?.missing || []).join('、') || '—' }}</p>
        <p class="block-text">摘要：{{ result.verification_result.summary || '—' }}</p>
        <LangchainDeepPanel :verification-result="result.verification_result" />
      </div>

      <div class="comment-card">
        <h3>AI 评语</h3>
        <p>{{ result.ai_comment || '暂无评语' }}</p>
      </div>

      <div class="comment-card">
        <h3>问题分析</h3>
        <p>{{ result.ai_problems || '暂无问题分析' }}</p>
      </div>

      <div class="comment-card">
        <h3>改进建议</h3>
        <p>{{ result.ai_suggestions || '暂无改进建议' }}</p>
      </div>

      <div v-if="result.human_comment" class="comment-card">
        <h3>教师评语</h3>
        <p>{{ result.human_comment }}</p>
      </div>
    </div>

    <div v-else-if="submissionWork" class="content">
      <SubmissionWorkDisplay
        class="submission-work-wrap"
        :text="submissionWork.text"
        :file-name="submissionWork.fileName"
        :file-url="submissionWork.fileUrl"
        :file-type="submissionWork.fileType"
      />
      <el-empty description="暂无批改报告，您仍可查看上方已提交内容" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useRtOnDomains } from '../../composables/useRtOnDomains'
import { getGradingResult } from '../../api/grading'
import { getSubmissionById } from '../../api/submission'
import SubmissionWorkDisplay from '../../components/SubmissionWorkDisplay.vue'
import LangchainDeepPanel from '../../components/LangchainDeepPanel.vue'
import { mergeSubmissionWork, workFromGradingRow, workFromSubmissionApi } from '../../utils/submissionWorkMerge'
import { downloadPersonalPdf } from '../../api/report'
import { formatDateTime } from '../../utils/format'
import { gradingStatusType, gradingStatusText } from '../../utils/gradingStatusDisplay'
import { ElMessage } from 'element-plus'
import * as echarts from 'echarts'
import { buildRadarChartMeta } from '../../utils/echartsRadar'

const route = useRoute()
const result = ref(null)
const pendingSubmission = ref(null)
const submissionDetail = ref(null)
const radarRef = ref(null)
let radarChart = null

const submissionWork = computed(() => {
  const r = result.value
  const detail = submissionDetail.value
  if (r) {
    return mergeSubmissionWork(workFromGradingRow(r), workFromSubmissionApi(detail))
  }
  const p = pendingSubmission.value
  if (p) {
    return workFromSubmissionApi(p)
  }
  return null
})

const loadPendingSubmission = async () => {
  pendingSubmission.value = null
  try {
    const res = await getSubmissionById(route.params.submissionId)
    if (res.success) pendingSubmission.value = res.data
  } catch (_) {}
}

const loadSubmissionDetail = async () => {
  submissionDetail.value = null
  try {
    const res = await getSubmissionById(route.params.submissionId)
    if (res.success) submissionDetail.value = res.data
  } catch (_) {}
}

const loadResult = async () => {
  try {
    const response = await getGradingResult(route.params.submissionId)
    if (response.success && response.data) {
      pendingSubmission.value = null
      result.value = response.data
      await loadSubmissionDetail()
      await nextTick()
      renderRadar()
    } else if (response.success) {
      result.value = null
      await loadPendingSubmission()
      await loadSubmissionDetail()
    }
  } catch (error) {
    if (error?.response?.status !== 404) console.error(error)
    if (error?.response?.status === 404) {
      result.value = null
      await loadPendingSubmission()
      await loadSubmissionDetail()
    }
  }
}

const renderRadar = () => {
  if (!radarRef.value || !result.value?.dimension_scores?.length) return
  if (radarChart) radarChart.dispose()
  radarChart = echarts.init(radarRef.value)
  const dims = result.value.dimension_scores
  const { indicators, splitNumber } = buildRadarChartMeta(dims)
  radarChart.setOption({
    color: ['#1677ff'],
    tooltip: {},
    radar: {
      indicator: indicators,
      radius: '65%',
      splitNumber,
      axisName: { color: '#64748b' },
    },
    series: [
      {
        type: 'radar',
        data: [{ value: dims.map((d) => d.score), name: '我的得分' }],
        areaStyle: { opacity: 0.12 },
      },
    ],
  })
}

watch(
  () => result.value?.dimension_scores,
  async () => {
    if (!result.value?.dimension_scores?.length) return
    await nextTick()
    renderRadar()
  }
)

const exportPdf = async () => {
  try {
    await downloadPersonalPdf(route.params.submissionId)
    ElMessage.success('已开始下载')
  } catch (e) {
    ElMessage.error(e?.message || '导出失败')
  }
}

const onResize = () => radarChart?.resize()

useRtOnDomains(['grading', 'submissions', 'scores'], () => loadResult())

onMounted(() => {
  loadResult()
  window.addEventListener('resize', onResize)
})

onBeforeUnmount(() => {
  radarChart?.dispose()
  window.removeEventListener('resize', onResize)
})
</script>

<style scoped>
.result-detail {
  padding: 20px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  gap: 12px;
}

.header h2 {
  flex: 1;
  margin: 0;
  font-size: 20px;
  color: #0b3d6d;
  font-weight: 600;
}

.content {
  max-width: 960px;
}

.submission-work-wrap {
  margin-bottom: 16px;
}

.info-card,
.score-card,
.comment-card,
.verify-card {
  background: white;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 20px;
  box-shadow: 0 8px 24px rgba(15, 76, 129, 0.06);
}

.info-card h3,
.score-card h3,
.comment-card h3,
.verify-card h3 {
  margin: 0 0 16px;
  font-size: 16px;
  color: #0b3d6d;
  border-bottom: 1px solid #e8eef5;
  padding-bottom: 8px;
}

.info-row {
  margin-bottom: 12px;
}

.info-row .label {
  color: #64748b;
  margin-right: 8px;
}

.score-row {
  display: flex;
  gap: 32px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.score-item {
  text-align: center;
}

.score-label {
  display: block;
  font-size: 13px;
  color: #64748b;
  margin-bottom: 8px;
}

.score-value {
  font-size: 40px;
  font-weight: 700;
}

.score-value.ai {
  color: #1677ff;
}

.score-value.teacher {
  color: #0f766e;
}

.score-value.final {
  color: #b45309;
}

.radar {
  height: 300px;
  margin-bottom: 12px;
  /* 页面可滚动时减少触摸与滚动手势冲突（wheel 监听仍由 ECharts/zrender 注册） */
  touch-action: pan-y;
}

.dimension-scores h4 {
  font-size: 14px;
  color: #334155;
  margin: 0 0 12px;
}

.comment-card p {
  margin: 0;
  padding: 12px;
  background: #f8fafc;
  border-radius: 8px;
  color: #475569;
  line-height: 1.6;
}

.verify-card .block-title {
  font-weight: 600;
  color: #0b3d6d;
  margin: 12px 0 6px;
}

.verify-card .block-text,
.verify-card li {
  color: #475569;
  line-height: 1.6;
  font-size: 14px;
}
</style>
