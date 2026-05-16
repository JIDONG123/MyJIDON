<template>
  <div class="exam-take" :class="{ 'exam-take--fill': fillWorkspace, 'exam-take--review': !fillWorkspace }">
    <template v-if="fillWorkspace">
      <div class="exam-ws-wrap">
        <QbStudentTakeWorkspace
          :title="title"
          :subtitle-lines="examWorkspaceSubtitles"
          :deadline-text="attemptDeadlineText"
          :total-questions="paper.length"
          :current-index="examCurrentIndex"
          :answered-count="answeredCount"
          :elapsed-text="elapsedText"
          :status-label="examSessionStatusLabel"
          :status-tag-type="examSessionStatusTag"
          :read-only="false"
          :saving="savingDraft"
          :submitting="submitting"
          :is-answered-at="isAnsweredAtIndex"
          :is-flagged-at="isFlaggedAtIndex"
          @update:current-index="onExamIndexChange"
          @save="flushAutosaveNow"
          @submit="doSubmit"
          @exit="onExamExit"
          @toggle-flag="toggleExamFlagAt"
        >
          <template #toolbar-mid-extra>
            <span class="ws-extra">本场剩余 <strong>{{ formatExamCountdown(countdownSyncedMs) }}</strong></span>
            <span v-if="tabCount" class="ws-extra ws-warn">切屏 {{ tabCount }} 次</span>
          </template>
          <el-alert
            class="qb-ws-inline-alert"
            type="warning"
            show-icon
            :closable="false"
            title="考试进行中：请勿切换窗口；若教师开启防切屏，频繁切屏将自动交卷。倒计时已与服务器对齐。"
          />
          <div v-if="curPaper" class="qb-ws-q-block">
            <div class="qb-ws-q-head">
              <span class="qb-ws-qno">第 {{ examCurrentIndex + 1 }} 题</span>
              <el-tag size="small" type="primary" effect="plain">{{ qbTypeLabel(curPaper.type) }}</el-tag>
              <span class="qb-ws-qscore">{{ curPaper.max_score }} 分</span>
            </div>
            <div class="qb-ws-stem">{{ curPaper.stem }}</div>
            <div class="qb-ws-answer-box">
              <QbAnswerEditor
                v-model="answers[String(curPaper.eq_id)]"
                :question="curPaper"
                :shuffle-options="shuffleOpts"
                dense
                :char-count-visible="curPaper.type === 'short' || curPaper.type === 'code'"
              />
              <div v-if="curPaper.type === 'code'" class="code-run-row">
                <el-button size="small" :loading="runLoading === curPaper.eq_id" @click="runCode(curPaper.eq_id)">试运行 Python（受限）</el-button>
              </div>
            </div>
          </div>
        </QbStudentTakeWorkspace>
      </div>
    </template>

    <div v-else class="exam-static">
      <div class="exam-review-bar">
        <el-button text type="primary" class="back-btn" @click="goExamList">
          <span class="back-ico">←</span> 返回列表
        </el-button>
      </div>
      <header class="exam-head">
        <div>
          <h1 class="exam-title">{{ title }}</h1>
          <p class="exam-sub">{{ phaseSubtitle }}</p>
        </div>
        <div class="exam-meta">
          <el-tag v-if="phase" size="small" :type="qbExamPhaseTagType(phase)">{{ qbExamPhaseLabel(phase) }}</el-tag>
          <el-tag v-if="phase === 'active' && examEndAt" type="info" size="small">考试窗口截止：{{ formatDateTime(examEndAt) }}</el-tag>
        </div>
      </header>

      <el-alert
        v-if="scoreGate.blocked"
        type="warning"
        show-icon
        :closable="false"
        :title="scoreGate.message"
        class="mb12"
      />

      <el-alert
        v-if="readOnlySubmitted && !paper.length"
        type="success"
        show-icon
        :closable="false"
        title="您已提交本场试卷，作答内容不可修改。"
        class="mb12"
      />

      <el-card v-if="examResult" shadow="never" class="result-card">
        <template #header><span class="result-card-title">本场成绩</span></template>
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="总分">{{ fmtScore(examResult.total_score) }}</el-descriptions-item>
          <el-descriptions-item label="客观分">{{ fmtScore(examResult.objective_score) }}</el-descriptions-item>
          <el-descriptions-item label="主观分">{{ fmtScore(examResult.subjective_score) }}</el-descriptions-item>
          <el-descriptions-item label="班级名次">{{ rankLabel }}</el-descriptions-item>
          <el-descriptions-item label="交卷时间" :span="2">{{ formatDateTime(examResult.submitted_at) }}</el-descriptions-item>
        </el-descriptions>

        <el-table v-if="examResult.scores_by_type?.length" :data="examResult.scores_by_type" border size="small" class="mt12">
          <el-table-column label="题型" min-width="100">
            <template #default="{ row }">{{ qbTypeLabel(row.type) }}</template>
          </el-table-column>
          <el-table-column prop="count" label="题数" width="72" align="center" />
          <el-table-column label="得分小计" width="110" align="right">
            <template #default="{ row }">{{ fmtScore(row.earned) }}</template>
          </el-table-column>
          <el-table-column label="满分小计" width="110" align="right">
            <template #default="{ row }">{{ fmtScore(row.max) }}</template>
          </el-table-column>
        </el-table>

        <el-table v-if="examResult.breakdown?.length" :data="examResult.breakdown" border size="small" class="mt12">
          <el-table-column prop="sort_index" label="#" width="48" align="center" />
          <el-table-column prop="stem_short" label="题目摘要" min-width="160" show-overflow-tooltip />
          <el-table-column label="题型" width="96">
            <template #default="{ row }">{{ qbTypeLabel(row.type) }}</template>
          </el-table-column>
          <el-table-column label="得分" width="120" align="right">
            <template #default="{ row }">
              <span v-if="row.pending && row.earned == null" class="pending-tag">待批改</span>
              <span v-else>{{ fmtScore(row.earned) }} / {{ fmtScore(row.max) }}</span>
            </template>
          </el-table-column>
        </el-table>

        <el-collapse v-if="examResult.ai_suggestion != null" class="mt12">
          <el-collapse-item title="AI 辅助评分建议（供参考）" name="ai">
            <pre class="ai-pre">{{ aiSuggestionText }}</pre>
          </el-collapse-item>
        </el-collapse>
      </el-card>

      <el-card v-if="phase === 'upcoming'" shadow="never" class="gate-card">
        <template #header><span class="gate-card-title">考试尚未开始</span></template>
        <p class="gate-line">开考时间：{{ formatDateTime(examStartAt) }}</p>
        <p class="gate-line">结束时间：{{ formatDateTime(examEndAt) }}</p>
        <div class="countdown-wrap">
          <div class="countdown-label">距离开考还有</div>
          <div class="countdown-big">{{ formatUntilStart(msToExamStart) }}</div>
        </div>
        <p class="gate-hint">未到开放时间无法作答；开考后请在考试列表点击「进入考试」。</p>
      </el-card>

      <el-alert
        v-else-if="phase === 'ended'"
        type="warning"
        show-icon
        :closable="false"
        title="本场考试已结束。"
        :description="phaseText || '若已交卷，成绩见上方卡片（未到公布时间则暂不可查）。'"
        class="mb12"
      />

      <el-alert v-else-if="phase === 'hidden'" type="warning" show-icon :closable="false" :title="phaseText || '本场考试未发布或当前不可见。'" />

      <el-alert
        v-else-if="examStartFailure"
        type="error"
        show-icon
        :closable="false"
        :title="examStartFailure.message || '无法进入考试'"
        class="mb12"
      />

      <el-skeleton v-else-if="phase === 'active' && !readOnlySubmitted" :rows="4" animated />
    </div>

    <el-dialog v-model="runDlg" title="Python 试运行" width="680px" destroy-on-close>
      <el-alert type="warning" show-icon :closable="false" title="教学演示环境：进程超时与输出上限限制，非强隔离；生产请使用容器判题。" class="mb8" />
      <pre class="run-pre">{{ runResult }}</pre>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, reactive, watch, computed, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useRtOnDomains } from '../../composables/useRtOnDomains'
