<template>
  <div class="task-detail-page">
    <div class="page-toolbar">
      <el-button class="back-btn" @click="router.push('/student/tasks')">
        <el-icon><ArrowLeft /></el-icon>
        返回实训中心
      </el-button>
    </div>

    <el-skeleton v-if="loading" :rows="10" animated class="page-skeleton" />

    <el-alert
      v-else-if="errorMsg"
      type="error"
      :title="errorMsg"
      show-icon
      :closable="false"
      class="page-alert"
    />

    <template v-else-if="task">
      <!-- 顶部任务概览卡 -->
      <section class="overview-card">
        <div class="overview-head">
          <h1 class="overview-title">{{ task.title || '—' }}</h1>
          <div class="overview-tags">
            <span class="tag tag--source">{{ task.teaching_class_id ? '教学班' : '行政班' }}</span>
            <span class="tag tag--scenario">{{ scenarioLabel(task.scenario_type) }}</span>
            <span class="tag" :class="`tag--${uiStatus}`">{{ statusLabel(uiStatus) }}</span>
          </div>
        </div>
        <dl class="overview-stats">
          <div class="stat-cell">
            <dt class="stat-label">截止时间</dt>
            <dd class="stat-value">{{ formatDateTime(task.deadline) || '—' }}</dd>
          </div>
          <div
            class="stat-cell stat-cell--countdown"
            :class="{
              'stat-cell--danger': deadlinePassed,
              'stat-cell--warn': !deadlinePassed && uiStatus === 'unsubmitted',
            }"
          >
            <dt class="stat-label">剩余时间</dt>
            <dd class="stat-value stat-value--emphasis">
              {{ deadlinePassed ? '已截止' : countdownText || '—' }}
            </dd>
          </div>
          <div class="stat-cell stat-cell--score">
            <dt class="stat-label">满分</dt>
            <dd class="stat-value">
              <span class="stat-num">{{ task.max_score ?? '—' }}</span>
              <span v-if="task.max_score != null" class="stat-unit">分</span>
            </dd>
          </div>
          <div class="stat-cell">
            <dt class="stat-label">提交次数</dt>
            <dd class="stat-value stat-value--stack">
              <span class="submit-remain">
                剩余
                <em :class="{ 'submit-remain--zero': submitRemaining <= 0 }">{{ submitRemaining }}</em>
                次
              </span>
              <span class="submit-detail">最多 {{ maxSubmissions }} 次 · 已提交 {{ submitCount }} 次</span>
            </dd>
          </div>
        </dl>
      </section>

      <!-- 系统提示条 -->
      <div class="info-strip">
        <el-icon class="info-strip-icon"><InfoFilled /></el-icon>
        <span>
          上传实训成果后，系统会自动解析文档、PDF、图片和源码压缩包，教师批改后可在成绩与报告中查看 AI 评价、智能核查结果和个人报告。
        </span>
      </div>

      <!-- 双栏主体 -->
      <div class="page-layout">
        <!-- 左侧：任务说明 -->
        <div class="col-main">
          <!-- 任务说明 -->
          <section class="panel-card">
            <h2 class="panel-title">任务说明</h2>
            <div v-if="task.description" class="panel-block">
              <h3 class="panel-subtitle">任务目标</h3>
              <p class="panel-text">{{ task.description }}</p>
            </div>
            <div class="panel-block">
              <h3 class="panel-subtitle">必须完成的功能</h3>
              <ul v-if="requirementsList.length" class="check-list">
                <li v-for="(req, index) in requirementsList" :key="index">
                  <span class="check-box" aria-hidden="true" />
                  <span>{{ req }}</span>
                </li>
              </ul>
              <p v-else class="muted">暂无逐条要求，请联系教师补充。</p>
            </div>
          </section>

          <!-- 提交材料要求 -->
          <section class="panel-card">
            <h2 class="panel-title">提交材料要求</h2>
            <ul v-if="materialsList.length" class="check-list check-list--material">
              <li v-for="(item, index) in materialsList" :key="index">
                <span class="check-box check-box--empty" aria-hidden="true" />
                <span>{{ item }}</span>
              </li>
            </ul>
            <p v-else class="muted">请参考任务要求与评价维度准备材料；支持 docx / pdf / png / jpg / md / zip。</p>
          </section>

          <!-- 评价维度 -->
          <section class="panel-card">
            <h2 class="panel-title">评价维度</h2>
            <div v-if="metricsRows.length" class="metrics-list">
              <div v-for="row in metricsRows" :key="row.name" class="metric-row">
                <div class="metric-head">
                  <span class="metric-name">{{ row.name }}</span>
                  <span class="metric-weight">{{ row.weight }}%</span>
                </div>
                <div class="metric-bar">
                  <div class="metric-bar-fill" :style="{ width: `${Math.min(100, Number(row.weight) || 0)}%` }" />
                </div>
              </div>
            </div>
            <p v-else class="muted">使用教师/管理员配置的默认维度。</p>
          </section>

          <!-- 课程与教学班信息 -->
          <section class="panel-card panel-card--compact">
            <h2 class="panel-title">课程与教学班信息</h2>
            <dl class="meta-grid">
              <div class="meta-item">
                <dt>课程名称</dt>
                <dd>{{ courseMeta.courseName }}</dd>
              </div>
              <div class="meta-item">
                <dt>教学班</dt>
                <dd>{{ courseMeta.teachingClass }}</dd>
              </div>
              <div class="meta-item">
                <dt>行政班</dt>
                <dd>{{ courseMeta.adminClass }}</dd>
              </div>
              <div class="meta-item">
                <dt>学期</dt>
                <dd>{{ courseMeta.term }}</dd>
              </div>
              <div class="meta-item">
                <dt>任课教师</dt>
                <dd>{{ courseMeta.teacher }}</dd>
              </div>
              <div class="meta-item">
                <dt>实训项目</dt>
                <dd>{{ courseMeta.project }}</dd>
              </div>
            </dl>
          </section>

          <!-- 企业岗位能力标准（默认折叠） -->
          <section v-if="task.enterprise_standard" class="panel-card panel-card--collapse">
            <el-collapse v-model="enterpriseCollapse">
              <el-collapse-item name="enterprise">
                <template #title>
                  <span class="panel-title panel-title--inline">企业岗位能力要求（参考）</span>
                </template>
                <div class="enterprise-body">
                  <h3 class="panel-subtitle">岗位能力标准</h3>
                  <p class="panel-text">{{ task.enterprise_standard }}</p>
                </div>
              </el-collapse-item>
            </el-collapse>
          </section>
        </div>

        <!-- 右侧：提交操作卡 -->
        <aside ref="submitCardRef" class="col-submit">
          <section class="submit-card">
            <h2 class="panel-title">提交操作</h2>

            <!-- 状态摘要 -->
            <div class="submit-summary">
              <div class="summary-row">
                <span class="summary-label">当前状态</span>
                <span class="tag tag--sm" :class="`tag--${uiStatus}`">{{ statusLabel(uiStatus) }}</span>
              </div>
              <div class="summary-row">
                <span class="summary-label">截止时间</span>
                <span class="summary-value summary-value--strong">{{ formatDateTime(task.deadline) || '—' }}</span>
              </div>
              <div class="summary-row summary-row--countdown">
                <span class="summary-label">剩余时间</span>
                <span
                  class="summary-value summary-value--countdown"
                  :class="{ 'stat-danger': deadlinePassed, 'stat-warn': !deadlinePassed && uiStatus === 'unsubmitted' }"
                >
                  {{ deadlinePassed ? '已截止' : countdownText || '—' }}
                </span>
              </div>
              <div class="summary-row">
                <span class="summary-label">提交次数</span>
                <span class="summary-value">
                  剩余 <em class="summary-num">{{ submitRemaining }}</em> / {{ maxSubmissions }} 次
                </span>
              </div>
            </div>

            <div class="format-hint">
              <p class="format-line"><strong>支持格式：</strong>docx / pdf / png / jpg / md / zip / py / js / java / cpp / c 等</p>
              <p class="format-line"><strong>单文件最大</strong> 50MB · <strong>最多</strong> {{ maxAttachments }} 个 · <strong>总计</strong> 100MB</p>
              <p class="format-line format-line--muted">可提交文字说明和多个附件，至少填写一项。多文件可直接选择，也可打包为 zip 上传。</p>
            </div>

            <div v-if="hasResubmitPermission && submitRemaining > 0" class="submit-notice submit-notice--success">
              教师已授权你重新提交本作业（剩余 {{ submitRemaining }} 次机会）
              <span v-if="task.resubmit_expire_at">，请在 {{ formatDateTime(task.resubmit_expire_at) }} 前完成</span>
            </div>
            <div v-else-if="deadlinePassed && !task.completed && !hasResubmitPermission" class="submit-notice submit-notice--danger">
              任务已截止，无法提交
            </div>
            <div v-else-if="submitLimitReached && task.completed" class="submit-notice submit-notice--info">
              您已提交本任务，提交次数已用完，无法再次修改
            </div>
            <div v-else-if="submitLimitReached" class="submit-notice submit-notice--danger">
              已达到最大提交次数，无法再次提交
            </div>

            <el-form :model="submitForm" class="submit-form" label-position="top">
              <el-form-item label="文字说明">
                <el-input
                  v-model="submitForm.content"
                  type="textarea"
                  :rows="4"
                  :disabled="submitBlocked"
                  placeholder="建议填写完成步骤、运行环境、自测结果、遇到的问题等。此处文字会单独展示给教师，附件内容也会参与 AI 批改。"
                />
              </el-form-item>

              <el-form-item v-if="codeRunEnabled" label="代码内容">
                <div class="code-run-block">
                  <el-select v-model="submitForm.codeLanguage" :disabled="submitBlocked" style="width: 160px; margin-bottom: 8px">
                    <el-option v-for="lang in codeLanguages" :key="lang.value" :label="lang.label" :value="lang.value" />
                  </el-select>
                  <el-input
                    v-model="submitForm.codeContent"
                    type="textarea"
                    :rows="8"
                    :disabled="submitBlocked"
                    placeholder="在此粘贴代码后点击「运行检查」。任务要求代码运行时，须先运行成功或完成检查后再提交。"
                    class="code-textarea"
                  />
                  <div class="code-run-actions">
                    <el-button :disabled="submitBlocked || codeRunning" :loading="codeRunning" @click="runCodeCheck">
                      运行检查
                    </el-button>
                    <el-button :disabled="submitBlocked" @click="clearCode">清空</el-button>
                  </div>
                  <SubmissionCodeRunPanel v-if="codeRunPreview" :code-run="codeRunPreview" />
                </div>
              </el-form-item>

              <el-form-item label="上传附件">
                <el-upload
                  class="upload-block"
                  :auto-upload="false"
                  :limit="maxAttachments"
                  multiple
                  :disabled="submitBlocked"
                  :on-change="onFileChange"
                  :on-remove="onFileRemove"
                  :on-exceed="onFileExceed"
                  :file-list="fileList"
                  drag
                >
                  <el-icon class="upload-icon"><UploadFilled /></el-icon>
                  <div class="upload-text">将文件拖到此处，或<em>点击选择文件</em></div>
                  <template #tip>
                    <div class="upload-tip">
                      可提交文字说明和多个附件，至少填写一项。多文件可直接选择，也可打包为 <strong>.zip</strong> 上传
                    </div>
                  </template>
                </el-upload>

                <ul v-if="fileList.length" class="file-list">
                  <li v-for="file in fileList" :key="file.uid" class="file-item">
                    <div class="file-item-main">
                      <el-icon class="file-icon"><Document /></el-icon>
                      <div class="file-meta">
                        <span class="file-name" :title="file.name">{{ file.name }}</span>
                        <span class="file-sub">
                          {{ formatFileSize(file.size ?? file.raw?.size) }}
                          · {{ fileTypeLabel(file.name) }}
                          · {{ file.status === 'ready' ? '待提交' : file.status || '待提交' }}
                        </span>
                      </div>
                    </div>
                    <el-button
                      v-if="!submitBlocked"
                      link
                      type="danger"
                      size="small"
                      @click="removeFile(file)"
                    >
                      删除
                    </el-button>
                  </li>
                </ul>
              </el-form-item>

              <div class="submit-actions">
                <template v-if="uiStatus === 'unsubmitted' && !deadlinePassed">
                  <el-button
                    type="primary"
                    size="large"
                    class="btn-primary-block"
                    :loading="parsingZip || vlRecognizing"
                    :disabled="submitBlocked || parsingZip || vlRecognizing"
                    @click="onSubmitClick"
                  >
                    {{
                      vlRecognizing
                        ? '正在进行图片视觉识别…'
                        : parsingZip
                          ? '正在解析压缩包…'
                          : '提交成果'
                    }}
                  </el-button>
                </template>

                <template v-else-if="uiStatus === 'expired'">
                  <el-button type="primary" size="large" class="btn-primary-block" disabled>
                    提交成果
                  </el-button>
                </template>

                <template v-else-if="uiStatus === 'graded' || uiStatus === 'completed'">
                  <el-button type="primary" size="large" class="btn-primary-block" @click="viewResults">
                    查看成绩与报告
                  </el-button>
                  <el-button size="large" class="btn-secondary-block" @click="openMySubmission">
                    查看我的提交
                  </el-button>
                </template>

                <template v-else>
                  <el-button type="primary" size="large" class="btn-primary-block" @click="openMySubmission">
                    查看我的提交
                  </el-button>
                  <el-tooltip
                    :disabled="canViewResults"
                    content="教师批改后可查看"
                    placement="top"
                  >
                    <span class="btn-tooltip-wrap">
                      <el-button
                        size="large"
                        class="btn-secondary-block"
                        :disabled="!canViewResults"
                        @click="viewResults"
                      >
                        查看成绩与报告
                      </el-button>
                    </span>
                  </el-tooltip>
                  <el-button
                    v-if="!submitBlocked && submitRemaining > 0"
                    size="large"
                    class="btn-secondary-block"
                    :loading="parsingZip || vlRecognizing"
                    @click="onSubmitClick"
                  >
                    重新提交
                  </el-button>
                </template>
              </div>
            </el-form>
          </section>
        </aside>
      </div>

      <StudentMySubmissionPanel
        ref="mySubmissionRef"
        v-model:visible="submissionDrawerVisible"
        :task-id="route.params.id"
        @view-results="viewResults"
      />
    </template>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted, computed, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, UploadFilled, InfoFilled, Document } from '@element-plus/icons-vue'
