<template>
  <div class="exam-take" :class="{ 'exam-take--fill': fillWorkspace, 'exam-take--review': !fillWorkspace }">
    <template v-if="fillWorkspace">
      <div class="exam-ws-wrap">
        <QbStudentTakeWorkspace
          variant="exam"
          :title="title"
          :subtitle-lines="examWorkspaceSubtitles"
          :deadline-text="attemptDeadlineText"
          :total-questions="paper.length"
          :current-index="examCurrentIndex"
          :answered-count="answeredCount"
          :elapsed-text="elapsedText"
          :remaining-text="formatExamCountdown(countdownSyncedMs)"
          :tab-switch-count="tabCount"
          :flagged-count="flaggedCount"
          :status-label="examSessionStatusLabel"
          :status-tag-type="examSessionStatusTag"
          :rule-banner-text="examRuleBannerText"
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
          <div v-if="curPaper" class="qb-ws-q-block exam-q-block">
            <div class="qb-ws-q-head">
              <span class="qb-ws-qno">第 {{ examCurrentIndex + 1 }} 题</span>
              <el-tag size="small" type="primary" effect="plain">{{ qbTypeLabel(curPaper.type) }}</el-tag>
              <span class="qb-ws-qscore">{{ curPaper.max_score }} 分</span>
            </div>
            <div class="qb-ws-stem exam-q-stem">{{ curPaper.stem }}</div>
            <div class="qb-ws-answer-box">
              <QbAnswerEditor
                v-model="answers[String(curPaper.eq_id)]"
                :question="curPaper"
                :shuffle-options="shuffleOpts"
                dense
                option-style="exam"
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

    <div v-else class="exam-static-scroll">
      <div class="exam-static">
        <div class="exam-review-bar">
          <el-button text type="primary" class="back-btn" @click="goExamList">
            <span class="back-ico">←</span> 返回列表
          </el-button>
        </div>

        <!-- 正式考试成绩单 -->
        <template v-if="showScoreReport">
          <header class="report-head">
            <div class="report-head__main">
              <h1 class="report-head__title">考试成绩单</h1>
              <p class="report-head__sub">查看本场考试总成绩、班级排名、题型得分与题目明细。</p>
              <h2 class="report-head__exam">{{ title }}</h2>
            </div>
            <div class="report-head__meta">
              <el-tag type="info" effect="plain">{{ examStatusLabel }}</el-tag>
              <el-tag type="success" effect="plain">成绩已公布</el-tag>
              <el-tag v-if="examResult?.submitted_at" type="info" effect="plain">
                交卷 {{ formatDateTime(examResult.submitted_at) }}
              </el-tag>
              <el-tag v-if="rankLabel !== '—'" type="warning" effect="plain">班级 {{ rankLabel }}</el-tag>
            </div>
          </header>

          <section class="metric-grid">
            <div
              v-for="card in resultStatCards"
              :key="card.key"
              class="metric-card"
              :class="{
                'metric-card--highlight': card.highlight,
                'metric-card--rank': card.key === 'rank',
              }"
            >
              <div class="metric-card__icon" :class="`metric-card__icon--${card.tone}`">
                <el-icon><component :is="card.icon" /></el-icon>
              </div>
              <div class="metric-card__body">
                <div class="metric-card__value-row">
                  <span class="metric-card__value">{{ card.value }}</span>
                  <el-tag
                    v-if="card.tier"
                    size="small"
                    :type="card.tier.tagType"
                    effect="plain"
                    class="metric-card__tier"
                  >
                    {{ card.tier.label }}
                  </el-tag>
                </div>
                <span class="metric-card__label">{{ card.label }}</span>
                <span v-if="card.hint" class="metric-card__hint">{{ card.hint }}</span>
              </div>
            </div>
          </section>

          <div class="notice-card notice-card--formal" role="note">
            <strong class="notice-card__title">{{ resultInsight.title }}</strong>
            <p class="notice-card__text">{{ resultInsight.text }}</p>
          </div>

          <section v-if="typeScoreRows.length" class="panel type-panel">
            <h3 class="panel__title">题型得分分析</h3>
            <div class="type-stats">
              <div v-for="item in typeScoreRows" :key="item.type" class="type-stat">
                <div class="type-stat__head">
                  <div class="type-stat__left">
                    <span class="type-stat__label">{{ item.typeLabel }}</span>
                    <span class="type-stat__count">{{ item.count }} 题</span>
                  </div>
                  <span class="type-stat__score">{{ item.scoreText }} 分 · 得分率 {{ item.rate }}%</span>
                </div>
                <el-progress
                  :percentage="item.rate"
                  :stroke-width="8"
                  :color="item.rate >= 80 ? '#16a34a' : item.rate >= 60 ? '#1677ff' : '#ea580c'"
                />
              </div>
            </div>
          </section>

          <section class="panel detail-panel">
            <h3 class="panel__title">题目得分明细</h3>
            <div v-if="!breakdownRows.length" class="detail-empty">
              <h4 class="detail-empty__title">暂无题目明细</h4>
              <p class="detail-empty__text">本场考试成绩已生成，但暂无可展示的题目得分明细。</p>
            </div>
            <el-table v-else :data="breakdownRows" class="detail-table" stripe>
              <el-table-column prop="sort_index" label="题号" width="64" align="center" />
              <el-table-column label="题型" width="100">
                <template #default="{ row }">{{ row.typeLabel }}</template>
              </el-table-column>
              <el-table-column label="题目摘要" min-width="200">
                <template #default="{ row }">
                  <span class="stem-cell" :title="row.stemDisplay">{{ row.stemDisplay }}</span>
                </template>
              </el-table-column>
              <el-table-column label="得分" width="88" align="right">
                <template #default="{ row }">{{ row.earnedDisplay }}</template>
              </el-table-column>
              <el-table-column label="满分" width="88" align="right">
                <template #default="{ row }">{{ row.maxDisplay }}</template>
              </el-table-column>
              <el-table-column label="得分状态" width="108" align="center">
                <template #default="{ row }">
                  <el-tag size="small" :type="row.scoreStatus.tagType" effect="plain">
                    {{ row.scoreStatus.label }}
                  </el-tag>
                </template>
              </el-table-column>
            </el-table>
          </section>

          <StudentAiSuggestionPanel :items="aiSuggestionItems" />
        </template>

        <!-- 非成绩单态：未开始 / 成绩未公布 / 加载中等 -->
        <template v-else>
          <header class="exam-head">
            <div>
              <h1 class="exam-title">{{ title }}</h1>
              <p class="exam-sub">{{ phaseSubtitle }}</p>
            </div>
            <div class="exam-meta">
              <el-tag v-if="phase" size="small" :type="qbExamPhaseTagType(phase)">{{ qbExamPhaseLabel(phase) }}</el-tag>
              <el-tag v-if="phase === 'active' && examEndAt" type="info" size="small">
                考试窗口截止：{{ formatDateTime(examEndAt) }}
              </el-tag>
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
            v-if="readOnlySubmitted && !paper.length && !scoreGate.blocked"
            type="success"
            show-icon
            :closable="false"
            title="您已提交本场试卷，作答内容不可修改。"
            class="mb12"
          />

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
            :description="phaseText || '若已交卷，成绩将在公布后显示。'"
            class="mb12"
          />

          <el-alert
            v-else-if="phase === 'hidden'"
            type="warning"
            show-icon
            :closable="false"
            :title="phaseText || '本场考试未发布或当前不可见。'"
          />

          <el-alert
            v-else-if="examStartFailure"
            type="error"
            show-icon
            :closable="false"
            :title="examStartFailure.message || '无法进入考试'"
            class="mb12"
          />

          <el-skeleton v-else-if="phase === 'active' && !readOnlySubmitted" :rows="4" animated />
        </template>
      </div>
    </div>

    <el-dialog v-model="runDlg" title="Python 试运行" width="680px" destroy-on-close>
      <el-alert type="warning" show-icon :closable="false" title="教学演示环境：进程超时与输出上限限制，非强隔离；生产请使用容器判题。" class="mb8" />
      <pre class="run-pre">{{ runResult }}</pre>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, reactive, watch, computed, nextTick, h } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Trophy, Document, EditPen, Medal } from '@element-plus/icons-vue'
