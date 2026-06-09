<template>
  <div class="report-page">
    <!-- 顶部工具栏 -->
    <header class="page-toolbar">
      <el-button class="back-btn" @click="router.back()">
        <el-icon><ArrowLeft /></el-icon>
        返回
      </el-button>
      <h1 class="page-title">实训评价报告</h1>
      <el-button
        type="primary"
        plain
        round
        size="small"
        class="feedback-toolbar-btn"
        :disabled="pageLoading"
        @click="openFeedbackDialog"
      >
        反馈 / 申请重交
      </el-button>
      <el-button type="primary" class="export-btn" @click="exportPdf">
        <el-icon><Download /></el-icon>
        导出 PDF
      </el-button>
    </header>

    <el-skeleton v-if="pageLoading" :rows="12" animated />

    <template v-else>
      <!-- 报告概览 -->
      <section v-if="result" class="overview-card">
        <div class="overview-head">
          <h2 class="overview-task">{{ result.title || '—' }}</h2>
          <div class="overview-tags">
            <span class="tag" :class="`tag--${statusTone}`">
              {{ gradingStatusText(result.status) }}
            </span>
            <span class="tag tag--grade" :class="gradeLevel.class">{{ gradeLevel.label }}</span>
          </div>
        </div>
        <dl class="overview-meta">
          <div class="meta-item">
            <dt>课程名称</dt>
            <dd>{{ courseName }}</dd>
          </div>
          <div class="meta-item">
            <dt>提交时间</dt>
            <dd>{{ formatDateTime(result.submitted_at) || '—' }}</dd>
          </div>
        </dl>
        <div class="score-banner">
          <div class="score-banner-item score-banner-item--final">
            <span class="sb-label">综合得分</span>
            <span class="sb-value">{{ displayFinalScore }}<small>分</small></span>
          </div>
          <div class="score-banner-item">
            <span class="sb-label">AI 评分</span>
            <span class="sb-value sb-value--ai">{{ result.total_score ?? '—' }}</span>
          </div>
          <div class="score-banner-item">
            <span class="sb-label">教师评分</span>
            <span class="sb-value sb-value--teacher">{{ teacherScoreText }}</span>
          </div>
          <div class="score-banner-item">
            <span class="sb-label">评价等级</span>
            <span class="sb-grade" :class="gradeLevel.class">{{ gradeLevel.label }}</span>
          </div>
        </div>
      </section>

      <section v-else class="overview-card overview-card--pending">
        <h2 class="overview-task">{{ pendingTitle }}</h2>
        <p class="pending-hint">暂无批改报告，您仍可查看下方已提交内容与识别结果。</p>
      </section>

      <div class="page-layout">
        <!-- 左侧报告正文 -->
        <main class="col-main">
          <!-- 1. 提交材料 -->
          <section id="section-materials" class="panel-card">
            <h2 class="panel-title">提交材料</h2>
            <div v-if="submissionWork?.text" class="material-block">
              <h3 class="block-label">文字说明</h3>
              <pre class="body-pre">{{ submissionWork.text }}</pre>
            </div>
            <p v-else class="empty-hint">暂无文字说明</p>
            <div v-if="submissionWork?.codeContent" class="material-block">
              <h3 class="block-label">代码内容</h3>
              <pre class="body-pre">{{ submissionWork.codeContent }}</pre>
            </div>
            <div v-if="submissionWork?.attachments?.length" class="material-block">
              <h3 class="block-label">上传附件（{{ submissionWork.attachments.length }}）</h3>
              <div v-for="(att, idx) in submissionWork.attachments" :key="att.id || idx" class="file-row">
                <div class="file-info">
                  <el-icon class="file-icon"><Document /></el-icon>
                  <div>
                    <span class="file-name">{{ att.originalName || att.fileName || '附件' }}</span>
                    <span v-if="att.fileSize || att.mimeType" class="file-type">
                      {{ formatFileSize(att.fileSize) }} · {{ att.fileExt || att.mimeType || '—' }}
                    </span>
                  </div>
                </div>
                <div class="file-actions">
                  <a v-if="att.fileUrl" class="action-link" :href="att.fileUrl" target="_blank" rel="noopener noreferrer">在线打开</a>
                  <a v-if="att.fileUrl" class="action-link" :href="att.fileUrl" :download="att.originalName || att.fileName" rel="noopener noreferrer">下载</a>
                </div>
              </div>
            </div>
            <div v-else-if="submissionWork?.fileName || submissionWork?.fileUrl" class="material-block">
              <h3 class="block-label">上传附件</h3>
              <div class="file-row">
                <div class="file-info">
                  <el-icon class="file-icon"><Document /></el-icon>
                  <div>
                    <span class="file-name">{{ submissionWork.fileName || '附件' }}</span>
                    <span v-if="submissionWork.fileType" class="file-type">{{ submissionWork.fileType }}</span>
                  </div>
                </div>
                <div class="file-actions">
                  <a
                    v-if="submissionWork.fileUrl"
                    class="action-link"
                    :href="submissionWork.fileUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                  >在线打开</a>
                  <a
                    v-if="submissionWork.fileUrl"
                    class="action-link"
                    :href="submissionWork.fileUrl"
                    :download="submissionWork.fileName || 'submission'"
                    rel="noopener noreferrer"
                  >下载</a>
                  <span v-if="!submissionWork.fileUrl" class="empty-hint">缺少可访问链接</span>
                </div>
              </div>
            </div>
            <p v-else-if="!submissionWork?.text" class="empty-hint">暂无上传附件</p>
          </section>

          <!-- 2. 图片视觉识别 -->
          <section id="section-vl" class="panel-card panel-card--flat">
            <h2 class="panel-title">图片视觉识别</h2>
            <VlRecognitionPanel
              :submission-id="route.params.submissionId"
              :initial="submissionDetail || pendingSubmission"
              :allow-retry="false"
              variant="report"
              class="vl-embed"
              @updated="loadSubmissionDetail"
            />
          </section>

          <section v-if="submissionDetail?.codeRun?.enabled" id="section-coderun" class="panel-card panel-card--flat">
            <h2 class="panel-title">代码运行检查</h2>
            <SubmissionCodeRunPanel :code-run="submissionDetail?.codeRun" />
          </section>

          <template v-if="result">
            <!-- 3. 成绩总览 -->
            <section id="section-score" class="panel-card">
              <h2 class="panel-title">成绩总览</h2>
              <div class="score-cards">
                <div class="score-card score-card--final">
                  <span class="sc-label">综合得分</span>
                  <span class="sc-num">{{ displayFinalScore }}</span>
                  <span class="sc-unit">/ {{ result.max_score ?? 100 }}</span>
                  <span class="sc-grade" :class="gradeLevel.class">{{ gradeLevel.label }}</span>
                </div>
                <div class="score-card">
                  <span class="sc-label">AI 评分</span>
                  <span class="sc-num sc-num--ai">{{ result.total_score ?? '—' }}</span>
                  <span class="sc-unit">分</span>
                </div>
                <div class="score-card">
                  <span class="sc-label">教师评分</span>
                  <span class="sc-num sc-num--teacher">{{ teacherScoreText }}</span>
                  <span v-if="result.human_score != null && result.human_score !== ''" class="sc-unit">分</span>
                </div>
              </div>
            </section>

            <!-- 4. 维度得分 -->
            <section id="section-dimension" class="panel-card">
              <h2 class="panel-title">维度得分</h2>
              <div v-if="result.dimension_scores?.length" class="dimension-wrap">
                <div ref="radarRef" class="radar-chart" />
                <div class="dim-bars">
                  <div v-for="d in result.dimension_scores" :key="d.name" class="dim-bar-row">
                    <span class="dim-name">{{ d.name }}</span>
                    <div class="dim-bar-track">
                      <div
                        class="dim-bar-fill"
                        :style="{ width: `${dimPercent(d)}%` }"
                      />
                    </div>
                    <span class="dim-score">{{ d.score ?? '—' }} / {{ d.maxScore ?? '—' }}</span>
                  </div>
                </div>
              </div>
              <p v-else class="empty-hint">暂无维度得分数据</p>
            </section>

            <!-- 5. 智能核查 -->
            <section id="section-verify" class="panel-card">
              <h2 class="panel-title">智能核查</h2>
              <template v-if="result.verification_result">
                <div class="verify-group">
                  <h3 class="verify-label">与任务要求对比</h3>
                  <p class="verify-text">{{ friendlyText(result.verification_result.requirementComparison, '暂无对比分析') }}</p>
                </div>
                <div class="verify-group">
                  <h3 class="verify-label">校企标准对齐</h3>
                  <p class="verify-text">{{ friendlyText(result.verification_result.enterpriseAlignment, '暂无校企标准对齐说明') }}</p>
                </div>
                <div class="verify-group">
                  <h3 class="verify-label">逻辑问题</h3>
                  <ul v-if="logicIssues.length" class="verify-list">
                    <li v-for="(it, i) in logicIssues" :key="i">
                      <strong>{{ it.title || '问题' }}</strong>
                      <span>{{ it.detail || '' }}</span>
                    </li>
                  </ul>
                  <p v-else class="empty-hint empty-hint--ok">暂未发现明显问题</p>
                </div>
                <div class="verify-group">
                  <h3 class="verify-label">步骤完整性</h3>
                  <div class="step-grid">
                    <div class="step-col">
                      <span class="step-key">已覆盖</span>
                      <p>{{ stepCovered || '—' }}</p>
                    </div>
                    <div class="step-col">
                      <span class="step-key">待补充</span>
                      <p>{{ stepMissing || '—' }}</p>
                    </div>
                  </div>
                  <p v-if="result.verification_result.summary" class="verify-summary">
                    {{ result.verification_result.summary }}
                  </p>
                </div>
                <el-collapse v-if="hasLangchainDeep" class="tech-collapse">
                  <el-collapse-item title="LangChain / AI 分析过程" name="lc">
                    <LangchainDeepPanel :verification-result="result.verification_result" />
                  </el-collapse-item>
                </el-collapse>
              </template>
              <p v-else class="empty-hint">暂无智能核查数据</p>
            </section>

            <!-- 6. AI 评语 -->
            <section id="section-comment" class="panel-card">
              <h2 class="panel-title">AI 评语</h2>
              <div class="conclusion-card">
                <p>{{ friendlyText(result.ai_comment, '暂无 AI 评语') }}</p>
              </div>
            </section>

            <!-- 7. 问题分析 -->
            <section id="section-problems" class="panel-card">
              <h2 class="panel-title">问题分析</h2>
              <div class="conclusion-card" :class="{ 'conclusion-card--ok': !hasProblems }">
                <p>{{ problemsText }}</p>
              </div>
            </section>

            <!-- 8. 改进建议 -->
            <section id="section-suggestions" class="panel-card">
              <h2 class="panel-title">改进建议</h2>
              <div class="conclusion-card conclusion-card--suggest">
                <p>{{ friendlyText(result.ai_suggestions, '暂无改进建议') }}</p>
              </div>
            </section>

            <!-- 教师评语 -->
            <section v-if="showTeacherSection" id="section-teacher" class="panel-card">
              <h2 class="panel-title">教师评语</h2>
              <p v-if="teacherScoreText !== '—'" class="teacher-score-badge">
                教师评分：<strong>{{ teacherScoreText }}</strong> 分
              </p>
              <template v-if="teacherReviewNotes.length">
                <div
                  v-for="(note, idx) in teacherReviewNotes"
                  :key="idx"
                  class="conclusion-card conclusion-card--teacher"
                >
                  <h3 v-if="teacherReviewNotes.length > 1 || note.label !== '教师评语'" class="teacher-note-label">
                    {{ note.label }}
                  </h3>
                  <p>{{ note.text }}</p>
                </div>
              </template>
              <div v-else class="conclusion-card conclusion-card--teacher">
                <p>{{ teacherSectionFallback }}</p>
              </div>
            </section>

            <!-- 9. 评价依据 -->
            <section id="section-basis" class="panel-card">
              <h2 class="panel-title">评价依据 / 知识库引用</h2>
              <template v-if="knowledgeRefs.length">
                <div class="kb-table-wrap">
                  <table class="kb-table">
                    <thead>
                      <tr>
                        <th>引用文档</th>
                        <th>命中片段</th>
                        <th>相似度</th>
                        <th>引用用途</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(ref, i) in knowledgeRefs" :key="i">
                        <td>{{ ref.doc }}</td>
                        <td>{{ ref.snippet }}</td>
                        <td>{{ ref.similarity ?? '—' }}</td>
                        <td>{{ ref.purpose }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </template>
              <p v-else class="empty-hint">
                本次评价主要依据任务要求、评分维度和学生提交内容生成。
              </p>
            </section>
          </template>

          <section v-else class="panel-card">
            <el-empty description="批改完成后将在此展示完整评价报告" :image-size="80" />
          </section>
        </main>

        <!-- 右侧摘要卡 -->
        <aside class="col-aside">
          <section class="summary-card">
            <h2 class="summary-title">报告摘要</h2>
            <dl class="summary-list">
              <div class="summary-item summary-item--score">
                <dt>综合得分</dt>
                <dd>
                  <span v-if="result" class="summary-score">{{ displayFinalScore }}</span>
                  <span v-else class="summary-muted">待批改</span>
                </dd>
              </div>
              <div class="summary-item">
                <dt>批改状态</dt>
                <dd>
                  <span v-if="result" class="tag tag--sm" :class="`tag--${statusTone}`">
                    {{ gradingStatusText(result.status) }}
                  </span>
                  <span v-else class="summary-muted">待批改</span>
                </dd>
              </div>
              <div class="summary-item">
                <dt>提交时间</dt>
                <dd>{{ submitTimeText }}</dd>
              </div>
              <div class="summary-item">
                <dt>附件数量</dt>
                <dd>{{ attachmentCountText }}</dd>
              </div>
              <div class="summary-item">
                <dt>图片识别</dt>
                <dd>{{ vlStatusText }}</dd>
              </div>
            </dl>

            <div class="nav-block">
              <h3 class="nav-title">快捷导航</h3>
              <button
                v-for="item in navItems"
                :key="item.id"
                type="button"
                class="nav-link"
                @click="scrollToSection(item.id)"
              >
                {{ item.label }}
              </button>
            </div>

            <el-button type="primary" class="export-btn-block" @click="exportPdf">
              <el-icon><Download /></el-icon>
              导出 PDF 报告
            </el-button>
          </section>

          <SubmissionFeedbackPanel
            id="section-feedback"
            ref="feedbackPanelRef"
            :submission-id="route.params.submissionId"
            :task-id="result?.task_id || pendingTaskId"
            :resubmit-expire-at="resubmitExpireAt"
          />

          <SubmissionHistoryModule
            :submission-id="route.params.submissionId"
            :current-version="currentVersion"
          />
        </aside>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Download, Document } from '@element-plus/icons-vue'