import { useUserStore } from '../../stores/user'
import { useStudentExamUiStore } from '../../stores/studentExamUi'
import { getExamMeta, startExam, autosaveExam, tabExamEvent, submitExam, runExamCode, getExamResult } from '../../api/qb'
import { getRealtimeSocket } from '../../socket/realtimeClient'
import { ElMessage, ElMessageBox } from 'element-plus'
import QbAnswerEditor from '../../components/qb/QbAnswerEditor.vue'
import QbStudentTakeWorkspace from '../../components/qb/QbStudentTakeWorkspace.vue'
import { qbTypeLabel, qbExamPhaseLabel, qbExamPhaseTagType } from '../../utils/qbLabels'
import { formatDateTime } from '../../utils/format'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const examUi = useStudentExamUiStore()
const id = () => Number(route.params.id)

const goExamList = () => {
  router.push('/student/qbank/exams')
}

const title = ref('在线考试')
const phase = ref('')
const phaseText = ref('')
const examStartAt = ref('')
const examEndAt = ref('')
const examResult = ref(null)
const scoreGate = ref({ blocked: false, message: '' })
const paper = ref([])
const answers = reactive({})
const expiresAt = ref('')
const tabCount = ref(0)
const submitting = ref(false)
const savingDraft = ref(false)
const runDlg = ref(false)
const runResult = ref('')
const runLoading = ref(null)
const shuffleOpts = ref(false)
const readOnlySubmitted = ref(false)
/** start 接口失败（如试卷无题、已交卷与 meta 不一致等），用于静态区提示，避免只显示骨架 */
const examStartFailure = ref(null)
const nowTick = ref(Date.now())
const examCurrentIndex = ref(0)
const examFlags = reactive({})
const sessionStartMs = ref(0)
let autosaveTimer = null
let tickHandle = null