import { useRtOnDomains } from '../../composables/useRtOnDomains'
import { useUserStore } from '../../stores/user'
import { useStudentExamUiStore } from '../../stores/studentExamUi'
import { getExamMeta, startExam, autosaveExam, tabExamEvent, submitExam, runExamCode, getExamResult } from '../../api/qb'
import { getRealtimeSocket } from '../../socket/realtimeClient'
import { ElMessage, ElMessageBox } from 'element-plus'
import QbAnswerEditor from '../../components/qb/QbAnswerEditor.vue'
import QbStudentTakeWorkspace from '../../components/qb/QbStudentTakeWorkspace.vue'
import StudentAiSuggestionPanel from '../../components/student/StudentAiSuggestionPanel.vue'
import { qbTypeLabel, qbExamPhaseLabel, qbExamPhaseTagType } from '../../utils/qbLabels'
import { formatDateTime } from '../../utils/format'
import {
  buildAiSuggestionDisplayItems,
  buildQuestionIndexMap,
} from '../../utils/studentAiSuggestionDisplay'
import {
  computeExamMaxTotal,
  formatExamResultScore,
  formatExamScoreWithMax,
  formatRankLabel,
  resolveExamScoreTier,
  enrichTypeScoreRows,
  enrichBreakdownRows,
  examResultInsight,
} from '../../utils/studentExamResultDisplay'

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

