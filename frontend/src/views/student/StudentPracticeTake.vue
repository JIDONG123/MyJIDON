<template>
  <div
    class="practice-take"
    :class="{
      'practice-take--fill': useFillHeight,
      'practice-take--review': isReviewMode,
    }"
  >
    <template v-if="loading">
      <el-skeleton class="practice-skel" animated :rows="8" />
    </template>

    <!-- 已提交：仅成绩回看 + 顶部返回（不再使用答题工作台） -->
    <template v-else-if="isReviewMode">
      <div class="practice-review-bar">
        <el-button text type="primary" class="back-btn" @click="goBack">
          <span class="back-ico">←</span> 返回列表
        </el-button>
      </div>
      <header class="review-head">
        <div class="review-head-main">
          <h1 class="review-title">{{ title }}</h1>
          <p class="review-sub">习题练习 · 成绩查看</p>
        </div>
        <div class="review-head-meta">
          <el-tag v-if="deadlineText" type="info" effect="plain">截止 {{ deadlineText }}</el-tag>
          <el-tag size="small" :type="attemptTagType" effect="plain">{{ attemptTagText }}</el-tag>
        </div>
      </header>

      <el-alert type="success" show-icon :closable="false" class="mb16" title="您已提交本题练习，以下为成绩查看（不可修改）。" />
      <el-alert
        v-if="attemptInfo && !scoresVisible"
        type="info"
        show-icon
        :closable="false"
        class="mb16"
        title="分数明细将在教师公布成绩后显示；主观题得分以教师批改为准。"
      />
      <el-card v-if="scoresVisible" shadow="never" class="score-card">
        <template #header><span class="score-card-title">成绩概览</span></template>
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="总分">{{ fmtScore(attemptInfo?.total_score) }}</el-descriptions-item>
          <el-descriptions-item label="客观分">{{ fmtScore(attemptInfo?.objective_score) }}</el-descriptions-item>
          <el-descriptions-item label="主观分">{{ fmtScore(attemptInfo?.subjective_score) }}</el-descriptions-item>
          <el-descriptions-item label="交卷时间">{{ formatDateTime(attemptInfo?.submitted_at) }}</el-descriptions-item>
        </el-descriptions>
        <el-table v-if="perQuestionRows.length" :data="perQuestionRows" size="small" border class="mt12">
          <el-table-column type="index" label="序号" width="64" />
          <el-table-column label="题型" width="100">
            <template #default="{ row }">{{ qbTypeLabel(row.type) }}</template>
          </el-table-column>
          <el-table-column prop="stemPreview" label="题干摘要" min-width="160" show-overflow-tooltip />
          <el-table-column label="本题得分" width="120" align="right">
            <template #default="{ row }">{{ row.scoreLine }}</template>
          </el-table-column>
        </el-table>
      </el-card>
    </template>

    <!-- 作答中：工作台 -->
    <template v-else-if="questions.length">
      <div class="practice-ws-wrap">
        <QbStudentTakeWorkspace
          :title="title"
          :subtitle-lines="workspaceSubtitles"
          :deadline-text="deadlineText"
          :total-questions="questions.length"
          :current-index="currentIndex"
          :answered-count="answeredCount"
          :elapsed-text="elapsedText"
          :status-label="attemptTagText"
          :status-tag-type="attemptTagType"
          :read-only="false"
          :saving="savingDraft"
          :submitting="submitting"
          :is-answered-at="isAnsweredAt"
          :is-flagged-at="isFlaggedAt"
          @update:current-index="onIndexChange"
          @save="saveDraftManual"
          @submit="submitAll"
          @exit="onExit"
          @toggle-flag="toggleFlagAt"
        >
          <div v-if="currentQ" class="qb-ws-q-block">
            <div class="qb-ws-q-head">
              <span class="qb-ws-qno">第 {{ currentIndex + 1 }} 题</span>
              <el-tag size="small" type="primary" effect="plain">{{ qbTypeLabel(currentQ.type) }}</el-tag>
              <span class="qb-ws-qscore">{{ currentQ.max_score }} 分</span>
            </div>
            <div class="qb-ws-stem">{{ currentQ.stem }}</div>
            <div class="qb-ws-answer-box">
              <QbAnswerEditor
                v-model="answers[String(currentQ.pq_id)]"
                :question="currentQ"
                :shuffle-options="shuffleOpts"
                dense
                :char-count-visible="currentQ.type === 'short' || currentQ.type === 'code'"
              />
              <div v-if="currentQ.type === 'code'" class="code-run-row">
                <el-button size="small" :loading="runLoading === currentQ.pq_id" @click="runCode(currentQ.pq_id)">试运行 Python（受限）</el-button>
              </div>
            </div>
          </div>
        </QbStudentTakeWorkspace>
      </div>
    </template>

    <el-empty v-else description="暂无题目或练习不可用" />

    <el-dialog v-model="runDlg" title="Python 试运行" width="680px" destroy-on-close>
      <el-alert type="warning" show-icon :closable="false" title="教学演示环境：进程超时与输出上限限制，非强隔离。" class="mb8" />
      <pre class="run-pre">{{ runResult }}</pre>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useRtOnDomains } from '../../composables/useRtOnDomains'