const fillWorkspace = computed(() => phase.value === 'active' && paper.value.length > 0)

const curPaper = computed(() => paper.value[examCurrentIndex.value] || null)

const phaseSubtitle = computed(() => {
  const ph = phase.value
  const raw = String(phaseText.value || '').trim()
  const labeled = qbExamPhaseLabel(ph)
  if (!ph) return raw || '正在加载…'
  if (ph === 'hidden') return raw || labeled
  if (raw && raw !== labeled && !raw.startsWith(labeled)) return `${labeled} · ${raw}`
  return raw || labeled
})

const rankLabel = computed(() => {
  const r = examResult.value?.rank_in_class
  if (r == null || r === '') return '—'
  const n = Number(r)
  return Number.isFinite(n) ? `第 ${n} 名` : '—'
})

const aiSuggestionText = computed(() => {
  const s = examResult.value?.ai_suggestion
  if (s == null) return ''
  return typeof s === 'string' ? s : JSON.stringify(s, null, 2)
})

const serverSkewMs = ref(0)
const serverHallEndMs = ref(0)

const msToExamStart = computed(() => {
  if (!examStartAt.value || phase.value !== 'upcoming') return null
  return new Date(examStartAt.value).getTime() - nowTick.value
})

const countdownSyncedMs = computed(() => {
  const _ = nowTick.value
  if (phase.value !== 'active' || !paper.value.length) return null
  const attemptMs = expiresAt.value ? new Date(expiresAt.value).getTime() : null
  const hallMs = serverHallEndMs.value || (examEndAt.value ? new Date(examEndAt.value).getTime() : null)
  if (attemptMs == null && hallMs == null) return null
  const d1 = attemptMs != null ? attemptMs : Infinity
  const d2 = hallMs != null ? hallMs : Infinity
  const deadline = Math.min(d1, d2)
  if (!Number.isFinite(deadline)) return null
  return Math.max(0, deadline - (Date.now() + serverSkewMs.value))
})

function isAnswered(eqId) {
  const v = answers[String(eqId)]
  if (v == null) return false
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'object') return Object.keys(v).length > 0
  return String(v).trim().length > 0
}

function isAnsweredAtIndex(i) {
  const p = paper.value[i]
  if (!p) return false
  return isAnswered(p.eq_id)
}