import { useRtOnDomains } from '../../composables/useRtOnDomains'
import { getGradingResult } from '../../api/grading'
import { getSubmissionById } from '../../api/submission'
import { getTaskById } from '../../api/task'
import VlRecognitionPanel from '../../components/VlRecognitionPanel.vue'
import SubmissionCodeRunPanel from '../../components/codeRunner/SubmissionCodeRunPanel.vue'
import LangchainDeepPanel from '../../components/LangchainDeepPanel.vue'
import SubmissionFeedbackPanel from '../../components/student/SubmissionFeedbackPanel.vue'
import SubmissionHistoryModule from '../../components/SubmissionHistoryModule.vue'
import { mergeSubmissionWork, workFromGradingRow, workFromSubmissionApi, formatFileSize } from '../../utils/submissionWorkMerge'
import { downloadPersonalPdf } from '../../api/report'
import { formatDateTime } from '../../utils/format'
import { gradingStatusType, gradingStatusText } from '../../utils/gradingStatusDisplay'
import { ElMessage } from 'element-plus'
import * as echarts from 'echarts'
import { buildRadarChartMeta } from '../../utils/echartsRadar'

const route = useRoute()
const router = useRouter()

const result = ref(null)
const pendingSubmission = ref(null)
const submissionDetail = ref(null)
const taskMeta = ref(null)
const pageLoading = ref(true)
const feedbackPanelRef = ref(null)
const resubmitExpireAt = ref(null)
const pendingTaskId = ref(null)
const currentVersion = ref(null)
const radarRef = ref(null)
let radarChart = null