import { useUserStore } from '../../stores/user'
import { getPracticePaper, savePracticeDraft, submitPractice, runPracticeCode } from '../../api/qb'
import { ElMessage, ElMessageBox } from 'element-plus'
import QbAnswerEditor from '../../components/qb/QbAnswerEditor.vue'
import QbStudentTakeWorkspace from '../../components/qb/QbStudentTakeWorkspace.vue'
import { qbTypeLabel, qbAttemptStatusLabel, qbAttemptStatusTagType, parseJsonLoose } from '../../utils/qbLabels'
import { formatDateTime } from '../../utils/format'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const pid = () => Number(route.params.id)

const loading = ref(true)
const title = ref('课堂练习')
const practiceRow = ref(null)
const questions = ref([])
const answers = reactive({})
const currentIndex = ref(0)
const flags = reactive({})
const runDlg = ref(false)
const runResult = ref('')
const runLoading = ref(null)
const attemptInfo = ref(null)
const savingDraft = ref(false)
const submitting = ref(false)
const sessionStartMs = ref(0)
const nowTick = ref(Date.now())
let tickTimer = null
let autosaveTimer = null

const readOnly = computed(() => !!attemptInfo.value?.submitted_at)

/** 已交卷：走简洁成绩页，不再渲染答题工作台 */
const isReviewMode = computed(() => !loading.value && readOnly.value && questions.value.length > 0)

const useFillHeight = computed(() => !loading.value && questions.value.length > 0 && !readOnly.value)

const attemptTagText = computed(() => {
  const a = attemptInfo.value
  if (!a) return '未开始作答'
  if (!a.submitted_at) return qbAttemptStatusLabel('in_progress')
  return qbAttemptStatusLabel(a.status)
})

const attemptTagType = computed(() => {
  const a = attemptInfo.value
  if (!a) return 'info'
  if (!a.submitted_at) return qbAttemptStatusTagType('in_progress')
  return qbAttemptStatusTagType(a.status)
})

const scoresVisible = computed(() => {
  const a = attemptInfo.value
  if (!a?.submitted_at) return false
  const nums = [a.total_score, a.objective_score, a.subjective_score].map((x) => Number(x))
  return nums.some((n) => Number.isFinite(n))
})

const shuffleOpts = computed(() => !!practiceRow.value?.shuffle_options)

const deadlineText = computed(() => {
  const d = practiceRow.value?.deadline_at
  if (!d) return ''
  return formatDateTime(d)
})

const workspaceSubtitles = computed(() => {
  const cls = userStore.user?.className || userStore.user?.class_name || ''
  const lines = ['课堂练习 · 职教题库']
  if (cls) lines.push(`班级：${cls}`)
  return lines
})

const currentQ = computed(() => questions.value[currentIndex.value] || null)

const elapsedText = computed(() => {
  if (!sessionStartMs.value) return '00:00'
  const sec = Math.max(0, Math.floor((nowTick.value - sessionStartMs.value) / 1000))
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
})

function answerNonEmpty(raw) {
  if (raw == null) return false
  if (Array.isArray(raw)) return raw.length > 0
  if (typeof raw === 'object') return Object.keys(raw).length > 0
  return String(raw).trim().length > 0
}