import { getTaskById } from '../../api/task'
import { submitAssignment as submitApi } from '../../api/submission'
import { createCodeRunJob, getCodeRunJobResult } from '../../api/codeRun'
import { getStudentGradingResults } from '../../api/grading'
import { formatDateTime } from '../../utils/format'
import { CODE_RUN_LANGUAGES } from '../../utils/codeRunLanguages'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRtOnDomains } from '../../composables/useRtOnDomains'
import { useUserStore } from '../../stores/user'
import StudentMySubmissionPanel from '../../components/student/StudentMySubmissionPanel.vue'
import SubmissionCodeRunPanel from '../../components/codeRunner/SubmissionCodeRunPanel.vue'

const maxAttachments = 5

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const submitCardRef = ref(null)
const mySubmissionRef = ref(null)
const enterpriseCollapse = ref([])
const gradeRow = ref(null)
const codeRunning = ref(false)
const codeRunBoundHash = ref('')
const codeRunPreview = ref(null)
const submissionDrawerVisible = ref(false)
const codeLanguages = CODE_RUN_LANGUAGES

function scenarioLabel(type) {
  const m = {
    teaching: '校内教学实训',
    enterprise_collab: '校企协同实训',
    mixed: '综合（教学+企业标准）',
  }
  return m[type] || '综合（教学+企业标准）'
}