const baseNavItems = [
  { id: 'section-materials', label: '提交材料' },
  { id: 'section-vl', label: '图片识别' },
  { id: 'section-score', label: '成绩分析' },
  { id: 'section-dimension', label: '维度得分' },
  { id: 'section-verify', label: '智能核查' },
  { id: 'section-comment', label: 'AI 评语' },
  { id: 'section-problems', label: '问题分析' },
  { id: 'section-suggestions', label: '改进建议' },
  { id: 'section-basis', label: '评价依据' },
]

const verificationOverride = computed(() => {
  const raw = result.value?.verification_teacher_override
  if (!raw || typeof raw !== 'object') return null
  return raw
})

const teacherReviewNotes = computed(() => {
  const r = result.value
  if (!r) return []
  const notes = []

  const humanComment = String(r.human_comment || '').trim()
  if (humanComment) {
    notes.push({ label: '教师评语', text: humanComment })
  }

  const override = verificationOverride.value
  const teacherNote = String(override?.teacherNote || '').trim()
  if (teacherNote) {
    notes.push({ label: '教师补充说明', text: teacherNote })
  }

  const logicNotes = override?.logicIssueNotes
  const issues = r.verification_result?.logicIssues || []
  if (Array.isArray(logicNotes)) {
    logicNotes.forEach((ln) => {
      const text = String(ln?.note || '').trim()
      if (!text) return
      const issue = issues[ln.index]
      notes.push({
        label: issue?.title ? `关于「${issue.title}」的说明` : '逻辑问题说明',
        text,
      })
    })
  }

  const enterpriseComment = String(r.enterprise_comment || '').trim()
  if (enterpriseComment) {
    notes.push({ label: '企业导师评语', text: enterpriseComment })
  }

  return notes
})