function isAnsweredAt(i) {
  const q = questions.value[i]
  if (!q) return false
  return answerNonEmpty(answers[String(q.pq_id)])
}

function isFlaggedAt(i) {
  const q = questions.value[i]
  if (!q) return false
  return !!flags[String(q.pq_id)]
}

const answeredCount = computed(() => {
  if (!questions.value.length) return 0
  return questions.value.filter((q) => answerNonEmpty(answers[String(q.pq_id)])).length
})

function fmtScore(v) {
  if (v == null || v === '') return '—'
  const n = Number(v)
  return Number.isFinite(n) ? n.toFixed(2) : '—'
}

function stemPreview(stem) {
  const t = String(stem || '').replace(/\s+/g, ' ').trim()
  if (!t) return '—'
  return t.length <= 48 ? t : `${t.slice(0, 48)}…`
}

function cellScoreLine(cell, maxScore) {
  if (!cell || typeof cell !== 'object') return '—'
  if (cell.pending) return '待批改'
  const e = Number(cell.earned)
  if (Number.isFinite(e)) return `${e.toFixed(1)} / ${maxScore} 分`
  return '—'
}

const perQuestionRows = computed(() => {
  const a = attemptInfo.value
  if (!a || !questions.value.length) return []
  const per = parseJsonLoose(a.per_question_scores) || {}
  return questions.value.map((q) => ({
    type: q.type,
    stemPreview: stemPreview(q.stem),
    scoreLine: cellScoreLine(per[String(q.pq_id)], Number(q.max_score) || 0),
  }))
})

function flagsKey() {
  return `qb_practice_flag_${pid()}`
}

function loadFlags() {
  try {
    const raw = sessionStorage.getItem(flagsKey())
    const arr = raw ? JSON.parse(raw) : []
    Object.keys(flags).forEach((k) => delete flags[k])
    for (const id of Array.isArray(arr) ? arr : []) {
      flags[String(id)] = true
    }
  } catch {
    /* ignore */
  }
}

function persistFlags() {
  try {
    const ids = Object.keys(flags).filter((k) => flags[k])
    sessionStorage.setItem(flagsKey(), JSON.stringify(ids))
  } catch {
    /* ignore */
  }
}

const goBack = () => {
  router.push('/student/qbank/practices')
}

async function silentSaveDraft() {
  if (readOnly.value) return
  savingDraft.value = true
  try {
    await savePracticeDraft(pid(), { ...answers })
  } catch {
    /* ignore */
  } finally {
    savingDraft.value = false
  }
}

function scheduleAutosave() {
  if (readOnly.value) return
  if (autosaveTimer) clearTimeout(autosaveTimer)
  autosaveTimer = setTimeout(() => {
    silentSaveDraft()
  }, 1200)
}

function onIndexChange(i) {
  currentIndex.value = i
  if (!readOnly.value) silentSaveDraft()
}

function toggleFlagAt(idx) {
  if (readOnly.value) return
  const q = questions.value[idx]
  if (!q) return
  const k = String(q.pq_id)
  if (flags[k]) delete flags[k]
  else flags[k] = true
  persistFlags()
}

const boot = async (options = {}) => {
  const soft = !!options.soft
  if (!soft) loading.value = true
  try {
    const res = await getPracticePaper(pid())
    if (!res.success) {
      if (!soft) {
        ElMessage.error(res.message || '加载失败')
        goBack()
      }
      return
    }
    const data = res.data
    practiceRow.value = data.practice
    title.value = data.practice?.title || '课堂练习'
    questions.value = data.questions || []
    attemptInfo.value = data.attempt || null

    Object.keys(answers).forEach((k) => delete answers[k])
    let base = {}
    const aj = data.attempt?.answers_json
    if (aj != null && aj !== '') {
      if (typeof aj === 'string') {
        try {
          base = JSON.parse(aj)
        } catch {
          base = {}
        }
      } else if (typeof aj === 'object') {
        base = { ...aj }
      }
    }
    for (const q of questions.value) {
      answers[String(q.pq_id)] = base[String(q.pq_id)] != null ? String(base[String(q.pq_id)]) : ''
    }
    currentIndex.value = 0
    loadFlags()
    sessionStartMs.value = Date.now()
  } catch (e) {
    if (!soft) {
      const body = e?.response?.data || {}
      if (body.code === 'DEADLINE_CLOSED' || e?.response?.status === 403) {
        ElMessage.warning(body.message || '已超过截止时间，无法继续作答')
      } else {
        ElMessage.error(body.message || '加载失败')
      }
      goBack()
    }
  } finally {
    if (!soft) loading.value = false
  }
}

