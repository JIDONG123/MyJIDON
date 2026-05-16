<template>
  <div class="grading-detail">
    <div class="header">
      <el-button type="primary" @click="$router.back()">返回</el-button>
      <h2>批改与智能核查</h2>
      <el-button v-if="result" type="success" plain @click="exportPdf">导出评价 PDF</el-button>
    </div>

    <el-skeleton v-if="pageLoading" animated :rows="8" class="page-skeleton" />

    <div v-else-if="missingResult" class="empty-state">
      <div
        v-if="submissionMeta?.submit_used_count != null && submissionMeta?.task_max_submissions != null"
        class="info-card info-card--inline"
      >
        <div class="info-row">
          <span class="label">提交次数：</span>
          <span>已提交 {{ submissionMeta.submit_used_count }} / 最大 {{ submissionMeta.task_max_submissions }} 次</span>
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
      <el-empty description="暂无批改结果">
        <template #default>
          <p class="empty-hint">
            该提交尚未生成 AI 批改记录。大模型批改耗时较长，请先在列表中点击「AI批改」并等待完成，或点击下方按钮在此页发起批改。
          </p>
          <el-button type="primary" @click="runAiGrade">发起 AI 批改</el-button>
          <el-button @click="$router.back()">返回提交列表</el-button>
        </template>
      </el-empty>
    </div>

    <div v-else-if="loadError" class="empty-state">
      <el-alert :title="loadError" type="error" show-icon :closable="false" />
      <el-button type="primary" style="margin-top: 16px" @click="retryLoad">重新加载</el-button>
    </div>

    <div v-else-if="result" class="content">
      <div class="info-card">
        <h3>基本信息</h3>
        <div class="info-row">
          <span class="label">学生姓名：</span>
          <span>{{ result.student_name }}</span>
        </div>
        <div class="info-row">
          <span class="label">任务名称：</span>
          <span>{{ result.title }}</span>
        </div>
        <div class="info-row">
          <span class="label">批改状态：</span>
          <el-tag :type="getStatusType(result.status)">{{ getStatusText(result.status) }}</el-tag>
        </div>
        <div class="info-row">
          <span class="label">综合得分：</span>
          <span class="final">{{ result.final_score ?? result.display_score ?? result.total_score }}</span>
          <span class="hint">（教师复核后按权重计算）</span>
        </div>
        <div
          v-if="result.submit_used_count != null && result.task_max_submissions != null"
          class="info-row"
        >
          <span class="label">提交次数：</span>
          <span>已提交 {{ result.submit_used_count }} / 最大 {{ result.task_max_submissions }} 次</span>
        </div>
        <div v-if="submissionMeta" class="info-row sim-row">
          <span class="label">查重：</span>
          <span v-if="submissionMeta.max_similarity != null"
            >最高相似度 {{ Number(submissionMeta.max_similarity).toFixed(1) }}%</span
          >
          <span v-else>—</span>
          <el-tag v-if="submissionMeta.similarity_level === 'high'" type="danger" size="small" class="ml8">疑似抄袭</el-tag>
          <el-tag v-else-if="submissionMeta.similarity_level === 'warn'" type="warning" size="small" class="ml8">预警</el-tag>
          <el-button
            v-if="submissionMeta.max_similarity != null && Number(submissionMeta.max_similarity) > 0"
            type="primary"
            link
            class="ml8"
            @click="goSimilarity"
            >查重对比</el-button
          >
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

      <div class="charts-row">
        <div class="score-card stretch">
          <h3>AI 批改与维度得分</h3>
          <div class="total-score">
            <div>
              <span class="score-label">AI 评分</span>
              <span class="score-value">{{ result.total_score }}</span>
            </div>
            <div v-if="result.human_score != null && result.human_score !== ''">
              <span class="score-label">教师评分</span>
              <span class="score-value secondary">{{ result.human_score }}</span>
            </div>
          </div>

          <div v-if="result.dimension_scores?.length" class="dimension-scores">
            <h4>维度得分</h4>
            <el-table :data="result.dimension_scores" border>
              <el-table-column prop="name" label="维度" />
              <el-table-column prop="score" label="得分" />
              <el-table-column prop="maxScore" label="满分" />
            </el-table>
          </div>

          <div ref="radarRef" class="radar" />

          <div class="comment-section">
            <h4>AI 评语</h4>
            <p>{{ result.ai_comment }}</p>
          </div>
          <div class="comment-section">
            <h4>问题分析</h4>
            <p>{{ result.ai_problems }}</p>
          </div>
          <div class="comment-section">
            <h4>改进建议</h4>
            <p>{{ result.ai_suggestions }}</p>
          </div>
        </div>

        <div class="verify-card">
          <h3>智能核查结果</h3>
          <template v-if="result.verification_result">
            <div class="block">
              <h4>与实训要求对比</h4>
              <p>{{ result.verification_result.requirementComparison || '—' }}</p>
            </div>
            <div class="block">
              <h4>校企标准对齐（岗位交付）</h4>
              <p>{{ result.verification_result.enterpriseAlignment || '—' }}</p>
            </div>
            <div class="block">
              <h4>逻辑与错误识别</h4>
              <ul>
                <li v-for="(it, i) in result.verification_result.logicIssues || []" :key="i">
                  <strong>{{ it.title }}</strong>：{{ it.detail }}
                </li>
              </ul>
            </div>
            <div class="block">
              <h4>实训步骤完整性</h4>
              <p>覆盖：{{ (result.verification_result.stepCompleteness?.covered || []).join('、') || '—' }}</p>
              <p>缺失：{{ (result.verification_result.stepCompleteness?.missing || []).join('、') || '—' }}</p>
              <p>步骤得分（0-100）：{{ result.verification_result.stepCompleteness?.score ?? '—' }}</p>
            </div>
            <div class="block">
              <h4>核查摘要</h4>
              <p>{{ result.verification_result.summary || '—' }}</p>
            </div>
            <div v-if="result.verification_result?.codeStyleReview" class="block">
              <h4>代码规范审查</h4>
              <pre class="code-style-pre">{{ formatCodeStyle(result.verification_result.codeStyleReview) }}</pre>
            </div>
            <LangchainDeepPanel :verification-result="result.verification_result" />
          </template>
          <el-empty v-else description="暂无核查数据，请先执行 AI 批改" />
        </div>
      </div>

      <div class="review-card override-card">
        <VerificationTeacherOverridePanel
          :key="String(route.params.submissionId)"
          :submission-id="route.params.submissionId"
          :task-id="result.task_id ?? null"
          :verification-result="result.verification_result"
          :initial-override="result.verification_teacher_override"
          @saved="() => loadResult({ showSkeleton: false })"
        />
      </div>

      <div class="review-card">
        <h3>教师主观评分</h3>
        <el-form :model="reviewForm" label-width="100px">
          <el-form-item label="复核分数">
            <el-input v-model.number="reviewForm.humanScore" type="number" placeholder="可覆盖/微调综合结果" />
          </el-form-item>
          <el-form-item label="复核评语">
            <el-input v-model="reviewForm.humanComment" type="textarea" :rows="4" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="submitReview">提交复核</el-button>
          </el-form-item>
        </el-form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getGradingResult, humanReview, aiGradeSubmission, waitForAiGradingComplete } from '../../api/grading'