const showTeacherSection = computed(() => {
  const r = result.value
  if (!r) return false
  if (teacherReviewNotes.value.length) return true
  if (r.human_score != null && r.human_score !== '') return true
  if (r.status === 'human_graded') return true
  if (verificationOverride.value && Object.keys(verificationOverride.value).length > 0) return true
  return false
})

const teacherSectionFallback = computed(() => {
  const r = result.value
  if (!r) return '—'
  if (r.status === 'human_graded' || (r.human_score != null && r.human_score !== '')) {
    return '教师已完成评分，暂未填写文字评语。'
  }
  return '教师尚未复核，复核后可在此查看教师评语。'
})

const navItems = computed(() => {
  const items = [...baseNavItems]
  if (showTeacherSection.value) {
    const basisIdx = items.findIndex((i) => i.id === 'section-basis')
    items.splice(basisIdx >= 0 ? basisIdx : items.length, 0, {
      id: 'section-teacher',
      label: '教师评语',
    })
  }
  return items
})

const submissionWork = computed(() => {
  const r = result.value
  const detail = submissionDetail.value
  if (r) {
    return mergeSubmissionWork(workFromGradingRow(r), workFromSubmissionApi(detail))
  }
  const p = pendingSubmission.value
  if (p) return workFromSubmissionApi(p)
  return null
})

const displayFinalScore = computed(() => {
  const r = result.value
  if (!r) return '—'
  const v = r.final_score ?? r.display_score ?? r.total_score
  return v != null && v !== '' ? v : '—'
})