function statusLabel(uiStatus) {
  const m = {
    unsubmitted: '未提交',
    submitted: '已提交',
    pending_grade: '待批改',
    graded: '已批改',
    completed: '已完成',
    expired: '已截止',
  }
  return m[uiStatus] || uiStatus
}

function isDeadlinePassed(deadline) {
  if (!deadline) return false
  const t = new Date(deadline).getTime()
  return !Number.isNaN(t) && t < Date.now()
}

function resolveUiStatus(taskData, grade) {
  if (!taskData) return 'unsubmitted'
  const submitted = !!taskData.completed
  const expired = isDeadlinePassed(taskData.deadline)

  if (expired && !submitted) return 'expired'
  if (!submitted) return 'unsubmitted'

  if (grade?.status === 'human_graded') return 'completed'
  if (grade?.status === 'ai_graded') return 'graded'
  if (grade?.status === 'pending' || grade?.status === 'ai_grading' || grade?.status === 'ai_failed') {
    return 'pending_grade'
  }
  if (grade?.status) return 'graded'
  return 'submitted'
}

const task = ref(null)
const loading = ref(true)
const errorMsg = ref('')
const fileList = ref([])
const parsingZip = ref(false)
const vlRecognizing = ref(false)

const submitForm = reactive({
  content: '',
  codeContent: '',
  codeLanguage: 'python',
})