useRtOnDomains(['qb_practices', 'scores'], () => void boot({ soft: true }))

watch(
  () => questions.value.length,
  (n) => {
    if (currentIndex.value >= n) currentIndex.value = Math.max(0, n - 1)
  }
)

watch(
  () => answers,
  () => {
    scheduleAutosave()
  },
  { deep: true }
)

const runCode = async (pqId) => {
  runLoading.value = pqId
  try {
    const res = await runPracticeCode(pid(), {
      pq_id: pqId,
      code: answers[String(pqId)] != null ? String(answers[String(pqId)]) : '',
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

const saveDraftManual = async () => {
  if (readOnly.value) return
  savingDraft.value = true
  try {
    await savePracticeDraft(pid(), { ...answers })
    ElMessage.success('草稿已保存')
  } catch {
    ElMessage.error('保存失败')
  } finally {
    savingDraft.value = false
  }
}

const submitAll = async () => {
  if (readOnly.value) return
  const total = questions.value.length
  const unanswered = questions.value.filter((q) => !answerNonEmpty(answers[String(q.pq_id)])).length
  try {
    if (unanswered > 0) {
      await ElMessageBox.confirm(
        `尚有 ${unanswered} / ${total} 题未作答，确定提交吗？`,
        '确认提交',
        { type: 'warning' }
      )
    } else {
      await ElMessageBox.confirm('提交后不可修改（主观题待教师批改）', '确认提交', { type: 'warning' })
    }
    submitting.value = true
    await submitPractice(pid(), { ...answers })
    ElMessage.success('已提交')
    router.push('/student/qbank/practices')
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e?.response?.data?.message || '提交失败')
  } finally {
    submitting.value = false
  }
}

const onExit = async () => {
  try {
    await ElMessageBox.confirm('确定退出练习？建议先点击「暂存」；系统将尝试保存当前草稿。', '退出', { type: 'info' })
    if (!readOnly.value) await silentSaveDraft()
    goBack()
  } catch (e) {
    if (e !== 'cancel') {
      /* ignore */
    }
  }
}

onMounted(async () => {
  await boot()
  if (!readOnly.value) {
    tickTimer = setInterval(() => {
      nowTick.value = Date.now()
    }, 1000)
  }
})

onUnmounted(() => {
  if (tickTimer) clearInterval(tickTimer)
  if (autosaveTimer) clearTimeout(autosaveTimer)
})
</script>

<style scoped>
.practice-take {
  min-height: 0;
}

.practice-take--review {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 20px 32px;
  max-width: 920px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
}

.practice-review-bar {
  margin-bottom: 12px;
}

.back-btn {
  padding: 0;
  font-size: 14px;
}

.back-ico {
  margin-right: 4px;
}

.review-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 16px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--sg-border, #ebeef5);
}

.review-title {
  margin: 0 0 6px;
  font-size: 22px;
  font-weight: 700;
  color: var(--sg-text);
}

.review-sub {
  margin: 0;
  font-size: 14px;
  color: var(--sg-text-secondary);
}

.review-head-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.mb16 {
  margin-bottom: 16px;
}

.score-card {
  border-radius: 12px;
}

.practice-take--fill {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.practice-ws-wrap {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.practice-skel {
  padding: 24px;
}

.score-card-title {
  font-weight: 600;
}

.mb8 {
  margin-bottom: 10px;
}

.mt12 {
  margin-top: 12px;
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

.run-pre {
  margin: 0;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 420px;
  overflow: auto;
  background: var(--sg-bg-muted, #f5f7fa);
  padding: 12px;
  border-radius: 8px;
}
</style>