const teacherScoreText = computed(() => {
  const v = result.value?.human_score
  if (v == null || v === '') return '—'
  return v
})

const courseName = computed(() => {
  const t = taskMeta.value
  if (!t) return '—'
  const name = [t.course_code, t.course_name].filter(Boolean).join(' ')
  return name || '—'
})

const pendingTitle = computed(() => {
  return pendingSubmission.value?.title || submissionDetail.value?.title || '实训提交'
})

const submitTimeText = computed(() => {
  const t = result.value?.submitted_at || submissionDetail.value?.submitted_at || pendingSubmission.value?.submitted_at
  return t ? formatDateTime(t) : '—'
})

const attachmentCountText = computed(() => {
  const detail = submissionDetail.value || pendingSubmission.value
  const extracted = detail?.archive_extracted_file_count
  if (extracted != null && Number(extracted) > 0) return `${extracted} 个（压缩包解压）`
  if (submissionWork.value?.fileName || submissionWork.value?.fileUrl) return '1 个'
  return '0 个'
})

const vlStatusText = computed(() => {
  const s =
    submissionDetail.value?.vl_recognition_status ||
    pendingSubmission.value?.vl_recognition_status ||
    'none'
  const m = {
    done: '识别完成',
    failed: '识别失败',
    skipped: '已跳过',
    pending: '识别中',
    none: '未识别',
  }
  return m[s] || s || '—'
})

const statusTone = computed(() => gradingStatusType(result.value?.status))

const gradeLevel = computed(() => {
  const r = result.value
  if (!r) return { label: '—', class: '' }
  const final = Number(displayFinalScore.value)
  const max = Number(r.max_score) || 100
  if (!Number.isFinite(final)) return { label: '—', class: '' }
  const pct = (final / max) * 100
  if (pct >= 90) return { label: '优秀', class: 'grade-excellent' }
  if (pct >= 80) return { label: '良好', class: 'grade-good' }
  if (pct >= 70) return { label: '中等', class: 'grade-medium' }
  if (pct >= 60) return { label: '及格', class: 'grade-pass' }
  return { label: '待提高', class: 'grade-low' }
})

const logicIssues = computed(() => {
  const list = result.value?.verification_result?.logicIssues
  return Array.isArray(list) ? list : []
})

const stepCovered = computed(() => {
  const arr = result.value?.verification_result?.stepCompleteness?.covered
  return Array.isArray(arr) && arr.length ? arr.join('、') : ''
})

const stepMissing = computed(() => {
  const arr = result.value?.verification_result?.stepCompleteness?.missing
  return Array.isArray(arr) && arr.length ? arr.join('、') : ''
})

const hasLangchainDeep = computed(() => !!result.value?.verification_result?.langchainDeep)

const knowledgeRefs = computed(() => {
  const kp = result.value?.verification_result?.langchainDeep?.knowledgePoints
  if (!Array.isArray(kp) || !kp.length) return []
  return kp.map((p) => ({
    doc: '课标 / 知识库锚点',
    snippet: String(p),
    similarity: '—',
    purpose: '评价对标参考',
  }))
})

const hasProblems = computed(() => {
  const s = String(result.value?.ai_problems || '').trim()
  return s && s !== '无' && s !== '暂无' && s !== '暂无问题分析'
})

const problemsText = computed(() => {
  if (!hasProblems.value) return '暂未发现明显问题'
  return result.value.ai_problems
})

function friendlyText(val, fallback) {
  const s = String(val || '').trim()
  if (!s || s === '无' || s === '暂无' || s === '—') return fallback
  return val
}

function dimPercent(d) {
  const score = Number(d.score)
  const max = Number(d.maxScore) || 1
  if (!Number.isFinite(score)) return 0
  return Math.min(100, Math.max(0, (score / max) * 100))
}

function scrollToSection(id) {
  const el = document.getElementById(id)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

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
    if (res.success) {
      submissionDetail.value = res.data
      resubmitExpireAt.value = res.data?.resubmit_permission?.expireAt || null
      pendingTaskId.value = res.data?.task_id || null
      currentVersion.value = res.data?.version != null ? Number(res.data.version) : 1
    }
  } catch (_) {}
}

function openFeedbackDialog() {
  if (pageLoading.value) return
  if (!feedbackPanelRef.value?.openDialog) {
    ElMessage.warning('页面加载中，请稍后再试')
    return
  }
  feedbackPanelRef.value.openDialog()
}

const loadTaskMeta = async (taskId) => {
  taskMeta.value = null
  if (!taskId) return
  try {
    const res = await getTaskById(taskId)
    if (res.success) taskMeta.value = res.data
  } catch (_) {}
}