const nowTick = ref(Date.now())
let countdownTimer = null

const uiStatus = computed(() => resolveUiStatus(task.value, gradeRow.value))

const canViewResults = computed(() => {
  const g = gradeRow.value
  if (!g?.submission_id) return false
  return ['ai_graded', 'human_graded'].includes(g.status) || uiStatus.value === 'graded' || uiStatus.value === 'completed'
})

const deadlinePassed = computed(() => isDeadlinePassed(task.value?.deadline))

const maxSubmissions = computed(() => {
  const n = parseInt(String(task.value?.max_submissions ?? 1), 10)
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 9999) : 1
})

const submitCount = computed(() => {
  const n = Number(task.value?.submit_count)
  return Number.isFinite(n) && n >= 0 ? n : 0
})

const submitRemaining = computed(() => {
  const r = Number(task.value?.submit_remaining)
  if (Number.isFinite(r) && r >= 0) return r
  return Math.max(0, maxSubmissions.value - submitCount.value)
})

const submitLimitReached = computed(() => submitRemaining.value <= 0)

const hasResubmitPermission = computed(() => Boolean(task.value?.has_resubmit_permission))

const submitBlocked = computed(() => {
  if (hasResubmitPermission.value && submitRemaining.value > 0) return false
  return deadlinePassed.value || submitLimitReached.value
})

const codeRunEnabled = computed(() => Boolean(Number(task.value?.code_run_enabled)))

const countdownText = computed(() => {
  if (!task.value?.deadline || deadlinePassed.value) return ''
  const d = new Date(task.value.deadline)
  const end = d.getTime()
  if (Number.isNaN(end)) return ''
  const ms = end - nowTick.value
  if (ms <= 0) return ''
  const s = Math.floor(ms / 1000)
  const days = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (days > 0) return `${days} 天 ${h} 小时 ${m} 分`
  if (h > 0) return `${h} 小时 ${m} 分 ${sec} 秒`
  return `${m} 分 ${sec} 秒`
})

const requirementsList = computed(() => {
  if (!task.value?.requirements) return []
  return task.value.requirements.split('\n').filter((item) => item.trim())
})

const criteriaList = computed(() => {
  if (!task.value?.scoring_criteria) return []
  return task.value.scoring_criteria.split('\n').filter((item) => item.trim())
})

const materialsList = computed(() => criteriaList.value)

const metricsRows = computed(() => {
  const em = task.value?.evaluation_metrics
  if (!em) return []
  const arr = Array.isArray(em) ? em : typeof em === 'string' ? tryParse(em) : []
  if (!Array.isArray(arr)) return []
  return arr.map((x) => ({
    name: x.name,
    weight: x.weight,
    maxScore: x.maxScore != null ? x.maxScore : x.weight,
  }))
})