const rankLabel = computed(() => formatRankLabel(examResult.value?.rank_in_class))

const showScoreReport = computed(() => !!examResult.value && !scoreGate.value.blocked)

const examMaxTotal = computed(() => computeExamMaxTotal(examResult.value))

const examStatusLabel = computed(() => {
  if (phase.value === 'ended') return '已结束'
  if (phase.value === 'active' && examResult.value?.submitted_at) return '已交卷'
  return qbExamPhaseLabel(phase.value) || '已结束'
})

const totalScoreTier = computed(() => {
  if (!showScoreReport.value) return null
  return resolveExamScoreTier(examResult.value?.total_score, examMaxTotal.value)
})

const resultInsight = computed(() =>
  examResultInsight(examResult.value?.total_score, examMaxTotal.value)
)

const typeScoreRows = computed(() => {
  if (!showScoreReport.value) return []
  return enrichTypeScoreRows(examResult.value?.scores_by_type || [])
})

const breakdownRows = computed(() => {
  if (!showScoreReport.value) return []
  return enrichBreakdownRows(examResult.value?.breakdown || [])
})

const resultStatCards = computed(() => {
  const r = examResult.value
  if (!r) return []
  const max = examMaxTotal.value
  return [
    {
      key: 'total',
      label: '总分',
      value: formatExamScoreWithMax(r.total_score, max),
      hint: max > 0 ? `满分 ${max.toFixed(2)} 分` : '',
      icon: Trophy,
      tone: 'blue',
      highlight: true,
      tier: totalScoreTier.value,
    },
    {
      key: 'objective',
      label: '客观分',
      value: `${formatExamResultScore(r.objective_score)} 分`,
      hint: '自动判分',
      icon: Document,
      tone: 'teal',
    },
    {
      key: 'subjective',
      label: '主观分',
      value: `${formatExamResultScore(r.subjective_score)} 分`,
      hint: '教师批改',
      icon: EditPen,
      tone: 'green',
    },
    {
      key: 'rank',
      label: '班级名次',
      value: rankLabel.value,
      hint: '本班排名',
      icon: Medal,
      tone: 'gold',
    },
  ]
})