const loadResult = async () => {
  pageLoading.value = true
  disposeRadar()
  try {
    const response = await getGradingResult(route.params.submissionId)
    if (response.success && response.data) {
      pendingSubmission.value = null
      result.value = response.data
      await Promise.all([
        loadSubmissionDetail(),
        loadTaskMeta(response.data.task_id),
      ])
    } else if (response.success) {
      result.value = null
      taskMeta.value = null
      await loadPendingSubmission()
      await loadSubmissionDetail()
    }
  } catch (error) {
    if (error?.response?.status !== 404) console.error(error)
    if (error?.response?.status === 404) {
      result.value = null
      taskMeta.value = null
      await loadPendingSubmission()
      await loadSubmissionDetail()
    }
  } finally {
    pageLoading.value = false
    await nextTick()
    await renderRadar()
  }
}

function disposeRadar() {
  if (radarChart && !radarChart.isDisposed()) {
    radarChart.dispose()
  }
  radarChart = null
}

const renderRadar = async () => {
  await nextTick()
  if (pageLoading.value) return
  if (!radarRef.value || !result.value?.dimension_scores?.length) {
    disposeRadar()
    return
  }

  const dom = radarRef.value
  if (dom.clientWidth === 0 || dom.clientHeight === 0) {
    requestAnimationFrame(() => {
      void renderRadar()
    })
    return
  }

  const existing = echarts.getInstanceByDom(dom)
  if (existing && !existing.isDisposed()) {
    radarChart = existing
  } else {
    disposeRadar()
    radarChart = echarts.init(dom)
  }

  const dims = result.value.dimension_scores
  const { indicators, splitNumber } = buildRadarChartMeta(dims)
  radarChart.setOption(
    {
      color: ['#1d5fd6'],
      tooltip: {},
      radar: {
        indicator: indicators,
        radius: '62%',
        splitNumber,
        axisName: { color: '#6b7280', fontSize: 12 },
        splitLine: { lineStyle: { color: '#e5eaf2' } },
        splitArea: { show: false },
      },
      series: [
        {
          type: 'radar',
          data: [{ value: dims.map((d) => d.score), name: '我的得分' }],
          areaStyle: { opacity: 0.1 },
          lineStyle: { width: 2 },
        },
      ],
    },
    true
  )
  radarChart.resize()
}

watch(
  () => result.value?.dimension_scores,
  async () => {
    if (pageLoading.value) return
    await renderRadar()
  },
  { deep: true }
)

const exportPdf = async () => {
  try {
    await downloadPersonalPdf(route.params.submissionId)
    ElMessage.success('已开始下载')
  } catch (e) {
    ElMessage.error(e?.message || '导出失败')
  }
}

const onResize = () => {
  if (radarChart && !radarChart.isDisposed()) {
    radarChart.resize()
  }
}

useRtOnDomains(['grading', 'submissions', 'scores'], () => loadResult())

onMounted(() => {
  loadResult()
  window.addEventListener('resize', onResize)
})

onBeforeUnmount(() => {
  disposeRadar()
  window.removeEventListener('resize', onResize)
})
</script>

<style scoped>
.report-page {
  min-height: 100%;
  padding: 20px 24px 32px;
  background: #f5f7fa;
}

.page-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.back-btn {
  border: 1px solid #e5eaf2;
  background: #fff;
  color: #1d5fd6;
}

.page-title {
  flex: 1;
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #1f2d3d;
}

.export-btn {
  flex-shrink: 0;
}

.feedback-toolbar-btn {
  flex-shrink: 0;
  font-weight: 500;
  padding: 8px 16px;
}

/* 概览卡 */
.overview-card {
  background: #fff;
  border: 1px solid #e5eaf2;
  border-radius: 12px;
  padding: 20px 24px;
  margin-bottom: 16px;
  box-shadow: 0 1px 4px rgba(15, 45, 61, 0.06);
}

.overview-card--pending {
  padding: 16px 20px;
}

.overview-head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 14px;
}

.overview-task {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #1f2d3d;
  line-height: 1.4;
}

.overview-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.tag--sm {
  font-size: 11px;
  padding: 1px 8px;
}