const courseMeta = computed(() => {
  const t = task.value
  if (!t) {
    return {
      courseName: '—',
      teachingClass: '—',
      adminClass: '—',
      term: '—',
      teacher: '—',
      project: '—',
    }
  }
  const course = [t.course_code, t.course_name].filter(Boolean).join(' ')
  const u = userStore.user
  let adminClass = '—'
  if (t.class_name) adminClass = t.class_name
  else if (u?.className) adminClass = u.className
  else if (u?.classId) adminClass = `已加入班级（ID ${u.classId}）`

  return {
    courseName: course || '—',
    teachingClass: t.teaching_class_name
      ? [t.teaching_class_name, t.term_name].filter(Boolean).join(' · ') || '—'
      : '—',
    adminClass,
    term: t.term_name || '—',
    teacher: t.creator_name || u?.classTeacher?.realName || '—',
    project: t.template_project_name || '—',
  }
})

function tryParse(s) {
  try {
    return JSON.parse(s)
  } catch {
    return []
  }
}

function formatFileSize(bytes) {
  if (bytes == null || Number.isNaN(Number(bytes))) return '—'
  const n = Number(bytes)
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function fileTypeLabel(name) {
  if (!name) return '—'
  const ext = String(name).split('.').pop()
  return ext ? ext.toUpperCase() : '—'
}

function isZipFile(file) {
  const name = file?.name || file?.raw?.name
  if (!name) return false
  return /\.zip$/i.test(name)
}

function isImageFile(file) {
  const name = file?.name || file?.raw?.name
  if (!name) return false
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(name)
}

const loadGrades = async (taskId) => {
  try {
    const res = await getStudentGradingResults()
    if (res.success && Array.isArray(res.data)) {
      gradeRow.value = res.data.find((r) => String(r.task_id) === String(taskId)) || null
    } else {
      gradeRow.value = null
    }
  } catch {
    gradeRow.value = null
  }
}

const loadTask = async () => {
  loading.value = true
  errorMsg.value = ''
  task.value = null
  gradeRow.value = null
  const id = route.params.id
  if (!id) {
    errorMsg.value = '无效的任务编号'
    loading.value = false
    return
  }
  try {
    const [response] = await Promise.all([getTaskById(id), loadGrades(id)])
    if (response.success) {
      task.value = response.data
    } else {
      errorMsg.value = response.message || '获取任务失败'
    }
  } catch (e) {
    errorMsg.value = e?.response?.data?.message || e.message || '网络错误，请检查后端是否启动'
  } finally {
    loading.value = false
  }
}

const onFileChange = (_file, list) => {
  fileList.value = list.slice(0, maxAttachments)
}

const onFileRemove = (_file, list) => {
  fileList.value = list
}

const onFileExceed = () => {
  ElMessage.warning(`最多上传 ${maxAttachments} 个附件，请先删除部分文件后再选择`)
}

const removeFile = (file) => {
  fileList.value = fileList.value.filter((f) => f.uid !== file.uid)
}

const clearCode = () => {
  submitForm.codeContent = ''
  codeRunBoundHash.value = ''
  codeRunPreview.value = null
}

const pollCodeRun = async (jobId) => {
  const start = Date.now()
  const tick = async () => {
    const res = await getCodeRunJobResult(jobId)
    const data = res.data
    if (data?.codeHash) codeRunBoundHash.value = data.codeHash
    if (data?.result) {
      codeRunPreview.value = {
        enabled: true,
        status: data.status,
        summary: data.result.summary,
        result: data.result,
      }
    }
    if (['completed', 'failed', 'timeout', 'cancelled'].includes(data?.status)) {
      codeRunning.value = false
      if (data?.status === 'completed' && data?.result?.runExitCode === 0) {
        ElMessage.success('代码运行检查完成')
      } else if (data?.status === 'failed' || data?.status === 'timeout') {
        ElMessage.warning('代码运行未成功，请查看输出')
      }
      return
    }
    if (Date.now() - start > 120000) {
      codeRunning.value = false
      ElMessage.warning('运行结果等待超时')
      return
    }
    setTimeout(tick, 500)
  }
  await tick()
}

const runCodeCheck = async () => {
  if (!submitForm.codeContent?.trim()) {
    const hasCodeFile = fileList.value.some((f) => /\.(py|js|java|c|cpp)$/i.test(f.name || ''))
    if (!hasCodeFile) {
      ElMessage.warning('请先在代码内容区粘贴代码，或上传代码附件')
      return
    }
    ElMessage.warning('代码区为空，请先将代码粘贴到【代码内容】区域后再运行检查')
    return
  }
  codeRunning.value = true
  codeRunPreview.value = { enabled: true, status: 'pending', summary: '排队中…' }
  try {
    const res = await createCodeRunJob({
      sourceCode: submitForm.codeContent,
      language: submitForm.codeLanguage || task.value?.code_run_language || 'python',
      taskId: Number(route.params.id),
    })
    const jobId = res.data?.jobId
    if (!jobId) throw new Error('未返回 jobId')
    if (res.data?.codeHash) codeRunBoundHash.value = res.data.codeHash
    await pollCodeRun(jobId)
  } catch (e) {
    codeRunning.value = false
    ElMessage.error(e?.response?.data?.message || e.message || '运行检查失败')
  }
}

const openMySubmission = () => {
  submissionDrawerVisible.value = true
  nextTick(() => mySubmissionRef.value?.reload?.())
}

const viewResults = () => {
  const sid = gradeRow.value?.submission_id
  if (sid) {
    router.push(`/student/results/${sid}`)
    return
  }
  router.push('/student/results')
}

const onSubmitClick = async () => {
  if (deadlinePassed.value) {
    ElMessage.warning('已超过截止时间，无法提交')
    return
  }
  if (submitLimitReached.value) {
    ElMessage.error('已达到最大提交次数，无法再次提交')
    return
  }
  if (!submitForm.content?.trim() && !submitForm.codeContent?.trim() && !fileList.value.length) {
    ElMessage.error('请填写文字说明、代码内容或上传至少一个附件')
    return
  }

  try {
    await ElMessageBox.confirm(
      '提交后将进入教师批改流程，如提交次数已用完，将无法再次修改。',
      '确认提交成果？',
      {
        confirmButtonText: '确认提交',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )
  } catch {
    return
  }

  await submitAssignment()
}

const submitAssignment = async () => {
  const formData = new FormData()
  formData.append('taskId', route.params.id)
  formData.append('submissionText', submitForm.content || '')
  formData.append('content', submitForm.content || '')
  formData.append('codeContent', submitForm.codeContent || '')
  formData.append('codeLanguage', submitForm.codeLanguage || task.value?.code_run_language || 'python')
  if (codeRunBoundHash.value) {
    formData.append('codeRunBoundHash', codeRunBoundHash.value)
  }
  for (const f of fileList.value) {
    if (f.raw) formData.append('files', f.raw)
  }

  const zipSubmit = fileList.value.some((f) => isZipFile(f))
  const imageSubmit = fileList.value.some((f) => isImageFile(f))
  if (zipSubmit) {
    parsingZip.value = true
    ElMessage.info('正在智能解析压缩包内容…')
  } else if (imageSubmit) {
    vlRecognizing.value = true
    ElMessage.info('正在调用 Qwen-VL 识别图片内容…')
  }

  try {
    const timeout = zipSubmit || imageSubmit ? { timeout: 180000 } : {}
    const response = await submitApi(formData, timeout)
    if (response.success) {
      submitForm.content = ''
      submitForm.codeContent = ''
      codeRunBoundHash.value = ''
      codeRunPreview.value = null
      fileList.value = []
      submissionDrawerVisible.value = true
      await loadTask()
      mySubmissionRef.value?.reload?.()

      let extra = ''
      if (zipSubmit && typeof response.archiveExtractedFileCount === 'number') {
        extra = `\n压缩包已解析，共提取 ${response.archiveExtractedFileCount} 个文件。`
      } else if (imageSubmit && response.vlRecognition?.status === 'done') {
        extra = '\n图片视觉识别已完成，已写入提交内容供 AI 批改。'
      } else if (imageSubmit && response.vlRecognition?.status === 'failed') {
        extra = `\n${response.vlRecognition?.error || '图片视觉识别失败，已按原占位文本提交'}`
      }

      await ElMessageBox.alert(
        `提交时间：${formatDateTime(new Date())}\n当前状态：已提交，待教师批改\n后续可在「成绩与报告」中查看 AI 评价、教师评语和个人报告。${extra}`,
        '提交成功',
        { type: 'success', confirmButtonText: '知道了' }
      )
    }
  } catch (error) {
    const detail =
      error?.response?.data?.error ||
      error?.response?.data?.message ||
      error?.message ||
      '提交失败'
    ElMessage.error(detail)
    console.error(error)
  } finally {
    parsingZip.value = false
    vlRecognizing.value = false
  }
}

watch(
  () => [submitForm.codeContent, submitForm.codeLanguage, fileList.value.length],
  () => {
    codeRunBoundHash.value = ''
  }
)

watch(
  () => route.params.id,
  () => {
    loadTask()
  }
)

onMounted(() => {
  loadTask()
  countdownTimer = setInterval(() => {
    nowTick.value = Date.now()
  }, 1000)
})

useRtOnDomains(['tasks', 'submissions', 'submission_student', 'grading', 'similarity'], () => {
  loadTask()
})

onUnmounted(() => {
  if (countdownTimer) clearInterval(countdownTimer)
})
</script>

<style scoped>
.task-detail-page {
  min-height: 100%;
  padding: 20px 24px 32px;
  background: #f5f7fa;
}

.page-toolbar {
  margin-bottom: 16px;
}

.back-btn {
  border: 1px solid #e5eaf2;
  background: #fff;
  color: #1d5fd6;
}

.page-skeleton,
.page-alert {
  margin-bottom: 16px;
}

/* 概览卡 */
.overview-card {
  background: #fff;
  border: 1px solid #e5eaf2;
  border-radius: 12px;
  padding: 20px 24px;
  box-shadow: 0 1px 4px rgba(15, 45, 61, 0.06);
  margin-bottom: 12px;
}

.overview-head {
  margin-bottom: 16px;
}

.overview-title {
  margin: 0 0 12px;
  font-size: 20px;
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
  line-height: 20px;
}

.tag--sm {
  padding: 1px 8px;
  font-size: 11px;
}

.tag--source {
  background: #f3f4f6;
  color: #4b5563;
  border: 1px solid #e5e7eb;
}

.tag--scenario {
  background: #eef5ff;
  color: #1d5fd6;
  border: 1px solid #bfdbfe;
}

.tag--unsubmitted {
  background: #fff7ed;
  color: #ea580c;
  border: 1px solid #fed7aa;
}

.tag--submitted {
  background: #eff6ff;
  color: #1d5fd6;
  border: 1px solid #bfdbfe;
}

.tag--pending_grade {
  background: #f0f4ff;
  color: #475569;
  border: 1px solid #cbd5e1;
}

.tag--graded,
.tag--completed {
  background: #ecfdf5;
  color: #16a34a;
  border: 1px solid #a7f3d0;
}

.tag--expired {
  background: #fef2f2;
  color: #dc2626;
  border: 1px solid #fecaca;
}

.overview-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin: 0;
  padding-top: 18px;
  border-top: 1px solid #eef1f6;
}

.stat-cell {
  min-width: 0;
  padding: 14px 16px;
  background: #f9fafb;
  border: 1px solid #eef1f6;
  border-radius: 10px;
}

.stat-cell--countdown {
  background: #fffbeb;
  border-color: #fde68a;
}

.stat-cell--countdown.stat-cell--warn {
  background: #fffbeb;
  border-color: #fcd34d;
}

.stat-cell--countdown.stat-cell--danger {
  background: #fef2f2;
  border-color: #fecaca;
}

.stat-cell--score {
  background: #eef5ff;
  border-color: #dbeafe;
}

.stat-label {
  margin: 0 0 8px;
  font-size: 13px;
  color: #6b7280;
  font-weight: 500;
  letter-spacing: 0.02em;
}

.stat-value {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: #1f2d3d;
  line-height: 1.4;
  word-break: break-word;
}

.stat-value--emphasis {
  font-size: 20px;
  font-weight: 700;
  color: #d97706;
  letter-spacing: 0.01em;
}

.stat-cell--countdown.stat-cell--danger .stat-value--emphasis {
  color: #dc2626;
}

.stat-num {
  font-size: 28px;
  font-weight: 700;
  color: #1d5fd6;
  line-height: 1.1;
  vertical-align: baseline;
}

.stat-unit {
  margin-left: 4px;
  font-size: 15px;
  font-weight: 500;
  color: #6b7280;
  vertical-align: baseline;
}

.stat-value--stack {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.submit-remain {
  font-size: 16px;
  font-weight: 600;
  color: #1f2d3d;
  line-height: 1.2;
}

.submit-remain em {
  font-style: normal;
  font-size: 26px;
  font-weight: 700;
  color: #1d5fd6;
  margin: 0 2px;
  vertical-align: -1px;
}

.submit-remain--zero {
  color: #dc2626 !important;
}

.submit-detail {
  font-size: 12px;
  font-weight: 400;
  color: #9ca3af;
  line-height: 1.4;
}

.stat-warn {
  color: #f59e0b;
}

.stat-danger {
  color: #dc2626;
}

/* 提示条 */
.info-strip {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 14px;
  margin-bottom: 16px;
  background: #eef5ff;
  border-radius: 8px;
  font-size: 13px;
  color: #4b5563;
  line-height: 1.6;
}

.info-strip-icon {
  flex-shrink: 0;
  margin-top: 2px;
  color: #1d5fd6;
  font-size: 16px;
}

/* 双栏布局 */
.page-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.85fr) minmax(300px, 1fr);
  gap: 16px;
  align-items: start;
}