function isFlaggedAtIndex(i) {
  const p = paper.value[i]
  if (!p) return false
  return !!examFlags[String(p.eq_id)]
}

const answeredCount = computed(() => {
  if (!paper.value.length) return 0
  return paper.value.filter((p) => isAnswered(p.eq_id)).length
})

const elapsedText = computed(() => {
  if (!sessionStartMs.value) return '00:00'
  const sec = Math.max(0, Math.floor((nowTick.value - sessionStartMs.value) / 1000))
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
})

const attemptDeadlineText = computed(() => (expiresAt.value ? formatDateTime(expiresAt.value) : ''))

const examWorkspaceSubtitles = computed(() => {
  const cls = userStore.user?.className || userStore.user?.class_name || ''
  const lines = ['在线考试 · 职教实训']
  if (cls) lines.push(`班级：${cls}`)
  if (examEndAt.value) lines.push(`考试窗口截止 ${formatDateTime(examEndAt.value)}`)
  return lines
})

const examSessionStatusLabel = computed(() => '作答中')
const examSessionStatusTag = computed(() => 'success')

function examFlagsKey() {
  return `qb_exam_flag_${id()}`
}

function loadExamFlags() {
  try {
    const raw = sessionStorage.getItem(examFlagsKey())
    const arr = raw ? JSON.parse(raw) : []
    Object.keys(examFlags).forEach((k) => delete examFlags[k])
    for (const x of Array.isArray(arr) ? arr : []) {
      examFlags[String(x)] = true
    }
  } catch {
    /* ignore */
  }
}

function persistExamFlags() {
  try {
    const ids = Object.keys(examFlags).filter((k) => examFlags[k])
    sessionStorage.setItem(examFlagsKey(), JSON.stringify(ids))
  } catch {
    /* ignore */
  }
}

function toggleExamFlagAt(idx) {
  const p = paper.value[idx]
  if (!p) return
  const k = String(p.eq_id)
  if (examFlags[k]) delete examFlags[k]
  else examFlags[k] = true
  persistExamFlags()
}

function onExamIndexChange(i) {
  examCurrentIndex.value = i
  if (autosaveTimer) clearTimeout(autosaveTimer)
  autosaveExam(id(), { ...answers }).catch(() => {})
}

function fmtScore(v) {
  if (v == null || v === '') return '—'
  const n = Number(v)
  return Number.isFinite(n) ? n.toFixed(2) : '—'
}