import VerificationTeacherOverridePanel from '../../components/VerificationTeacherOverridePanel.vue'
import LangchainDeepPanel from '../../components/LangchainDeepPanel.vue'
import SubmissionWorkDisplay from '../../components/SubmissionWorkDisplay.vue'
import { getSubmissionById } from '../../api/submission'
import { withGradingLoading } from '../../utils/gradingLoading'
import { downloadPersonalPdf } from '../../api/report'
import { mergeSubmissionWork, workFromGradingRow, workFromSubmissionApi } from '../../utils/submissionWorkMerge'
import { ElMessage } from 'element-plus'
import * as echarts from 'echarts'
import { buildRadarChartMeta } from '../../utils/echartsRadar'
import { useRtOnDomains } from '../../composables/useRtOnDomains'

const route = useRoute()
const router = useRouter()
const result = ref(null)
const submissionMeta = ref(null)
const radarRef = ref(null)
let radarChart = null

const pageLoading = ref(true)
const missingResult = ref(false)
const loadError = ref('')
const pendingSubmission = ref(null)

const submissionWork = computed(() => {
  const r = result.value
  const meta = submissionMeta.value
  if (r) {
    return mergeSubmissionWork(workFromGradingRow(r), workFromSubmissionApi(meta))
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

const reviewForm = reactive({
  humanScore: '',
  humanComment: '',
})

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
        data: [{ value: dims.map((d) => d.score), name: '得分' }],
        areaStyle: { opacity: 0.12 },
      },
    ],
  })
}