.col-submit {
  position: sticky;
  top: 16px;
}

/* 面板卡片 */
.panel-card {
  background: #fff;
  border: 1px solid #e5eaf2;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 16px;
  box-shadow: 0 1px 4px rgba(15, 45, 61, 0.04);
}

.panel-card--compact {
  padding: 16px 20px;
}

.panel-card--collapse {
  padding: 0;
  overflow: hidden;
}

.panel-card--collapse :deep(.el-collapse) {
  border: none;
}

.panel-card--collapse :deep(.el-collapse-item__header) {
  padding: 16px 20px;
  border: none;
  height: auto;
  line-height: 1.5;
  background: transparent;
}

.panel-card--collapse :deep(.el-collapse-item__wrap) {
  border: none;
}

.panel-card--collapse :deep(.el-collapse-item__content) {
  padding: 0 20px 16px;
}

.panel-title {
  margin: 0 0 14px;
  font-size: 16px;
  font-weight: 600;
  color: #1f2d3d;
}

.panel-title--inline {
  margin: 0;
}

.panel-subtitle {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}

.panel-block + .panel-block {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #f0f2f5;
}

.panel-text {
  margin: 0;
  font-size: 14px;
  color: #4b5563;
  line-height: 1.7;
}

.muted {
  margin: 0;
  font-size: 14px;
  color: #9ca3af;
}

