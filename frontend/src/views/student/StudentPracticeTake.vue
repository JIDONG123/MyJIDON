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

    <!-- 已提交：练习结果报告（不再使用答题工作台） -->
    <template v-else-if="isReviewMode">
      <div class="result-report-scroll">
        <div class="result-report">
        <div class="result-report__bar">
          <el-button text type="primary" class="back-btn" @click="goBack">
            <span class="back-ico">←</span> 返回列表
          </el-button>
        </div>

        <header class="result-head">
          <div class="result-head__main">
            <h1 class="result-head__title">练习结果</h1>
            <p class="result-head__sub">查看本次练习得分、题目得分明细与学习反馈。</p>
            <h2 class="result-head__practice">{{ title }}</h2>
          </div>
          <div class="result-head__meta">
            <el-tag :type="resultStatus.tagType" effect="plain">{{ resultStatus.label }}</el-tag>
            <el-tag v-if="deadlineText" type="info" effect="plain">截止 {{ deadlineText }}</el-tag>
            <el-tag v-if="attemptInfo?.submitted_at" type="info" effect="plain">
              交卷 {{ formatDateTime(attemptInfo.submitted_at) }}
            </el-tag>
          </div>
        </header>

        <div class="notice-card" role="note">
          <el-icon class="notice-card__icon"><CircleCheck /></el-icon>
          <p class="notice-card__text">已提交本次练习，当前结果仅供学习反馈，不可修改。</p>
        </div>

        <template v-if="scoresVisible">
          <section class="metric-grid">
            <div
              v-for="card in resultStatCards"
              :key="card.key"
              class="metric-card"
              :class="{ 'metric-card--highlight': card.highlight }"
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

          <div class="insight-banner" :class="`insight-banner--${resultInsight.tone}`">
            <strong class="insight-banner__title">{{ resultInsight.title }}</strong>
            <p class="insight-banner__text">{{ resultInsight.text }}</p>
          </div>

          <section v-if="typeScoreRows.length" class="panel type-panel">
            <h3 class="panel__title">题型得分统计</h3>
            <div class="type-stats">
              <div v-for="item in typeScoreRows" :key="item.type" class="type-stat">
                <div class="type-stat__head">
                  <span class="type-stat__label">{{ item.typeLabel }}</span>
                  <span class="type-stat__score">{{ item.scoreText }} 分</span>
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
            <div class="detail-panel__head">
              <h3 class="panel__title">题目得分明细</h3>
              <el-radio-group v-if="questionRows.length" v-model="questionFilter" size="small">
                <el-radio-button value="all">全部题目</el-radio-button>
                <el-radio-button value="scored">得分题</el-radio-button>
                <el-radio-button value="deducted">扣分题</el-radio-button>
                <el-radio-button value="subjective">主观题</el-radio-button>
              </el-radio-group>
            </div>

            <div v-if="!questionRows.length" class="detail-empty">
              <h4 class="detail-empty__title">暂无题目明细</h4>
              <p class="detail-empty__text">本次练习结果已生成，但暂无可展示的题目得分明细。</p>
            </div>

            <div v-else-if="!filteredQuestionRows.length" class="detail-empty">
              <p class="detail-empty__text">当前筛选下暂无题目，请切换筛选条件。</p>
            </div>

            <div v-else class="question-list">
              <article
                v-for="item in filteredQuestionRows"
                :key="item.pq_id"
                class="question-card"
                :class="`question-card--${item.scoreStatus.key}`"
              >
                <div class="question-card__head">
                  <div class="question-card__title-row">
                    <span class="question-card__no">第 {{ item.index }} 题</span>
                    <el-tag size="small" type="primary" effect="plain">{{ item.typeLabel }}</el-tag>
                  </div>
                  <el-tag size="small" :type="item.scoreStatus.tagType" effect="plain">
                    {{ item.scoreStatus.label }}
                  </el-tag>
                </div>
                <p class="question-card__stem">{{ item.stemPreview }}</p>
                <div class="question-card__score">
                  <span class="question-card__score-label">得分</span>
                  <span class="question-card__score-value">{{ item.scoreLine }} 分</span>
                </div>
                <div v-if="item.studentAnswer" class="question-card__extra">
                  <span class="question-card__extra-label">我的作答</span>
                  <p class="question-card__extra-text">{{ item.studentAnswer }}</p>
                </div>
                <div v-if="item.teacherComment" class="question-card__extra">
                  <span class="question-card__extra-label">教师评语</span>
                  <p class="question-card__extra-text">{{ item.teacherComment }}</p>
                </div>
              </article>
            </div>
          </section>

          <StudentAiSuggestionPanel :items="aiSuggestionItems" />
        </template>

        <div v-else class="panel pending-panel">
          <el-empty :image-size="80">
            <template #description>
              <h4 class="detail-empty__title">成绩待公布</h4>
              <p class="detail-empty__text">
                分数明细将在教师公布成绩后显示；主观题得分以教师批改为准。
              </p>
            </template>
          </el-empty>
        </div>
        </div>
      </div>
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
import { CircleCheck, Trophy, Document, EditPen, Clock } from '@element-plus/icons-vue'
import { useRtOnDomains } from '../../composables/useRtOnDomains'
import { useUserStore } from '../../stores/user'
import { getPracticePaper, savePracticeDraft, submitPractice, runPracticeCode } from '../../api/qb'
import { ElMessage, ElMessageBox } from 'element-plus'
import QbAnswerEditor from '../../components/qb/QbAnswerEditor.vue'
import QbStudentTakeWorkspace from '../../components/qb/QbStudentTakeWorkspace.vue'
import StudentAiSuggestionPanel from '../../components/student/StudentAiSuggestionPanel.vue'
import { qbTypeLabel, qbAttemptStatusLabel, qbAttemptStatusTagType } from '../../utils/qbLabels'
import { formatDateTime } from '../../utils/format'
import {
  buildAiSuggestionDisplayItems,
  buildQuestionIndexMap,
} from '../../utils/studentAiSuggestionDisplay'
import {
  buildPracticeQuestionRows,
  aggregateTypeScores,
  computePracticeMaxTotal,
  formatResultScore,
  formatScoreWithMax,
  practiceResultInsight,
  resultStatusLabel,
  filterQuestionRows,
  resolveTotalScoreTier,
} from '../../utils/studentPracticeResultDisplay'

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
const questionFilter = ref('all')
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