watch(
  () => result.value?.dimension_scores,
  async () => {
    await nextTick()
    renderRadar()
  }
)

const loadSubmissionMeta = async () => {
  submissionMeta.value = null
  try {
    const res = await getSubmissionById(route.params.submissionId)
    if (res.success) submissionMeta.value = res.data
  } catch (_) {}
}

const goSimilarity = () => {
  const tid = result.value?.task_id
  if (!tid) return
  router.push(`/teacher/submissions/${tid}/similarity/${route.params.submissionId}`)
}

const formatCodeStyle = (obj) => {
  try {
    return JSON.stringify(obj, null, 2)
  } catch {
    return String(obj)
  }
}

const loadResult = async (opts = {}) => {
  const { showSkeleton = false } = opts
  if (showSkeleton) pageLoading.value = true
  missingResult.value = false
  loadError.value = ''
  try {
    const response = await getGradingResult(route.params.submissionId)
    if (response.success) {
      if (!response.data) {
        result.value = null
        missingResult.value = true
        await loadPendingSubmission()
        await loadSubmissionMeta()
        await nextTick()
        return
      }
      pendingSubmission.value = null
      result.value = response.data
      if (result.value.human_score != null && result.value.human_score !== '') {
        reviewForm.humanScore = result.value.human_score
      }
      if (result.value.human_comment) {
        reviewForm.humanComment = result.value.human_comment
      }
      await loadSubmissionMeta()
      await nextTick()
      renderRadar()
    }
  } catch (error) {
    if (error?.response?.status === 404) {
      result.value = null
      missingResult.value = true
      await loadPendingSubmission()
      await loadSubmissionMeta()
    } else {
      loadError.value =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        '获取批改结果失败'
      ElMessage.error(loadError.value)
    }
    console.error('获取批改结果失败:', error)
  } finally {
    if (showSkeleton) pageLoading.value = false
  }
}

const retryLoad = () => loadResult({ showSkeleton: true })

const runAiGrade = async () => {
  try {
    const res = await withGradingLoading(
      false,
      async () => {
        const res = await aiGradeSubmission(route.params.submissionId)
        if (!res.success) return res
        if (res.data?.async) {
          ElMessage.success('已提交 AI 批改，后台处理中…')
          await loadResult({ showSkeleton: false })
          const wait = await waitForAiGradingComplete(route.params.submissionId)
          await loadResult({ showSkeleton: false })
          if (wait.failed) {
            ElMessage.error(wait.data?.ai_comment || 'AI 批改失败')
            return res
          }
          if (wait.ok && !wait.timeout) {
            ElMessage.success('AI 批改完成')
          } else if (wait.timeout) {
            ElMessage.warning('批改等待超时，请稍后刷新页面查看结果')
          }
        } else {
          ElMessage.success('AI 批改完成')
          await loadResult({ showSkeleton: false })
        }
        return res
      },
      true
    )
    if (!res || !res.success) return
  } catch (error) {
    const msg =
      error?.response?.data?.message ||
      error?.response?.data?.error ||
      error?.message ||
      'AI 批改失败'
    ElMessage.error(msg)
  }
}

const getStatusType = (status) => {
  const types = {
    pending: 'info',
    ai_grading: 'warning',
    ai_failed: 'danger',
    ai_graded: 'warning',
    human_graded: 'success',
  }
  return types[status] || 'info'
}

const getStatusText = (status) => {
  const texts = {
    pending: '待批改',
    ai_grading: 'AI批改中',
    ai_failed: '批改失败',
    ai_graded: 'AI已批改',
    human_graded: '人工已复核',
  }
  return texts[status] || status
}