/* Checklist */
.check-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.check-list li {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 0;
  font-size: 14px;
  color: #374151;
  line-height: 1.5;
  border-bottom: 1px solid #f3f4f6;
}

.check-list li:last-child {
  border-bottom: none;
}

.check-box {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  margin-top: 2px;
  border-radius: 3px;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  position: relative;
}

.check-box::after {
  content: '';
  position: absolute;
  left: 4px;
  top: 1px;
  width: 5px;
  height: 9px;
  border: solid #16a34a;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

.check-box--empty {
  background: #fff;
  border: 1px solid #d1d5db;
}

.check-box--empty::after {
  display: none;
}

/* 评价维度 */
.metrics-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.metric-head {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
  font-size: 13px;
}

.metric-name {
  color: #374151;
}

.metric-weight {
  color: #6b7280;
  font-weight: 500;
}

.metric-bar {
  height: 6px;
  background: #f0f2f5;
  border-radius: 3px;
  overflow: hidden;
}

.metric-bar-fill {
  height: 100%;
  background: #1d5fd6;
  border-radius: 3px;
  opacity: 0.75;
}

/* 课程信息 */
.meta-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px 20px;
  margin: 0;
}

.meta-item dt {
  margin: 0 0 2px;
  font-size: 12px;
  color: #9ca3af;
  font-weight: 400;
}