function formatExamCountdown(ms) {
  if (ms == null || !Number.isFinite(ms)) return '—'
  if (ms <= 0) return '00:00'
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function formatUntilStart(ms) {
  if (ms == null || !Number.isFinite(ms)) return '—'
  if (ms <= 0) return '已到开考时间，请返回列表刷新后进入考试'
  const s = Math.floor(ms / 1000)
  const days = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (days > 0) return `${days} 天 ${h} 小时 ${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  if (h > 0) return `${h} 小时 ${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

let examLiveCleanups = []
let lastTabReportAt = 0

function leaveExamLiveClient() {
  for (const fn of examLiveCleanups) {
    try {
      fn()
    } catch {
      /* ignore */
    }
  }
  examLiveCleanups = []
  const sock = getRealtimeSocket()
  if (sock) {
    try {
      sock.emit('leave_exam_live', {})
    } catch {
      /* ignore */
    }
  }
  serverSkewMs.value = 0
}

function joinExamLiveClient() {
  leaveExamLiveClient()
  const sock = getRealtimeSocket()
  if (!sock) return
  const eid = id()
  const onTick = (p) => {
    if (!p || p.serverNowMs == null || p.examEndMs == null) return
    serverSkewMs.value = p.serverNowMs - Date.now()
    serverHallEndMs.value = Number(p.examEndMs)
  }
  sock.on('exam_tick', onTick)
  examLiveCleanups.push(() => sock.off('exam_tick', onTick))
  const joinOnce = () => {
    sock.emit('join_exam_live', { mode: 'take', examId: eid }, (ack) => {
      if (ack?.ok && ack.examEndMs != null) serverHallEndMs.value = Number(ack.examEndMs)
    })
  }
  joinOnce()
  sock.on('connect', joinOnce)
  examLiveCleanups.push(() => sock.off('connect', joinOnce))
}

async function reportExamTabHidden() {
  if (phase.value !== 'active' || !paper.value.length || readOnlySubmitted.value) return
  const t = Date.now()
  if (t - lastTabReportAt < 550) return
  lastTabReportAt = t
  try {
    const r = await tabExamEvent(id())
    if (r.success && r.data?.autoSubmitted) {
      ElMessage.warning('切屏次数超限，系统已自动交卷')
      readOnlySubmitted.value = true
      paper.value = []
      clearAnswers()
      leaveExamLiveClient()
      await loadExamResult()
      await loadMeta()
    } else if (r.success) {
      tabCount.value = r.data.tab_switch_count
    }
  } catch {
    /* ignore */
  }
}

const loadExamResult = async () => {
  examResult.value = null
  scoreGate.value = { blocked: false, message: '' }
  try {
    const res = await getExamResult(id())
    if (!res.success || !res.data) return
    if (res.data.visible === false) {
      scoreGate.value = { blocked: true, message: res.data.message || '成绩暂不可查' }
      return
    }
    examResult.value = res.data
  } catch {
    /* ignore */
  }
}

const runCode = async (eqId) => {
  runLoading.value = eqId
  try {
    const res = await runExamCode(id(), {
      eq_id: eqId,
      code: answers[String(eqId)] != null ? String(answers[String(eqId)]) : '',
    })
    if (res.success) {
      runResult.value = JSON.stringify(res.data, null, 2)
      runDlg.value = true
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '运行失败')
  } finally {
    runLoading.value = null
  }
}

const loadMeta = async () => {
  try {
    const res = await getExamMeta(id())
    if (!res.success) {
      phase.value = 'hidden'
      phaseText.value = res.message || '考试不存在或不可见'
      examStartAt.value = ''
      examEndAt.value = ''
      serverHallEndMs.value = 0
      return
    }
    const ex = res.data.exam
    title.value = ex?.title || '在线考试'
    phase.value = res.data.phase?.phase || ''
    phaseText.value = res.data.phase?.message || ''
    examStartAt.value = ex?.start_at || ''
    examEndAt.value = ex?.end_at || ''
    if (ex?.end_at) {
      const hm = new Date(ex.end_at).getTime()
      if (Number.isFinite(hm)) serverHallEndMs.value = hm
    } else {
      serverHallEndMs.value = 0
    }
  } catch (e) {
    phase.value = 'hidden'
    phaseText.value = e?.response?.data?.message || '加载考试信息失败'
    examStartAt.value = ''
    examEndAt.value = ''
    serverHallEndMs.value = 0
  }
}

function clearAnswers() {
  for (const k of Object.keys(answers)) delete answers[k]
}

const boot = async () => {
  leaveExamLiveClient()
  readOnlySubmitted.value = false
  examStartFailure.value = null
  paper.value = []
  clearAnswers()
  expiresAt.value = ''
  examCurrentIndex.value = 0
  await loadMeta()
  if (phase.value !== 'active') {
    if (phase.value !== 'upcoming') await loadExamResult()
    return
  }
  try {
    const res = await startExam(id())
    if (!res.success) {
      ElMessage.error(res.message || '无法开始')
      examStartFailure.value = { message: res.message || '无法开始' }
      return
    }
    paper.value = res.data.paper || []
    shuffleOpts.value = !!res.data.shuffle_options
    expiresAt.value = res.data.attempt_expires_at || ''
    tabCount.value = res.data.tab_switch_count || 0
    for (const p of paper.value) {
      if (p.my_answer != null) answers[String(p.eq_id)] = String(p.my_answer)
      else answers[String(p.eq_id)] = answers[String(p.eq_id)] || ''
    }
    examCurrentIndex.value = 0
    loadExamFlags()
    sessionStartMs.value = Date.now()
    await nextTick()
    joinExamLiveClient()
  } catch (e) {
    const body = e?.response?.data || {}
    const msg = body.message
    const code = body.code
    if (code === 'NOT_STARTED') {
      phase.value = 'upcoming'
      phaseText.value = msg || '考试尚未开始'
    } else if (code === 'ENDED') {
      phase.value = 'ended'
      phaseText.value = msg || '考试已结束'
    } else if (code === 'ALREADY_SUBMITTED' || (msg && String(msg).includes('已交卷'))) {
      readOnlySubmitted.value = true
      phaseText.value = msg || '已交卷'
      await loadExamResult()
    } else if (code === 'NO_QUESTIONS') {
      examStartFailure.value = { message: msg || '试卷未配置题目，请联系任课教师后再试。' }
      ElMessage.error(examStartFailure.value.message)
    } else {
      examStartFailure.value = { message: msg || '无法开始考试' }
      ElMessage.error(examStartFailure.value.message)
    }
    if (code === 'ENDED' || (phase.value === 'ended' && !readOnlySubmitted.value)) await loadExamResult()
    await loadMeta()
  }
}

/** rt 推送后轻量拉接口：作答中只刷 meta（考试窗口/阶段），其余走完整 boot */
const refreshFromRt = async () => {
  try {
    if (phase.value === 'active' && paper.value.length > 0 && !readOnlySubmitted.value) {
      await loadMeta()
      return
    }
    await boot()
  } catch {
    /* ignore */
  }
}

useRtOnDomains(['qb_exams', 'scores'], () => void refreshFromRt())

const scheduleAutosave = () => {
  if (autosaveTimer) clearTimeout(autosaveTimer)
  autosaveTimer = setTimeout(async () => {
    try {
      await autosaveExam(id(), { ...answers })
    } catch {
      /* ignore */
    }
  }, 2000)
}

async function flushAutosaveNow() {
  if (autosaveTimer) clearTimeout(autosaveTimer)
  savingDraft.value = true
  try {
    await autosaveExam(id(), { ...answers })
    ElMessage.success('已暂存')
  } catch {
    ElMessage.error('暂存失败')
  } finally {
    savingDraft.value = false
  }
}

const onVis = () => {
  if (document.visibilityState === 'hidden') void reportExamTabHidden()
}

const onPageHide = () => {
  void reportExamTabHidden()
}

const onExamExit = async () => {
  try {
    await ElMessageBox.confirm('退出后将离开考试页；请在列表再次进入可继续作答（若仍在考试时间内）。是否退出？', '退出考试', {
      type: 'warning',
    })
    if (autosaveTimer) clearTimeout(autosaveTimer)
    savingDraft.value = true
    try {
      await autosaveExam(id(), { ...answers })
    } catch {
      /* ignore */
    } finally {
      savingDraft.value = false
    }
    leaveExamLiveClient()
    goExamList()
  } catch (e) {
    if (e !== 'cancel') {
      /* ignore */
    }
  }
}

const doSubmit = async () => {
  const total = paper.value.length
  const unanswered = paper.value.filter((p) => !isAnswered(p.eq_id)).length
  try {
    if (unanswered > 0) {
      await ElMessageBox.confirm(`尚有 ${unanswered} / ${total} 题未作答，确定交卷吗？`, '交卷', { type: 'warning' })
    } else {
      await ElMessageBox.confirm('确定交卷？提交后不可修改。', '交卷', { type: 'warning' })
    }
    submitting.value = true
    await submitExam(id(), { ...answers })
    readOnlySubmitted.value = true
    paper.value = []
    clearAnswers()
    leaveExamLiveClient()
    await loadExamResult()
    await loadMeta()
    ElMessage.success('交卷成功')
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e?.response?.data?.message || '交卷失败')
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  tickHandle = setInterval(() => {
    nowTick.value = Date.now()
  }, 1000)
  await boot()
  document.addEventListener('visibilitychange', onVis)
  window.addEventListener('pagehide', onPageHide)
})

onUnmounted(() => {
  document.removeEventListener('visibilitychange', onVis)
  window.removeEventListener('pagehide', onPageHide)
  if (autosaveTimer) clearTimeout(autosaveTimer)
  if (tickHandle) clearInterval(tickHandle)
  leaveExamLiveClient()
  examUi.setExamTakeLocksSidebar(false)
})

watch(
  () => route.params.id,
  async () => {
    leaveExamLiveClient()
    await boot()
  }
)

watch(
  () => paper.value.length,
  (n) => {
    if (examCurrentIndex.value >= n) examCurrentIndex.value = Math.max(0, n - 1)
  }
)

watch(
  () => answers,
  () => {
    if (phase.value === 'active' && paper.value.length) scheduleAutosave()
  },
  { deep: true }
)

watch(fillWorkspace, (v) => {
  examUi.setExamTakeLocksSidebar(v)
  if (!v) leaveExamLiveClient()
}, { immediate: true })
</script>

<style scoped>
.exam-take {
  min-height: 0;
}

/* 非作答中：成绩 / 未开始 / 已结束 等，与练习回看一致：顶部返回 + 原内容区可滚动 */
.exam-take--review {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 20px 40px;
  max-width: 920px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
}

.exam-take--fill {
  max-width: none;
  margin: 0;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.exam-ws-wrap {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.exam-review-bar {
  margin-bottom: 12px;
}

.back-btn {
  padding: 0;
  font-size: 14px;
}

.back-ico {
  margin-right: 4px;
}

.exam-static {
  padding-bottom: 8px;
}

.exam-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 16px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--sg-border, #ebeef5);
}

.exam-title {
  margin: 0 0 6px;
  font-size: 24px;
  font-weight: 700;
}

.exam-sub {
  margin: 0;
  font-size: 14px;
  color: var(--sg-text-secondary);
}

.exam-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.result-card {
  margin-bottom: 16px;
  border-radius: 12px;
}

.result-card-title {
  font-weight: 600;
}

.gate-card {
  margin-bottom: 16px;
  border-radius: 12px;
}

.gate-card-title {
  font-weight: 600;
}

.gate-line {
  margin: 0 0 8px;
  font-size: 14px;
  color: var(--sg-text-secondary);
}

.countdown-wrap {
  margin: 20px 0 12px;
  padding: 20px;
  border-radius: 12px;
  background: linear-gradient(135deg, var(--el-color-primary-light-9), var(--el-fill-color-light));
  text-align: center;
}

.countdown-label {
  font-size: 13px;
  color: var(--sg-text-secondary);
  margin-bottom: 8px;
}

.countdown-big {
  font-size: 28px;
  font-weight: 700;
  letter-spacing: 0.04em;
  font-variant-numeric: tabular-nums;
  color: var(--el-color-primary);
}

.gate-hint {
  margin: 12px 0 0;
  font-size: 13px;
  color: var(--sg-text-secondary);
  line-height: 1.6;
}

.mb12 {
  margin-bottom: 12px;
}

.mt12 {
  margin-top: 12px;
}

.pending-tag {
  color: var(--el-color-warning);
  font-size: 13px;
}

.ai-pre {
  margin: 0;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 360px;
  overflow: auto;
}

.ws-extra {
  font-size: 12px;
  color: var(--sg-text-secondary);
}

.ws-extra strong {
  color: var(--sg-text);
  font-variant-numeric: tabular-nums;
}

.ws-warn {
  color: #b45309;
}

.qb-ws-inline-alert {
  margin-bottom: 12px;
}

.qb-ws-q-block {
  max-width: 880px;
}

.qb-ws-q-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.qb-ws-qno {
  font-size: 15px;
  font-weight: 600;
  color: var(--sg-text-secondary);
}

.qb-ws-qscore {
  margin-left: auto;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-color-warning-dark-2);
}

.qb-ws-stem {
  font-size: 15px;
  line-height: 1.75;
  color: var(--sg-text);
  white-space: pre-wrap;
  word-break: break-word;
  margin-bottom: 12px;
  padding: 12px 14px;
  border-radius: 10px;
  background: #fff;
  border: 1px solid var(--el-border-color-lighter);
}

.qb-ws-answer-box {
  padding: 4px 0 8px;
}

.code-run-row {
  margin-top: 10px;
}

.mb8 {
  margin-bottom: 10px;
}

.run-pre {
  margin: 0;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 420px;
  overflow: auto;
  background: var(--sg-bg-muted, #f5f5f5);
  padding: 10px;
  border-radius: 6px;
}
</style>