const maxTotalScore = computed(() => computePracticeMaxTotal(questions.value))

const resultStatus = computed(() => resultStatusLabel(attemptInfo.value?.status))

const questionRows = computed(() =>
  buildPracticeQuestionRows(questions.value, attemptInfo.value)
)

const aiSuggestionItems = computed(() => {
  if (!scoresVisible.value) return []
  const indexMap = buildQuestionIndexMap(
    questions.value.map((q, i) => ({ pq_id: q.pq_id, index: i + 1 })),
    'pq_id'
  )
  return buildAiSuggestionDisplayItems(attemptInfo.value?.ai_suggestion, { indexMap })
})

const filteredQuestionRows = computed(() =>
  filterQuestionRows(questionRows.value, questionFilter.value)
)

const typeScoreRows = computed(() => {
  if (!scoresVisible.value || !questionRows.value.length) return []
  const rows = aggregateTypeScores(questionRows.value)
  return rows.length ? rows : []
})

const totalScoreTier = computed(() => {
  if (!scoresVisible.value) return null
  return resolveTotalScoreTier(attemptInfo.value?.total_score, maxTotalScore.value)
})

const resultInsight = computed(() =>
  practiceResultInsight(attemptInfo.value?.total_score, maxTotalScore.value)
)

const resultStatCards = computed(() => {
  const a = attemptInfo.value
  const max = maxTotalScore.value
  return [
    {
      key: 'total',
      label: '总分',
      value: formatScoreWithMax(a?.total_score, max),
      hint: max > 0 ? `满分 ${max.toFixed(2)} 分` : '',
      icon: Trophy,
      tone: 'blue',
      highlight: true,
      tier: totalScoreTier.value,
    },
    {
      key: 'objective',
      label: '客观题得分',
      value: `${formatResultScore(a?.objective_score)} 分`,
      hint: '自动判分',
      icon: Document,
      tone: 'teal',
    },
    {
      key: 'subjective',
      label: '主观题得分',
      value: `${formatResultScore(a?.subjective_score)} 分`,
      hint: '教师批改',
      icon: EditPen,
      tone: 'green',
    },
    {
      key: 'submitted',
      label: '交卷时间',
      value: a?.submitted_at ? formatDateTime(a.submitted_at) : '—',
      hint: '',
      icon: Clock,
      tone: 'indigo',
    },
  ]
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
  flex: 1 1 0%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  margin: -16px -20px;
  padding: 0;
  background: #eef2f7;
  width: auto;
  max-width: none;
  box-sizing: border-box;
}

.result-report-scroll {
  flex: 1 1 0%;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  padding: 16px 20px 32px;
}

.result-report {
  max-width: 960px;
  margin: 0 auto;
}

.result-report__bar {
  margin-bottom: 12px;
}

.back-btn {
  padding: 0;
  font-size: 14px;
}

.back-ico {
  margin-right: 4px;
}

.result-head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-start;
  gap: 14px 20px;
  margin-bottom: 16px;
}