.meta-item dd {
  margin: 0;
  font-size: 13px;
  color: #374151;
  line-height: 1.5;
}

.enterprise-body {
  padding-top: 4px;
}

/* 提交操作卡 */
.submit-card {
  background: #fff;
  border: 1px solid #e5eaf2;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(15, 45, 61, 0.08);
}

.submit-summary {
  padding: 14px;
  margin-bottom: 14px;
  background: #f9fafb;
  border-radius: 8px;
  border: 1px solid #eef1f6;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  font-size: 13px;
}

.summary-row--countdown {
  padding: 8px 0;
  margin: 2px 0;
  border-top: 1px dashed #e5eaf2;
  border-bottom: 1px dashed #e5eaf2;
}

.summary-label {
  color: #6b7280;
  flex-shrink: 0;
  font-weight: 500;
}

.summary-value {
  color: #1f2d3d;
  text-align: right;
  font-weight: 500;
}

.summary-value--strong {
  font-size: 14px;
  font-weight: 600;
}

.summary-value--countdown {
  font-size: 16px;
  font-weight: 700;
  color: #d97706;
}

.summary-num {
  font-style: normal;
  font-size: 18px;
  font-weight: 700;
  color: #1d5fd6;
}

.format-hint {
  margin-bottom: 14px;
  padding-bottom: 14px;
  border-bottom: 1px solid #f0f2f5;
}

.format-line {
  margin: 0 0 4px;
  font-size: 12px;
  color: #374151;
  line-height: 1.5;
}

.format-line--muted {
  color: #9ca3af;
  margin-top: 6px;
}

.submit-notice {
  padding: 8px 12px;
  margin-bottom: 12px;
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.5;
}

.submit-notice--danger {
  background: #fef2f2;
  color: #dc2626;
  border: 1px solid #fecaca;
}

.submit-notice--info {
  background: #eff6ff;
  color: #1d5fd6;
  border: 1px solid #bfdbfe;
}

.submit-form :deep(.el-form-item__label) {
  font-weight: 500;
  color: #374151;
}

.upload-block {
  width: 100%;
}

.upload-block :deep(.el-upload-dragger) {
  border-color: #d1d5db;
  border-radius: 8px;
  padding: 24px 16px;
}

.upload-block :deep(.el-upload-dragger:hover) {
  border-color: #1d5fd6;
}

.upload-icon {
  font-size: 40px;
  color: #9ca3af;
  margin-bottom: 8px;
}

.upload-text {
  font-size: 14px;
  color: #6b7280;
}

.upload-text em {
  color: #1d5fd6;
  font-style: normal;
}

.upload-tip {
  font-size: 12px;
  color: #9ca3af;
  line-height: 1.5;
  margin-top: 6px;
}

.file-list {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
}

.file-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  background: #f9fafb;
  border: 1px solid #e5eaf2;
  border-radius: 8px;
}

.file-item-main {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
}

.file-icon {
  flex-shrink: 0;
  color: #1d5fd6;
  margin-top: 2px;
}

.file-meta {
  min-width: 0;
}

.file-name {
  display: block;
  font-size: 13px;
  color: #1f2d3d;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-sub {
  display: block;
  font-size: 11px;
  color: #9ca3af;
  margin-top: 2px;
}

.submit-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 4px;
}

.btn-primary-block,
.btn-secondary-block {
  width: 100%;
  margin: 0;
}

.btn-secondary-block {
  border-color: #1d5fd6;
  color: #1d5fd6;
}

.btn-tooltip-wrap {
  display: block;
  width: 100%;
}

.btn-tooltip-wrap .el-button {
  width: 100%;
}

/* 响应式 */
@media (max-width: 992px) {
  .page-layout {
    grid-template-columns: 1fr;
  }

  .col-submit {
    position: static;
    order: 2;
  }

  .overview-stats {
    grid-template-columns: repeat(2, 1fr);
  }

  .meta-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 480px) {
  .task-detail-page {
    padding: 12px 16px 24px;
  }

  .overview-stats {
    grid-template-columns: 1fr;
  }
}
</style>