.tag--success { background: #ecfdf5; color: #16a34a; border: 1px solid #a7f3d0; }
.tag--warning { background: #fffbeb; color: #d97706; border: 1px solid #fde68a; }
.tag--info { background: #eff6ff; color: #1d5fd6; border: 1px solid #bfdbfe; }
.tag--danger { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }

.tag--grade,
.sb-grade,
.sc-grade {
  font-weight: 600;
}

.grade-excellent { color: #16a34a; }
.grade-good { color: #1d5fd6; }
.grade-medium { color: #6b7280; }
.grade-pass { color: #f59e0b; }
.grade-low { color: #dc2626; }

.tag--grade.grade-excellent { background: #ecfdf5; border: 1px solid #a7f3d0; }
.tag--grade.grade-good { background: #eff6ff; border: 1px solid #bfdbfe; }
.tag--grade.grade-medium { background: #f3f4f6; border: 1px solid #e5e7eb; }
.tag--grade.grade-pass { background: #fffbeb; border: 1px solid #fde68a; }
.tag--grade.grade-low { background: #fef2f2; border: 1px solid #fecaca; }

.overview-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  margin: 0 0 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid #f0f2f5;
}

.meta-item dt {
  margin: 0 0 4px;
  font-size: 12px;
  color: #6b7280;
}

.meta-item dd {
  margin: 0;
  font-size: 14px;
  color: #1f2d3d;
  font-weight: 500;
}

.pending-hint {
  margin: 8px 0 0;
  font-size: 13px;
  color: #6b7280;
}

.score-banner {
  display: grid;
  grid-template-columns: 1.2fr repeat(3, 1fr);
  gap: 12px;
}

.score-banner-item {
  padding: 14px 16px;
  background: #f9fafb;
  border: 1px solid #eef1f6;
  border-radius: 10px;
  text-align: center;
}

.score-banner-item--final {
  background: #eef5ff;
  border-color: #bfdbfe;
}

.sb-label {
  display: block;
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 6px;
}

.sb-value {
  font-size: 28px;
  font-weight: 700;
  color: #1f2d3d;
  line-height: 1.1;
}

.sb-value small {
  font-size: 14px;
  font-weight: 500;
  margin-left: 2px;
}

.sb-value--ai { color: #1d5fd6; font-size: 24px; }
.sb-value--teacher { color: #059669; font-size: 24px; }
.sb-grade { font-size: 20px; }

/* 双栏 */
.page-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 16px;
  align-items: start;
}

.col-aside {
  position: sticky;
  top: 16px;
}

.panel-card {
  background: #fff;
  border: 1px solid #e5eaf2;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 16px;
  box-shadow: 0 1px 4px rgba(15, 45, 61, 0.04);
}

.panel-card--flat {
  padding-bottom: 8px;
}

.panel-title {
  margin: 0 0 16px;
  font-size: 16px;
  font-weight: 600;
  color: #1f2d3d;
  padding-bottom: 10px;
  border-bottom: 1px solid #f0f2f5;
}

.block-label {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}

.material-block + .material-block,
.material-block + .empty-hint {
  margin-top: 16px;
}

.body-pre {
  margin: 0;
  padding: 12px 14px;
  background: #f9fafb;
  border: 1px solid #e5eaf2;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  color: #374151;
}

.empty-hint {
  margin: 0;
  font-size: 13px;
  color: #9ca3af;
  line-height: 1.6;
}

.empty-hint--ok {
  color: #16a34a;
}

.file-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: #f9fafb;
  border: 1px solid #e5eaf2;
  border-radius: 8px;
}

.file-info {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
}

.file-icon {
  color: #1d5fd6;
  font-size: 20px;
  margin-top: 2px;
}

.file-name {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: #1f2d3d;
  word-break: break-all;
}

.file-type {
  display: block;
  font-size: 12px;
  color: #9ca3af;
  margin-top: 2px;
}

.file-actions {
  display: flex;
  gap: 12px;
  flex-shrink: 0;
}

.action-link {
  font-size: 13px;
  color: #1d5fd6;
  text-decoration: none;
  font-weight: 500;
}

.action-link:hover {
  text-decoration: underline;
}

.vl-embed :deep(.vl-panel) {
  margin-top: 0;
  border: none;
  box-shadow: none;
}

.vl-embed :deep(.el-card__header) {
  padding: 0 0 12px;
  border-bottom: 1px solid #f0f2f5;
}

.vl-embed :deep(.el-card__body) {
  padding: 0;
}

/* 成绩总览 */
.score-cards {
  display: grid;
  grid-template-columns: 1.2fr repeat(2, 1fr);
  gap: 12px;
}

.score-card {
  padding: 16px;
  background: #f9fafb;
  border: 1px solid #eef1f6;
  border-radius: 10px;
  text-align: center;
}

.score-card--final {
  background: #eef5ff;
  border-color: #bfdbfe;
}

.sc-label {
  display: block;
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 8px;
}

.sc-num {
  font-size: 32px;
  font-weight: 700;
  color: #1f2d3d;
  line-height: 1;
}

.sc-num--ai { color: #1d5fd6; font-size: 28px; }
.sc-num--teacher { color: #16a34a; font-size: 28px; }

.sc-unit {
  font-size: 13px;
  color: #9ca3af;
  margin-left: 4px;
}

.sc-grade {
  display: block;
  margin-top: 8px;
  font-size: 14px;
}

/* 维度 */
.dimension-wrap {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  align-items: center;
}

.radar-chart {
  height: 280px;
  min-height: 280px;
  min-width: 240px;
  width: 100%;
  touch-action: pan-y;
}

.dim-bars {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.dim-bar-row {
  display: grid;
  grid-template-columns: 80px 1fr 72px;
  gap: 10px;
  align-items: center;
}

.dim-name {
  font-size: 13px;
  color: #374151;
}

.dim-bar-track {
  height: 8px;
  background: #f0f2f5;
  border-radius: 4px;
  overflow: hidden;
}

.dim-bar-fill {
  height: 100%;
  background: #1d5fd6;
  border-radius: 4px;
  opacity: 0.85;
}

.dim-score {
  font-size: 12px;
  color: #6b7280;
  text-align: right;
}

/* 智能核查 */
.verify-group {
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid #f3f4f6;
}

.verify-group:last-of-type {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}

.verify-label {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}

.verify-text {
  margin: 0;
  font-size: 14px;
  color: #4b5563;
  line-height: 1.7;
}

.verify-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.verify-list li {
  padding: 8px 12px;
  margin-bottom: 6px;
  background: #fef2f2;
  border-radius: 6px;
  font-size: 13px;
  color: #374151;
  line-height: 1.5;
}

.verify-list li strong {
  color: #dc2626;
  margin-right: 6px;
}

.step-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 10px;
}

.step-col {
  padding: 10px 12px;
  background: #f9fafb;
  border-radius: 8px;
  border: 1px solid #eef1f6;
}

.step-key {
  display: block;
  font-size: 11px;
  color: #9ca3af;
  margin-bottom: 4px;
}

.step-col p {
  margin: 0;
  font-size: 13px;
  color: #374151;
  line-height: 1.5;
}

.verify-summary {
  margin: 10px 0 0;
  font-size: 13px;
  color: #6b7280;
  line-height: 1.6;
}

.tech-collapse {
  margin-top: 16px;
  border: none;
}

.tech-collapse :deep(.el-collapse-item__header) {
  font-size: 13px;
  color: #6b7280;
  border: 1px solid #eef1f6;
  border-radius: 8px;
  padding: 0 12px;
  background: #f9fafb;
}

.tech-collapse :deep(.el-collapse-item__wrap) {
  border: none;
}

.tech-collapse :deep(.el-collapse-item__content) {
  padding: 12px 0 0;
}

/* 结论卡 */
.conclusion-card {
  padding: 16px;
  background: #f9fafb;
  border: 1px solid #eef1f6;
  border-radius: 10px;
  border-left: 3px solid #1d5fd6;
}

.conclusion-card p {
  margin: 0;
  font-size: 14px;
  color: #374151;
  line-height: 1.75;
}

.conclusion-card--ok {
  border-left-color: #16a34a;
  background: #f0fdf4;
}

.conclusion-card--suggest {
  border-left-color: #f59e0b;
}

.conclusion-card--teacher {
  border-left-color: #059669;
}

.teacher-score-badge {
  margin: -8px 0 14px;
  font-size: 13px;
  color: #6b7280;
}

.teacher-score-badge strong {
  color: #16a34a;
  font-size: 16px;
}

.teacher-note-label {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: #059669;
}

.conclusion-card + .conclusion-card {
  margin-top: 10px;
}

/* 知识库 */
.kb-table-wrap {
  overflow-x: auto;
}

.kb-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.kb-table th,
.kb-table td {
  padding: 10px 12px;
  border: 1px solid #e5eaf2;
  text-align: left;
  vertical-align: top;
}

.kb-table th {
  background: #f9fafb;
  color: #6b7280;
  font-weight: 500;
}

.kb-table td {
  color: #374151;
  line-height: 1.5;
}

/* 右侧摘要 */
.summary-card {
  background: #fff;
  border: 1px solid #e5eaf2;
  border-radius: 12px;
  padding: 18px;
  box-shadow: 0 2px 8px rgba(15, 45, 61, 0.06);
}

.summary-title {
  margin: 0 0 14px;
  font-size: 15px;
  font-weight: 600;
  color: #1f2d3d;
}

.summary-list {
  margin: 0 0 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid #f0f2f5;
}

.summary-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  font-size: 13px;
}

.summary-item dt {
  color: #6b7280;
  font-weight: 400;
}

.summary-item dd {
  margin: 0;
  color: #1f2d3d;
  font-weight: 500;
  text-align: right;
}

.summary-item--score dd {
  font-size: 22px;
  font-weight: 700;
  color: #1d5fd6;
}

.summary-score {
  font-size: 28px;
  font-weight: 700;
  color: #1d5fd6;
}

.summary-muted {
  color: #9ca3af;
  font-weight: 400;
}

.nav-block {
  margin-bottom: 16px;
}

.nav-title {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}

.nav-link {
  display: block;
  width: 100%;
  padding: 8px 10px;
  margin-bottom: 4px;
  border: none;
  border-radius: 6px;
  background: transparent;
  text-align: left;
  font-size: 13px;
  color: #4b5563;
  cursor: pointer;
  transition: background 0.15s;
}

.nav-link:hover {
  background: #eef5ff;
  color: #1d5fd6;
}

.export-btn-block {
  width: 100%;
}

@media (max-width: 992px) {
  .page-layout {
    grid-template-columns: 1fr;
  }

  .col-aside {
    position: static;
  }

  .score-banner,
  .score-cards {
    grid-template-columns: repeat(2, 1fr);
  }

  .dimension-wrap {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 480px) {
  .report-page {
    padding: 12px 16px 24px;
  }

  .score-banner,
  .score-cards,
  .step-grid {
    grid-template-columns: 1fr;
  }

  .dim-bar-row {
    grid-template-columns: 1fr;
    gap: 4px;
  }

  .dim-score {
    text-align: left;
  }
}
</style>
