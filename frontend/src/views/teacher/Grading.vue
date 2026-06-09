<template>
  <div class="grading-workbench">
    <el-skeleton v-if="pageLoading" animated :rows="10" class="page-skeleton" />

    <div v-else-if="loadError" class="state-card">
      <el-alert :title="loadError" type="error" show-icon :closable="false" />
      <el-button type="primary" class="state-action" @click="retryLoad">重新加载</el-button>
    </div>

    <div v-else-if="missingResult" class="state-card">
      <header class="overview-bar overview-bar--minimal">
        <div class="overview-main">
          <h1 class="workbench-title">AI 批改复核工作台</h1>
          <p class="workbench-sub">该提交尚未生成 AI 批改记录</p>
        </div>
        <div class="overview-actions">
          <el-button @click="$router.back()">返回</el-button>
          <el-button plain @click="openSubmissionHistory">查看历史版本</el-button>
          <el-button type="primary" @click="runAiGrade">发起 AI 批改</el-button>
        </div>
      </header>
      <div class="workbench-grid workbench-grid--single">
        <section class="panel-card">
          <h2 class="panel-title">学生提交内容</h2>
          <SubmissionWorkDisplay
            v-if="submissionWork"
            :text="submissionWork.text"
            :code-content="submissionWork.codeContent"
            :code-language="submissionWork.codeLanguage"
            :attachments="submissionWork.attachments"
            :file-name="submissionWork.fileName"
            :file-url="submissionWork.fileUrl"
            :file-type="submissionWork.fileType"
            collapse-long-text
          />
          <VlRecognitionPanel
            :submission-id="route.params.submissionId"
            :initial="submissionMeta"
            variant="report"
          />
          <SubmissionCodeRunPanel :code-run="submissionMeta?.codeRun" />
        </section>
      </div>
    </div>

    <template v-else-if="result">
      <el-alert
        v-if="safetyHint"
        type="warning"
        :closable="false"
        show-icon
        class="safety-alert"
        :title="safetyHint"
      />
      <!-- 顶部批改概览 -->
      <header class="overview-bar">
        <div class="overview-main">
          <p class="overview-kicker">AI 批改与智能核查 · 教师复核</p>
          <h1 class="workbench-title">{{ result.title || '—' }}</h1>
          <div class="overview-meta">
            <span>{{ result.student_name || '—' }}</span>
            <span class="meta-sep">·</span>
            <span>{{ classLabel }}</span>
            <span class="meta-sep">·</span>
            <el-tag :type="getStatusType(result.status)" size="small">{{ getStatusText(result.status) }}</el-tag>
          </div>
        </div>
        <div class="overview-stats">
          <div class="stat-item">
            <span class="stat-label">AI 评分</span>
            <span class="stat-value">{{ displayNum(result.total_score) }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">教师评分</span>
            <span class="stat-value stat-value--teacher">{{ displayNum(result.human_score) }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">综合分</span>
            <span class="stat-value stat-value--final">{{ displayNum(finalScoreText) }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">查重率</span>
            <span class="stat-value" :class="similarityClass">{{ similarityText }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">提交次数</span>
            <span class="stat-value stat-value--plain">{{ submitCountText }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">提交时间</span>
            <span class="stat-value stat-value--plain stat-value--time">{{ formatDateTime(result.submitted_at) }}</span>
          </div>
        </div>
        <div class="overview-actions">
          <el-button @click="$router.back()">返回</el-button>
          <el-button plain @click="openSubmissionHistory">查看历史版本</el-button>
          <el-button
            v-if="showRegradeButton"
            plain
            :loading="regrading"
            @click="runForceRegrade"
          >
            重新 AI 批改
          </el-button>
          <el-button v-if="showRetryButton" type="warning" plain :loading="regrading" @click="runAiGrade">
            重试 AI 批改
          </el-button>
          <el-button plain @click="exportPdf">导出评价 PDF</el-button>
          <el-button type="primary" @click="scrollToReview">提交复核</el-button>
        </div>
      </header>

      <!-- 首屏三栏：摘要+修正 / 智能核查 / 最终复核（三栏等高） -->
      <div class="hero-grid">
        <!-- 左：学生提交摘要 + 教师修正核查（步骤区可滚动） -->
        <aside class="col-left hero-col">
          <section class="panel-card panel-card--summary">
            <h2 class="panel-title">学生提交摘要</h2>
            <SubmissionSummaryCard
              :student-name="result.student_name"
              :class-name="classLabel"
              :submitted-at="result.submitted_at"
              :work-text="submissionWork?.text"
              :file-name="submissionWork?.fileName"
              :file-url="submissionWork?.fileUrl"
              :file-type="submissionWork?.fileType"
              :vl-meta="submissionMeta?.vl_recognition_meta"
              :vl-plain-text="submissionMeta?.vl_recognition_text"
            />
          </section>

          <section class="panel-card panel-card--action correction-panel">
            <div class="panel-head-accent">
              <h2 class="panel-title panel-title--accent">教师修正核查</h2>
              <el-tag type="warning" effect="plain" size="small">需确认</el-tag>
            </div>
            <VerificationStepChecklistPanel
              v-if="result.verification_result"
              :key="'corr-' + route.params.submissionId"
              variant="correction"
              :submission-id="route.params.submissionId"
              :task-id="result.task_id ?? null"
              :verification-result="result.verification_result"
              :initial-override="result.verification_teacher_override"
              @saved="() => loadResult({ showSkeleton: false })"
            />
            <p v-else class="empty-inline">暂无核查数据，无法修正</p>
          </section>
        </aside>

        <!-- 中：智能核查结果 -->
        <main class="col-center hero-col">
          <section class="panel-card panel-card--focus hero-col__panel">
            <div class="panel-head-accent">
              <h2 class="panel-title panel-title--accent">智能核查结果</h2>
              <el-tag type="primary" effect="plain" size="small">AI 分析</el-tag>
            </div>
            <div class="hero-col__scroll hero-col__scroll--soft">
              <template v-if="result.verification_result">
                <div class="verify-block">
                  <h3 class="verify-label">与任务要求对比</h3>
                  <p class="verify-text">{{ friendlyText(result.verification_result.requirementComparison) }}</p>
                </div>
                <div class="verify-block">
                  <h3 class="verify-label">逻辑与错误识别</h3>
                  <ul v-if="logicIssues.length" class="issue-list">
                    <li v-for="(it, i) in logicIssues" :key="i">
                      <el-tag size="small" type="warning" effect="plain">{{ it.title || '问题' }}</el-tag>
                      <span>{{ it.detail || '—' }}</span>
                    </li>
                  </ul>
                  <p v-else class="empty-inline">暂未发现明显逻辑问题</p>
                </div>
                <div class="verify-block">
                  <h3 class="verify-label">步骤完成度</h3>
                  <VerificationStepChecklistPanel
                    variant="summary"
                    :submission-id="route.params.submissionId"
                    :task-id="result.task_id ?? null"
                    :verification-result="result.verification_result"
                    :initial-override="result.verification_teacher_override"
                  />
                </div>
                <div v-if="result.verification_result.summary" class="verify-block verify-block--summary">
                  <h3 class="verify-label">核查摘要</h3>
                  <p class="verify-text">{{ result.verification_result.summary }}</p>
                </div>
                <div v-if="result.dimension_scores?.length" class="verify-block verify-block--last">
                  <h3 class="verify-label">维度得分</h3>
                  <el-table :data="result.dimension_scores" size="small" border class="dim-table">
                    <el-table-column prop="name" label="维度" min-width="100" />
                    <el-table-column label="得分" width="100" align="center">
                      <template #default="{ row }">{{ row.score ?? '—' }} / {{ row.maxScore ?? '—' }}</template>
                    </el-table-column>
                    <el-table-column label="完成度" width="90" align="center">
                      <template #default="{ row }">{{ dimPercent(row) }}%</template>
                    </el-table-column>
                  </el-table>
                </div>
              </template>
              <el-empty v-else description="暂无核查数据，请先执行 AI 批改" :image-size="64" />
            </div>
          </section>
        </main>

        <!-- 右：最终复核（教师打分） -->
        <aside id="review-panel" class="col-right hero-col">
          <section class="panel-card review-card hero-col__panel">
            <h2 class="panel-title">最终复核</h2>
            <div class="hero-col__scroll hero-col__scroll--soft">
              <el-form :model="reviewForm" label-position="top" class="review-form">
                <el-form-item label="AI 建议分">
                  <div class="ai-suggest-score">{{ displayNum(result.total_score) }}</div>
                </el-form-item>
                <el-form-item label="教师复核分" required>
                  <el-input-number
                    v-model="reviewForm.humanScore"
                    :min="0"
                    :max="999"
                    :step="0.5"
                    controls-position="right"
                    class="field-full"
                    placeholder="请填写"
                  />
                </el-form-item>
                <el-form-item label="复核评语">
                  <el-input v-model="reviewForm.humanComment" type="textarea" :rows="3" placeholder="填写复核评语" />
                  <p v-if="needsAdjustReason" class="field-warn">与 AI 分相差超过 10 分，请在评语中说明原因</p>
                  <div class="quick-comments">
                    <span class="quick-label">快捷评语</span>
                    <div class="quick-btns">
                      <el-button
                        v-for="q in quickComments"
                        :key="q.label"
                        size="small"
                        plain
                        @click="appendQuickComment(q)"
                      >
                        {{ q.label }}
                      </el-button>
                    </div>
                  </div>
                </el-form-item>
              </el-form>
              <div class="review-actions">
                <el-button plain @click="saveDraftLocal">保存草稿</el-button>
                <el-button type="primary" :loading="submitting" @click="submitReview">提交复核</el-button>
                <el-button plain @click="clearReviewForm">清除修改</el-button>
              </div>
              <div v-if="submissionMeta?.max_similarity != null && Number(submissionMeta.max_similarity) > 0" class="sim-link">
                <el-button link type="primary" @click="goSimilarity">查看查重对比</el-button>
              </div>
            </div>
          </section>
        </aside>
      </div>

      <!-- 下方：原始材料与深度分析 -->
      <section class="secondary-zone">
        <h2 class="zone-title">原始材料与深度分析</h2>
        <p class="zone-desc">以下为完整提交内容与 AI 深度分析，供需要时查阅。</p>
        <el-collapse v-model="secondaryOpen" class="secondary-collapse">
          <el-collapse-item title="学生提交全文与附件" name="submit">
            <SubmissionWorkDisplay
              v-if="submissionWork"
              :text="submissionWork.text"
              :code-content="submissionWork.codeContent"
              :code-language="submissionWork.codeLanguage"
              :attachments="submissionWork.attachments"
              :file-name="submissionWork.fileName"
              :file-url="submissionWork.fileUrl"
              :file-type="submissionWork.fileType"
              collapse-long-text
            />
            <el-empty v-else description="暂无提交内容" :image-size="64" />
          </el-collapse-item>
          <el-collapse-item title="图片识别 OCR 全文（Qwen-VL）" name="vl">
            <VlRecognitionPanel
              :submission-id="route.params.submissionId"
              :initial="submissionMeta"
              variant="report"
              @updated="loadSubmissionMeta"
            />
          </el-collapse-item>
          <el-collapse-item title="代码运行检查" name="coderun">
            <SubmissionCodeRunPanel :code-run="submissionMeta?.codeRun" />
          </el-collapse-item>
          <el-collapse-item title="AI 批改详情（评语 / 问题 / 建议）" name="ai">
            <div class="text-block">
              <h3 class="block-label">AI 评语</h3>
              <p class="block-content">{{ friendlyText(result.ai_comment) }}</p>
            </div>
            <div class="text-block">
              <h3 class="block-label">问题分析</h3>
              <p class="block-content">{{ friendlyText(result.ai_problems, '暂未发现明显问题') }}</p>
            </div>
            <div class="text-block">
              <h3 class="block-label">改进建议</h3>
              <p class="block-content">{{ friendlyText(result.ai_suggestions) }}</p>
            </div>
            <div v-if="result.verification_result?.enterpriseAlignment" class="text-block">
              <h3 class="block-label">校企标准对齐</h3>
              <p class="block-content">{{ friendlyText(result.verification_result.enterpriseAlignment) }}</p>
            </div>
            <div v-if="result.verification_result?.codeStyleReview" class="text-block">
              <h3 class="block-label">代码规范审查</h3>
              <pre class="code-block">{{ formatCodeStyle(result.verification_result.codeStyleReview) }}</pre>
            </div>
          </el-collapse-item>
          <el-collapse-item v-if="hasLangchainDeep" title="AI 深度分析过程" name="lc">
            <LangchainDeepPanel :verification-result="result.verification_result" />
          </el-collapse-item>
          <el-collapse-item title="知识图谱参考（只读）" name="kg">
            <KgGradingEnhancePanel :submission-id="route.params.submissionId" />
          </el-collapse-item>
          <el-collapse-item v-if="result.dimension_scores?.length" title="维度雷达图" name="radar">
            <div ref="radarRef" class="radar-chart" />
          </el-collapse-item>
        </el-collapse>
      </section>
    </template>
    <SubmissionHistoryDialog ref="historyDialogRef" :submission-id="route.params.submissionId" />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getGradingResult, humanReview, aiGradeSubmission } from '../../api/grading'
import VerificationStepChecklistPanel from '../../components/VerificationStepChecklistPanel.vue'
import LangchainDeepPanel from '../../components/LangchainDeepPanel.vue'
import SubmissionSummaryCard from '../../components/SubmissionSummaryCard.vue'
import SubmissionWorkDisplay from '../../components/SubmissionWorkDisplay.vue'
import VlRecognitionPanel from '../../components/VlRecognitionPanel.vue'
import SubmissionCodeRunPanel from '../../components/codeRunner/SubmissionCodeRunPanel.vue'
import KgGradingEnhancePanel from '../../components/kg/KgGradingEnhancePanel.vue'
import SubmissionHistoryDialog from '../../components/SubmissionHistoryDialog.vue'
import { getSubmissionById } from '../../api/submission'
import { applyGradingJobResponse, gradingJobErrorMessage } from '../../utils/gradingJobSubmit'
import { downloadPersonalPdf } from '../../api/report'
import { mergeSubmissionWork, workFromGradingRow, workFromSubmissionApi } from '../../utils/submissionWorkMerge'
import { formatDateTime } from '../../utils/format'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as echarts from 'echarts'
import { buildRadarChartMeta } from '../../utils/echartsRadar'
import { useRtOnDomains } from '../../composables/useRtOnDomains'
import { safetyStatusHint } from '../../utils/contentSafety'

const SCORE_DIFF_THRESHOLD = 10

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
const regrading = ref(false)
const submitting = ref(false)
const historyDialogRef = ref(null)
const secondaryOpen = ref([])

const quickComments = [
  { label: '优秀', text: '优秀，完成度高，代码规范。' },
  { label: '基本完成', text: '基本完成任务要求，仍有改进空间。' },
  { label: '需补充文档', text: '请补充设计文档与说明材料。' },
  { label: '需补充截图', text: '请补充运行截图或操作过程截图。' },
  { label: '代码需优化', text: '代码结构需优化，请注意规范与可读性。' },
  { label: '运行结果不完整', text: '运行结果展示不完整，请补充验证材料。' },
]

const reviewForm = reactive({
  humanScore: null,
  humanComment: '',
})

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

const classLabel = computed(() => {
  const q = route.query.className
  if (q) return String(q)
  return '—'
})

const safetyHint = computed(() => {
  const st = submissionMeta.value?.safety_status
  const reason = submissionMeta.value?.safety_reason
  const hint = safetyStatusHint(st)
  if (hint && reason && st === 'pending_review') {
    return `${hint}（${reason}）`
  }
  return hint
})

const finalScoreText = computed(() =>
  result.value?.final_score ?? result.value?.display_score ?? result.value?.total_score
)

const similarityText = computed(() => {
  const v = submissionMeta.value?.max_similarity ?? result.value?.max_similarity
  if (v == null) return '—'
  return `${Number(v).toFixed(1)}%`
})

const similarityClass = computed(() => {
  const level = submissionMeta.value?.similarity_level
  if (level === 'high') return 'stat-value--danger'
  if (level === 'warn') return 'stat-value--warn'
  return ''
})

const submitCountText = computed(() => {
  const used = result.value?.submit_used_count ?? submissionMeta.value?.submit_used_count
  const max = result.value?.task_max_submissions ?? submissionMeta.value?.task_max_submissions
  if (used == null || max == null) return '—'
  return `${used} / ${max}`
})

const logicIssues = computed(() => {
  const list = result.value?.verification_result?.logicIssues
  return Array.isArray(list) ? list : []
})

const hasLangchainDeep = computed(() => !!result.value?.verification_result?.langchainDeep)

const aiScoreNum = computed(() => {
  const n = Number(result.value?.total_score)
  return Number.isFinite(n) ? n : null
})

const needsAdjustReason = computed(() => {
  if (aiScoreNum.value == null) return false
  const h = Number(reviewForm.humanScore)
  if (!Number.isFinite(h)) return false
  return Math.abs(h - aiScoreNum.value) > SCORE_DIFF_THRESHOLD
})

const draftKey = computed(() => `grading-review-draft-${route.params.submissionId}`)

function displayNum(v) {
  if (v == null || v === '') return '—'
  return v
}

function friendlyText(v, fallback = '—') {
  const s = v == null ? '' : String(v).trim()
  return s || fallback
}

function dimPercent(dim) {
  const score = Number(dim.score)
  const max = Number(dim.maxScore)
  if (!Number.isFinite(score) || !Number.isFinite(max) || max <= 0) return 0
  return Math.min(100, Math.round((score / max) * 100))
}

function appendQuickComment(q) {
  const t = q.text
  if (!reviewForm.humanComment.trim()) {
    reviewForm.humanComment = t
  } else if (!reviewForm.humanComment.includes(t)) {
    reviewForm.humanComment = `${reviewForm.humanComment.trim()}\n${t}`
  }
}

function scrollToReview() {
  document.getElementById('review-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function initReviewFormFromResult() {
  const r = result.value
  if (!r) return
  if (r.human_score != null && r.human_score !== '') {
    reviewForm.humanScore = Number(r.human_score)
  } else {
    reviewForm.humanScore = null
  }
  reviewForm.humanComment = r.human_comment ? String(r.human_comment) : ''
  loadDraftLocal()
}

function loadDraftLocal() {
  try {
    const raw = localStorage.getItem(draftKey.value)
    if (!raw) return
    const d = JSON.parse(raw)
    if (d.humanScore != null && d.humanScore !== '') reviewForm.humanScore = d.humanScore
    if (d.humanComment != null) reviewForm.humanComment = d.humanComment
  } catch (_) {}
}

function saveDraftLocal() {
  try {
    localStorage.setItem(
      draftKey.value,
      JSON.stringify({
        humanScore: reviewForm.humanScore,
        humanComment: reviewForm.humanComment,
      })
    )
    ElMessage.success('草稿已保存到本地')
  } catch (_) {
    ElMessage.error('草稿保存失败')
  }
}

function clearReviewForm() {
  try {
    localStorage.removeItem(draftKey.value)
  } catch (_) {}
  reviewForm.humanScore = null
  reviewForm.humanComment = ''
  ElMessage.info('已清除复核表单')
}

const renderRadar = () => {
  if (!radarRef.value || !result.value?.dimension_scores?.length) return
  if (radarChart) radarChart.dispose()
  radarChart = echarts.init(radarRef.value)
  const dims = result.value.dimension_scores
  const { indicators, splitNumber } = buildRadarChartMeta(dims)
  radarChart.setOption({
    color: ['#1D5FD6'],
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
        areaStyle: { opacity: 0.1 },
      },
    ],
  })
}

watch(
  () => result.value?.dimension_scores,
  async () => {
    await nextTick()
    if (secondaryOpen.value.includes('radar')) renderRadar()
  }
)

watch(secondaryOpen, async (names) => {
  if (names.includes('radar')) {
    await nextTick()
    renderRadar()
  }
})

const loadPendingSubmission = async () => {
  pendingSubmission.value = null
  try {
    const res = await getSubmissionById(route.params.submissionId)
    if (res.success) pendingSubmission.value = res.data
  } catch (_) {}
}

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
      initReviewFormFromResult()
      await loadSubmissionMeta()
      await nextTick()
      if (secondaryOpen.value.includes('radar')) renderRadar()
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

function openSubmissionHistory() {
  historyDialogRef.value?.open()
}

const currentGradingStatus = computed(() => result.value?.status || null)

const showRegradeButton = computed(() =>
  ['ai_graded', 'human_graded'].includes(currentGradingStatus.value)
)

const showRetryButton = computed(() =>
  ['ai_failed', 'ai_grading'].includes(currentGradingStatus.value)
)

const runAiGrade = async () => {
  regrading.value = true
  try {
    const res = await aiGradeSubmission(route.params.submissionId)
    if (!res.success) {
      ElMessage.error(res.message || '提交失败')
      return
    }
    applyGradingJobResponse(res, { submissionId: route.params.submissionId })
    if (result.value) {
      result.value = { ...result.value, status: 'ai_grading' }
    }
    missingResult.value = false
    await loadResult({ showSkeleton: false })
  } catch (error) {
    ElMessage.error(gradingJobErrorMessage(error))
  } finally {
    regrading.value = false
  }
}

const runForceRegrade = async () => {
  try {
    await ElMessageBox.confirm(
      '确认重新对该学生提交发起 AI 批改？系统将重新生成 AI 分数与评语，原 AI 结果可能被覆盖。',
      '重新 AI 批改',
      { type: 'warning', confirmButtonText: '确认重新批改', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  regrading.value = true
  try {
    const res = await aiGradeSubmission(route.params.submissionId, {
      forceRegrade: true,
      regradeReason: 'teacher_manual_regrade',
    })
    if (!res.success) {
      ElMessage.error(res.message || '提交失败')
      return
    }
    applyGradingJobResponse(res, { submissionId: route.params.submissionId })
    if (result.value) {
      result.value = { ...result.value, status: 'ai_grading' }
    }
    missingResult.value = false
    await loadResult({ showSkeleton: false })
  } catch (error) {
    ElMessage.error(gradingJobErrorMessage(error))
  } finally {
    regrading.value = false
  }
}

const getStatusType = (status) => {
  if (status == null || status === '') return 'warning'
  const types = {
    pending: 'warning',
    ai_grading: 'warning',
    ai_failed: 'danger',
    ai_graded: 'warning',
    human_graded: 'success',
  }
  return types[status] || 'info'
}

const getStatusText = (status) => {
  if (status == null || status === '') return '待批改'
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

  if (needsAdjustReason.value && !String(reviewForm.humanComment || '').trim()) {
    ElMessage.warning('与 AI 分差距较大，请在复核评语中说明调整原因')
    return
  }

  try {
    await ElMessageBox.confirm(
      '确认提交复核结果？提交后将作为学生最终成绩依据。',
      '提交复核',
      { type: 'warning', confirmButtonText: '确认提交', cancelButtonText: '取消' }
    )
  } catch {
    return
  }

  let comment = String(reviewForm.humanComment || '').trim()

  submitting.value = true
  try {
    const response = await humanReview(route.params.submissionId, {
      humanScore: reviewForm.humanScore,
      humanComment: comment,
    })
    if (response.success) {
      try {
        localStorage.removeItem(draftKey.value)
      } catch (_) {}
      ElMessage.success('复核已完成，学生可在成绩与报告中查看结果。')
      loadResult({ showSkeleton: false })
    }
  } catch (error) {
    ElMessage.error('复核失败')
    console.error(error)
  } finally {
    submitting.value = false
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

useRtOnDomains(['grading', 'submissions', 'grading_job'], (p) => {
  const sid = route.params.submissionId
  if (p.domain === 'grading_job') {
    if (p.submissionId != null && String(p.submissionId) !== String(sid)) return
    if (!['item_done', 'job_finished'].includes(p.action)) return
  } else if (p.submissionId != null && String(p.submissionId) !== String(sid)) {
    return
  }
  void loadResult({ showSkeleton: false })
})

onBeforeUnmount(() => {
  radarChart?.dispose()
  window.removeEventListener('resize', onResize)
})
</script>

<style scoped>
.grading-workbench {
  min-height: 100%;
  padding: 20px 24px 32px;
  background: #f5f7fa;
}

.page-skeleton,
.state-card {
  background: #fff;
  border: 1px solid #e5eaf2;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 1px 4px rgba(15, 45, 61, 0.04);
}

.state-action {
  margin-top: 16px;
}

/* 顶部概览 */
.overview-bar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 16px 24px;
  align-items: start;
  background: #fff;
  border: 1px solid #e5eaf2;
  border-radius: 12px;
  padding: 20px 22px;
  margin-bottom: 16px;
  box-shadow: 0 1px 4px rgba(15, 45, 61, 0.04);
}

.overview-bar--minimal {
  grid-template-columns: 1fr auto;
}

.overview-kicker {
  margin: 0 0 4px;
  font-size: 12px;
  color: #9ca3af;
  font-weight: 500;
}

.workbench-title {
  margin: 0 0 8px;
  font-size: 20px;
  font-weight: 600;
  color: #1f2d3d;
  line-height: 1.35;
}

.workbench-sub {
  margin: 0;
  font-size: 13px;
  color: #6b7280;
}

.overview-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #6b7280;
}

.meta-sep {
  color: #d1d5db;
}

.overview-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(72px, auto));
  gap: 12px 20px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat-label {
  font-size: 11px;
  color: #9ca3af;
  white-space: nowrap;
}

.stat-value {
  font-size: 18px;
  font-weight: 700;
  color: #1d5fd6;
  line-height: 1.2;
}

.stat-value--teacher {
  color: #16a34a;
}

.stat-value--final {
  color: #1f2d3d;
}

.stat-value--plain {
  font-size: 14px;
  font-weight: 600;
  color: #374151;
}

.stat-value--time {
  font-size: 12px;
  font-weight: 500;
}

.stat-value--danger {
  color: #dc2626;
}

.stat-value--warn {
  color: #f59e0b;
}

.overview-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

/* 首屏三栏：左摘要+修正 / 中智能核查 / 右最终复核，三栏等高 */
.hero-grid {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) minmax(0, 1.2fr) minmax(300px, 340px);
  gap: 16px;
  align-items: stretch;
  margin-bottom: 20px;
  min-height: min(720px, calc(100vh - 220px));
}

.hero-col {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
  min-height: 0;
}

.hero-col__grow {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  margin-bottom: 0;
}

.hero-col__panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  margin-bottom: 0;
}

.hero-col__scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
}

.hero-col__scroll--soft {
  margin-top: -4px;
}

.panel-card--summary {
  flex-shrink: 0;
}

.hero-grid .col-left,
.hero-grid .col-center,
.hero-grid .col-right {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
  min-height: 0;
}

.panel-card--focus {
  border-color: #c7d9f5;
  box-shadow: 0 2px 8px rgba(29, 95, 214, 0.08);
}

.panel-card--action {
  border-color: #fcd34d;
  box-shadow: 0 2px 8px rgba(245, 158, 11, 0.1);
}

.correction-panel {
  flex: 0 0 auto;
  align-self: start;
}

.panel-head-accent {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 14px;
  padding-bottom: 10px;
  border-bottom: 1px solid #f0f2f5;
}

.panel-head-accent .panel-title {
  margin: 0;
  padding: 0;
  border: none;
}

.panel-title--accent {
  color: #1d5fd6;
}

.verify-text--clamp {
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.verify-block--last {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.dim-table {
  border-radius: 8px;
}

/* 下方二级区 */
.secondary-zone {
  background: #fff;
  border: 1px solid #e5eaf2;
  border-radius: 12px;
  padding: 18px 20px 8px;
  box-shadow: 0 1px 4px rgba(15, 45, 61, 0.04);
}

.zone-title {
  margin: 0 0 4px;
  font-size: 15px;
  font-weight: 600;
  color: #374151;
}

.zone-desc {
  margin: 0 0 14px;
  font-size: 12px;
  color: #9ca3af;
}

.secondary-collapse {
  border: none;
}

.secondary-collapse :deep(.el-collapse-item__header) {
  font-size: 13px;
  font-weight: 500;
  color: #6b7280;
  border-bottom: 1px solid #f0f2f5;
  background: transparent;
}

.secondary-collapse :deep(.el-collapse-item__wrap) {
  border: none;
}

.secondary-collapse :deep(.el-collapse-item__content) {
  padding: 12px 0 16px;
}

/* 三栏布局（兼容旧类名） */
.workbench-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr) 320px;
  gap: 16px;
  align-items: start;
}

.workbench-grid--single {
  grid-template-columns: 1fr;
}

.col-left,
.col-center,
.col-right {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.panel-card {
  background: #fff;
  border: 1px solid #e5eaf2;
  border-radius: 12px;
  padding: 18px 20px;
  box-shadow: 0 1px 4px rgba(15, 45, 61, 0.04);
}

.panel-title {
  margin: 0 0 16px;
  font-size: 15px;
  font-weight: 600;
  color: #1f2d3d;
  padding-bottom: 10px;
  border-bottom: 1px solid #f0f2f5;
}

/* AI 总览 */
.score-row {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.score-chip {
  flex: 1;
  padding: 12px 14px;
  border-radius: 8px;
  background: #eef4ff;
  border: 1px solid #dbeafe;
}

.score-chip--teacher {
  background: #ecfdf5;
  border-color: #bbf7d0;
}

.score-chip-label {
  display: block;
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 4px;
}

.score-chip-num {
  font-size: 28px;
  font-weight: 700;
  color: #1d5fd6;
  line-height: 1;
}

.score-chip--teacher .score-chip-num {
  color: #16a34a;
}

.text-block {
  margin-bottom: 14px;
}

.text-block:last-child {
  margin-bottom: 0;
}

.block-label {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
}

.block-content {
  margin: 0;
  padding: 10px 12px;
  background: #f9fafb;
  border: 1px solid #eef1f6;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.65;
  color: #374151;
  white-space: pre-wrap;
  word-break: break-word;
}

.block-content--suggest {
  border-left: 3px solid #1d5fd6;
}

/* 维度 */
.dim-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.dim-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.dim-name {
  font-size: 13px;
  font-weight: 500;
  color: #374151;
}

.dim-score {
  font-size: 12px;
  color: #6b7280;
  font-weight: 600;
}

.radar-chart {
  height: 280px;
}

/* 核查 */
.verify-block {
  margin-bottom: 16px;
  padding-bottom: 14px;
  border-bottom: 1px solid #f0f2f5;
}

.verify-block:last-child {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.verify-block--summary {
  background: #f9fafb;
  border: 1px solid #eef1f6;
  border-radius: 8px;
  padding: 12px 14px;
  border-bottom: none;
}

.verify-label {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  text-transform: none;
}

.verify-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.65;
  color: #374151;
  white-space: pre-wrap;
  word-break: break-word;
}

.issue-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.issue-list li {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 8px;
  font-size: 13px;
  color: #374151;
  line-height: 1.55;
}

.code-block {
  margin: 0;
  padding: 12px 14px;
  background: #1e293b;
  color: #e2e8f0;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.55;
  overflow: auto;
  max-height: 240px;
  font-family: ui-monospace, 'Cascadia Mono', Menlo, Consolas, monospace;
}

.empty-inline {
  margin: 0;
  font-size: 13px;
  color: #9ca3af;
}

.inner-collapse,
.override-collapse {
  border: none;
  background: transparent;
}

.inner-collapse :deep(.el-collapse-item__header) {
  font-size: 13px;
  font-weight: 500;
  color: #6b7280;
  border: 1px solid #eef1f6;
  border-radius: 8px;
  padding: 0 12px;
  background: #f9fafb;
  margin-bottom: 0;
}

.inner-collapse :deep(.el-collapse-item__wrap) {
  border: none;
}

.inner-collapse :deep(.el-collapse-item__content) {
  padding: 12px 0 0;
}

/* 教师复核 */
.review-card .panel-title {
  margin-bottom: 12px;
}

.review-form :deep(.el-form-item) {
  margin-bottom: 14px;
}

.review-form :deep(.el-form-item__label) {
  font-size: 13px;
  font-weight: 500;
  color: #374151;
  padding-bottom: 4px;
}

.ai-suggest-score {
  font-size: 24px;
  font-weight: 700;
  color: #1d5fd6;
}

.field-full {
  width: 100%;
}

.field-warn {
  margin: 6px 0 0;
  font-size: 12px;
  color: #f59e0b;
}

.quick-comments {
  margin-top: 8px;
}

.quick-label {
  display: block;
  font-size: 11px;
  color: #9ca3af;
  margin-bottom: 6px;
}

.quick-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.review-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
}

.review-actions .el-button {
  width: 100%;
  margin: 0;
}

.sim-link {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #f0f2f5;
  text-align: center;
}

/* 左栏组件样式微调 */
.col-left :deep(.submission-work-card),
.col-left :deep(.vl-panel) {
  border: none;
  box-shadow: none;
  padding: 0;
}

.col-left :deep(.el-card__header) {
  padding: 0 0 10px;
  border-bottom: 1px solid #f0f2f5;
}

.col-left :deep(.el-card__body) {
  padding: 12px 0 0;
}

.col-left :deep(.kg-enhance-card) {
  border: none;
  margin: 0;
}

@media (max-width: 1280px) {
  .overview-bar {
    grid-template-columns: 1fr;
  }

  .overview-stats {
    grid-template-columns: repeat(3, 1fr);
  }

  .overview-actions {
    justify-content: flex-start;
  }

  .hero-grid {
    grid-template-columns: 1fr;
  }

  .hero-grid .col-left,
  .hero-grid .col-center,
  .hero-grid .col-right {
    grid-column: auto;
  }
}

@media (max-width: 768px) {
  .grading-workbench {
    padding: 12px 14px 24px;
  }

  .hero-grid {
    grid-template-columns: 1fr;
  }

  .overview-stats {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