const submitReview = async () => {
  const h = reviewForm.humanScore
  if (h === '' || h === null || h === undefined || Number.isNaN(Number(h))) {
    ElMessage.error('请输入有效的复核分数')
    return
  }

  try {
    const response = await humanReview(route.params.submissionId, {
      humanScore: reviewForm.humanScore,
      humanComment: reviewForm.humanComment,
    })
    if (response.success) {
      ElMessage.success('复核成功')
      loadResult({ showSkeleton: false })
    }
  } catch (error) {
    ElMessage.error('复核失败')
    console.error(error)
  }
}

const exportPdf = async () => {
  try {
    await downloadPersonalPdf(route.params.submissionId)
    ElMessage.success('已开始下载')
  } catch (e) {
    ElMessage.error(e?.message || '导出失败')
  }
}

const onResize = () => radarChart?.resize()

onMounted(() => {
  loadResult({ showSkeleton: true })
  window.addEventListener('resize', onResize)
})

useRtOnDomains(['grading', 'submissions'], (p) => {
  const sid = route.params.submissionId
  if (p.submissionId != null && String(p.submissionId) !== String(sid)) return
  void loadResult({ showSkeleton: false })
})

onBeforeUnmount(() => {
  radarChart?.dispose()
  window.removeEventListener('resize', onResize)
})
</script>

<style scoped>
.grading-detail {
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
  font-size: 20px;
  color: #0b3d6d;
  margin: 0;
  font-weight: 600;
}

.content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.submission-work-wrap {
  margin-bottom: 4px;
}

.info-card--inline {
  margin-bottom: 16px;
}

.info-card--inline h3 {
  display: none;
}

.charts-row {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 20px;
}

@media (max-width: 1100px) {
  .charts-row {
    grid-template-columns: 1fr;
  }
}

.info-card,
.score-card,
.verify-card,
.review-card {
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 8px 24px rgba(15, 76, 129, 0.06);
}

.stretch {
  min-width: 0;
}

.info-card h3,
.score-card h3,
.verify-card h3,
.review-card h3 {
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

.final {
  font-weight: 700;
  color: #1677ff;
  font-size: 18px;
}

.hint {
  margin-left: 8px;
  font-size: 12px;
  color: #94a3b8;
}

.total-score {
  display: flex;
  gap: 32px;
  justify-content: center;
  margin-bottom: 16px;
  text-align: center;
}

.score-label {
  display: block;
  font-size: 13px;
  color: #64748b;
  margin-bottom: 6px;
}

.score-value {
  font-size: 40px;
  font-weight: 700;
  color: #1677ff;
}

.score-value.secondary {
  color: #0f766e;
}

.radar {
  height: 320px;
  margin-top: 8px;
}

.dimension-scores h4 {
  font-size: 14px;
  color: #334155;
  margin: 0 0 12px;
}

.comment-section {
  margin-top: 16px;
}

.comment-section h4 {
  font-size: 14px;
  color: #334155;
  margin: 0 0 8px;
}

.comment-section p {
  margin: 0;
  padding: 12px;
  background: #f8fafc;
  border-radius: 8px;
  color: #475569;
  line-height: 1.6;
}

.verify-card .block {
  margin-bottom: 14px;
}

.verify-card h4 {
  margin: 0 0 6px;
  font-size: 13px;
  color: #0b3d6d;
}

.verify-card p,
.verify-card li {
  font-size: 13px;
  color: #475569;
  line-height: 1.6;
}

.page-skeleton {
  margin-top: 20px;
}

.empty-state {
  margin-top: 32px;
  padding: 24px;
  background: white;
  border-radius: 12px;
  text-align: center;
}

.empty-hint {
  max-width: 520px;
  margin: 0 auto 20px;
  color: #64748b;
  line-height: 1.6;
  font-size: 14px;
}

.ml8 {
  margin-left: 8px;
}

.sim-row {
  align-items: center;
}

.override-card .hint-small {
  font-size: 12px;
  color: #94a3b8;
  margin: 0 0 8px;
}

.code-style-pre {
  margin: 0;
  padding: 12px;
  background: #0f172a;
  color: #e2e8f0;
  border-radius: 8px;
  font-size: 12px;
  overflow: auto;
  max-height: 240px;
}
</style>