const aiSuggestionItems = computed(() => {
  if (!showScoreReport.value) return []
  const breakdown = examResult.value?.breakdown || []
  const indexMap = buildQuestionIndexMap(breakdown, 'eq_id')
  return buildAiSuggestionDisplayItems(examResult.value?.ai_suggestion, { indexMap })
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

const examRuleBannerText =
  '请勿切换窗口或退出全屏，切屏次数过多可能触发自动交卷。'

const flaggedCount = computed(() => {
  if (!paper.value.length) return 0
  return paper.value.filter((p) => !!examFlags[String(p.eq_id)]).length
})

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
    await ElMessageBox.confirm(
      '考试进行中，退出可能影响作答，请确认是否退出。',
      '退出考试',
      { type: 'warning', confirmButtonText: '确认退出', cancelButtonText: '继续作答' }
    )
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

function buildSubmitConfirmMessage(total, unanswered, flagged) {
  return h('div', { class: 'submit-confirm-body' }, [
    h('p', { class: 'submit-confirm-title' }, '确认提交试卷？'),
    h('ul', { class: 'submit-confirm-list' }, [
      h('li', `当前进度：${total - unanswered} / ${total} 题已作答`),
      h('li', `未作答题数：${unanswered} 题`),
      h('li', `标记题数：${flagged} 题`),
    ]),
    h('p', { class: 'submit-confirm-note' }, '提交后不可修改。'),
  ])
}

const doSubmit = async () => {
  const total = paper.value.length
  const unanswered = paper.value.filter((p) => !isAnswered(p.eq_id)).length
  const flagged = flaggedCount.value
  try {
    await ElMessageBox.confirm('', '提交试卷', {
      message: buildSubmitConfirmMessage(total, unanswered, flagged),
      type: 'warning',
      confirmButtonText: '确认提交',
      cancelButtonText: '取消',
    })
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

/* 非作答：成绩单 / 未开始 / 成绩未公布 */
.exam-take--review {
  flex: 1 1 0%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  margin: -16px -20px;
  padding: 0;
  max-width: none;
  width: auto;
  background: #eef2f7;
  box-sizing: border-box;
}

.exam-static-scroll {
  flex: 1 1 0%;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  padding: 16px 20px 40px;
}

.exam-static {
  max-width: 980px;
  margin: 0 auto;
  padding-bottom: 8px;
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

.report-head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-start;
  gap: 14px 20px;
  margin-bottom: 18px;
}

.report-head__title {
  margin: 0 0 6px;
  font-size: 24px;
  font-weight: 700;
  color: #0f172a;
  letter-spacing: -0.02em;
}

.report-head__sub {
  margin: 0 0 10px;
  font-size: 14px;
  line-height: 1.65;
  color: #64748b;
}

.report-head__exam {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #1e3a5f;
}

.report-head__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 14px;
  margin-bottom: 16px;
}

.metric-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  background: #fff;
  border: 1px solid #e8edf3;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
}

.metric-card--highlight {
  border-color: #bfdbfe;
  background: #f8fbff;
}

.metric-card--rank {
  border-color: #fde68a;
  background: #fffbeb;
}

.metric-card__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  flex-shrink: 0;
  font-size: 20px;
}

.metric-card__icon--blue {
  background: #eff6ff;
  color: #1d4ed8;
}
.metric-card__icon--teal {
  background: #f0fdfa;
  color: #0d9488;
}
.metric-card__icon--green {
  background: #f0fdf4;
  color: #16a34a;
}
.metric-card__icon--gold {
  background: #fffbeb;
  color: #d97706;
}

.metric-card__body {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.metric-card__value-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.metric-card__value {
  font-size: 20px;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.3;
}

.metric-card--highlight .metric-card__value {
  font-size: 22px;
  color: #1d4ed8;
}

.metric-card--rank .metric-card__value {
  color: #b45309;
}

.metric-card__tier {
  flex-shrink: 0;
}

.metric-card__label {
  margin-top: 4px;
  font-size: 13px;
  font-weight: 600;
  color: #334155;
}

.metric-card__hint {
  margin-top: 2px;
  font-size: 11px;
  color: #94a3b8;
}

.notice-card {
  padding: 14px 16px;
  margin-bottom: 16px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background: #fff;
}

.notice-card--formal {
  border-color: #cbd5e1;
  background: #f8fafc;
}

.notice-card__title {
  display: block;
  margin-bottom: 6px;
  font-size: 14px;
  color: #0f172a;
}

.notice-card__text {
  margin: 0;
  font-size: 13px;
  line-height: 1.65;
  color: #64748b;
}

.panel {
  background: #fff;
  border: 1px solid #e8edf3;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
  margin-bottom: 16px;
  padding: 16px 18px;
}

.panel__title {
  margin: 0 0 14px;
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
}

.type-stats {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.type-stat__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 6px;
}

.type-stat__left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.type-stat__label {
  font-size: 14px;
  font-weight: 600;
  color: #334155;
}

.type-stat__count {
  font-size: 12px;
  color: #94a3b8;
}

.type-stat__score {
  font-size: 12px;
  color: #64748b;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.detail-empty {
  padding: 24px 12px;
  text-align: center;
}

.detail-empty__title {
  margin: 0 0 8px;
  font-size: 16px;
  font-weight: 600;
  color: #0f172a;
}

.detail-empty__text {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: #64748b;
}

.detail-table :deep(.el-table__header th) {
  background: #f8fafc;
  color: #475569;
  font-weight: 600;
}

.detail-table :deep(.el-table__row) {
  font-size: 13px;
}

.stem-cell {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.5;
  color: #475569;
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
  background: #f8fafc;
  border: 1px solid #e2e8f0;
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

.ws-extra {
  font-size: 12px;
  color: var(--sg-text-secondary);
}

.exam-q-block {
  max-width: 900px;
  margin: 0 auto;
}

.exam-q-stem {
  background: #fff;
  border-radius: 12px;
  border: 1px solid #e8edf3;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
  padding: 16px 18px;
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

<style>
.submit-confirm-body {
  margin: 0;
  padding: 4px 0 0;
}

.submit-confirm-title {
  margin: 0 0 10px;
  font-size: 15px;
  font-weight: 600;
  color: #0f172a;
}

.submit-confirm-list {
  margin: 0 0 10px;
  padding-left: 18px;
  color: #475569;
  font-size: 14px;
  line-height: 1.7;
}

.submit-confirm-note {
  margin: 0;
  font-size: 13px;
  color: #64748b;
}

@media (max-width: 640px) {
  .report-head__meta {
    justify-content: flex-start;
  }

  .metric-grid {
    grid-template-columns: 1fr;
  }
}
</style>

<style>
.exam-take.exam-take--review.route-view-root--workspace {
  flex: 1 1 0%;
  min-height: 0;
  overflow: hidden;
}
</style>