.result-head__title {
  margin: 0 0 6px;
  font-size: 24px;
  font-weight: 700;
  color: #0f172a;
}

.result-head__sub {
  margin: 0 0 10px;
  font-size: 14px;
  line-height: 1.65;
  color: #64748b;
}

.result-head__practice {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #334155;
}

.result-head__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.notice-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  margin-bottom: 16px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 12px;
}

.notice-card__icon {
  flex-shrink: 0;
  margin-top: 2px;
  font-size: 18px;
  color: #16a34a;
}

.notice-card__text {
  margin: 0;
  font-size: 13px;
  line-height: 1.65;
  color: #166534;
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
  color: #1677ff;
}
.metric-card__icon--teal {
  background: #f0fdfa;
  color: #0d9488;
}
.metric-card__icon--green {
  background: #f0fdf4;
  color: #16a34a;
}
.metric-card__icon--indigo {
  background: #eef2ff;
  color: #4f46e5;
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
  word-break: break-word;
}

.metric-card--highlight .metric-card__value {
  font-size: 22px;
  color: #1677ff;
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

.insight-banner {
  padding: 14px 16px;
  margin-bottom: 16px;
  border-radius: 12px;
  border: 1px solid #e8edf3;
  background: #fff;
}

.insight-banner--success {
  background: #f0fdf4;
  border-color: #bbf7d0;
}
.insight-banner--warning {
  background: #fffbeb;
  border-color: #fde68a;
}
.insight-banner--danger {
  background: #fef2f2;
  border-color: #fecaca;
}
.insight-banner--info {
  background: #f8fafc;
  border-color: #e2e8f0;
}

.insight-banner__title {
  display: block;
  margin-bottom: 4px;
  font-size: 14px;
  color: #0f172a;
}

.insight-banner__text {
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
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
}

.type-stats {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 14px;
}

.type-stat__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 6px;
}

.type-stat__label {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
}

.type-stat__score {
  font-size: 12px;
  color: #64748b;
  font-variant-numeric: tabular-nums;
}

.detail-panel__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
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

.question-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.question-card {
  padding: 14px 16px;
  border: 1px solid #e8edf3;
  border-radius: 12px;
  background: #fafbfc;
}

.question-card--full {
  border-left: 3px solid #16a34a;
}
.question-card--partial {
  border-left: 3px solid #ea580c;
}
.question-card--zero {
  border-left: 3px solid #dc2626;
}
.question-card--pending {
  border-left: 3px solid #94a3b8;
}

.question-card__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.question-card__title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.question-card__no {
  font-size: 14px;
  font-weight: 700;
  color: #334155;
}

.question-card__stem {
  margin: 0 0 10px;
  font-size: 14px;
  line-height: 1.65;
  color: #475569;
}

.question-card__score {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid #f1f5f9;
}

.question-card__score-label {
  font-size: 12px;
  color: #94a3b8;
  font-weight: 600;
}

.question-card__score-value {
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
  font-variant-numeric: tabular-nums;
}

.question-card__extra {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed #e2e8f0;
}

.question-card__extra-label {
  display: block;
  margin-bottom: 4px;
  font-size: 12px;
  font-weight: 600;
  color: #94a3b8;
}

.question-card__extra-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: #475569;
  white-space: pre-wrap;
  word-break: break-word;
}

.pending-panel {
  padding: 24px 16px;
}

@media (max-width: 640px) {
  .result-head__meta {
    justify-content: flex-start;
  }

  .detail-panel__head {
    flex-direction: column;
    align-items: flex-start;
  }

  .metric-grid {
    grid-template-columns: 1fr;
  }
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

.mb8 {
  margin-bottom: 10px;
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

<style>
/* workspace 壳层默认 overflow:hidden，结果页需内层滚动容器占满剩余高度 */
.practice-take.practice-take--review.route-view-root--workspace {
  flex: 1 1 0%;
  min-height: 0;
  overflow: hidden;
}
</style>
