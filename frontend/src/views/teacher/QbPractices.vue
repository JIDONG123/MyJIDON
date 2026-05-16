<template>
  <div class="page-qb">
    <header class="page-head">
      <h1 class="page-title">习题练习</h1>
      <p class="page-desc">面向班级发布练习；从题库选题后学生在线作答，客观题自动判分，主观题由您批改赋分。</p>
    </header>

    <el-card shadow="never" class="panel-card">
      <div class="toolbar-row">
        <el-select v-model="classId" placeholder="选择班级" style="width: 260px" filterable @change="load">
          <el-option v-for="c in classes" :key="c.id" :label="c.class_name" :value="c.id" />
        </el-select>
        <el-button type="primary" :disabled="!classId" @click="openCreate">新建练习</el-button>
      </div>
      <el-table v-loading="loading" :data="rows" border stripe style="width: 100%; margin-top: 16px">
        <el-table-column prop="title" label="名称" min-width="160" />
        <el-table-column label="截止时间" width="178">
          <template #default="{ row }">{{ formatDateTime(row.deadline_at) }}</template>
        </el-table-column>
        <el-table-column prop="question_count" label="题目数" width="88" />
        <el-table-column prop="status" label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag size="small" type="info" effect="plain">{{ qbPublishStatusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="320" align="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button link type="primary" @click="configure(row)">配置题目</el-button>
            <el-button link type="primary" @click="viewAttempts(row)">学生作答</el-button>
            <el-button link type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dlg" :title="currentId ? '编辑练习' : '新建练习'" width="560px" destroy-on-close>
      <el-form label-width="112px">
        <el-form-item label="名称"><el-input v-model="form.title" /></el-form-item>
        <el-form-item label="截止"><el-date-picker v-model="form.deadline_at" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" style="width: 100%" clearable /></el-form-item>
        <el-form-item label="成绩公布">
          <el-date-picker v-model="form.publish_scores_at" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" style="width: 100%" clearable />
          <div class="tip">留空则学生提交后即可见分；设置未来时间则到点公布，公布前成绩 AES 密封存储。</div>
        </el-form-item>
        <el-form-item label="打乱选项"><el-switch v-model="form.shuffle_options" /></el-form-item>
        <el-form-item label="说明"><el-input v-model="form.description" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg = false">取消</el-button>
        <el-button type="primary" @click="savePractice">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="qDlg" class="qb-config-dialog" title="配置练习题目" width="960px" destroy-on-close align-center>
      <div class="qb-config-hero">
        <p class="qb-config-lead">
          从个人题库勾选本题练习要发布的试题；保存后将<strong>覆盖</strong>原有选题。左侧「题库ID」为数据库主键，与表格「序号」无关。
        </p>
      </div>
      <div class="qb-transfer-toolbar">
        <el-select v-model="transferFilterType" clearable placeholder="题型筛选" style="width: 140px">
          <el-option label="全部题型" value="" />
          <el-option v-for="t in transferTypeOpts" :key="t.v" :label="t.l" :value="t.v" />
        </el-select>
        <span class="qb-transfer-stat muted">共 {{ allQuestions.length }} 题 · 已选 {{ pickedQ.length }} 题</span>
      </div>
      <el-transfer
        v-model="pickedQ"
        class="qb-transfer pro-transfer"
        filterable
        :filter-method="transferFilterMethod"
        filter-placeholder="搜索题干、题库ID 或题型…"
        :titles="['题库候选', '本场练习已选']"
        :button-texts="['移除', '加入']"
        :data="transferData"
        :props="{ key: 'key', label: 'label' }"
      >
        <template #default="{ option }">
          <div class="qb-transfer-item">
            <div class="qb-transfer-stem" :title="String(option.stem)">{{ clipStem(option.stem) }}</div>
            <div class="qb-transfer-meta">
              <el-tag size="small" type="primary" effect="plain">{{ qbTypeLabel(option.type) }}</el-tag>
              <el-tag size="small" :type="qbDifficultyTagType(option.difficulty)" effect="light">{{ qbDifficultyLabel(option.difficulty) }}</el-tag>
              <span class="qb-transfer-id">题库ID {{ option.key }}</span>
              <span v-if="option.score != null && option.score !== ''" class="qb-transfer-score">{{ option.score }} 分</span>
            </div>
          </div>
        </template>
        <template #left-empty>
          <div class="transfer-empty">暂无候选题目，请先录入题库或调整题型筛选</div>
        </template>
        <template #right-empty>
          <div class="transfer-empty">尚未选题，请勾选左侧题目后加入</div>
        </template>
      </el-transfer>
      <template #footer>
        <el-button @click="qDlg = false">取消</el-button>
        <el-button type="primary" @click="saveQuestions">保存题目</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="aDlg" title="学生作答" width="960px" destroy-on-close align-center>
      <el-alert
        v-if="!gradingSubjective.length"
        type="info"
        show-icon
        :closable="false"
        title="本场练习仅包含客观题，提交后由系统自动判分，无需教师主观批改。"
        class="mb12"
      />
      <el-table :data="attempts" size="small" border stripe>
        <el-table-column prop="real_name" label="姓名" width="100" />
        <el-table-column prop="username" label="用户名" width="120" />
        <el-table-column prop="objective_score" label="客观分" width="88" align="right">
          <template #default="{ row }">{{ fmtScore(row.objective_score) }}</template>
        </el-table-column>
        <el-table-column prop="subjective_score" label="主观分" width="88" align="right">
          <template #default="{ row }">{{ fmtScore(row.subjective_score) }}</template>
        </el-table-column>
        <el-table-column prop="total_score" label="总分" width="88" align="right">
          <template #default="{ row }">{{ fmtScore(row.total_score) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="qbAttemptStatusTagType(row.status)">{{ qbAttemptStatusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="AI 建议" width="100" align="center">
          <template #default="{ row }">
            <el-popover v-if="row.ai_suggestion?.items?.length" placement="left" :width="360" trigger="click">
              <template #reference>
                <el-button link type="primary" size="small">查看</el-button>
              </template>
              <div class="ai-pop">
                <div v-for="(it, idx) in row.ai_suggestion.items" :key="idx" class="ai-pop-item">
                  <div class="ai-pop-title">第 {{ idx + 1 }} 题 · 建议 {{ it.suggested_score }} 分</div>
                  <p class="ai-pop-body">{{ it.rationale || '—' }}</p>
                </div>
              </div>
            </el-popover>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" align="right" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="gradingSubjective.length"
              link
              type="primary"
              size="small"
              @click="openGradePractice(row)"
            >
              批改主观题
            </el-button>
            <el-button
              v-if="gradingSubjective.length && row.ai_suggestion?.items?.length"
              link
              type="warning"
              size="small"
              @click="adoptPracticeAi(row)"
            >
              采纳 AI
            </el-button>
            <span v-if="!gradingSubjective.length" class="muted">—</span>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>

    <el-drawer v-model="gDlg" :title="gradeDrawerTitle" size="520px" destroy-on-close @closed="onGradeDrawerClosed">
      <div v-if="gAttempt" class="grade-drawer-body">
        <el-descriptions :column="1" border size="small" class="mb16">
          <el-descriptions-item label="学生">{{ gAttempt.real_name }}（{{ gAttempt.username }}）</el-descriptions-item>
          <el-descriptions-item label="答卷状态">
            <el-tag size="small" :type="qbAttemptStatusTagType(gAttempt.status)">{{ qbAttemptStatusLabel(gAttempt.status) }}</el-tag>
          </el-descriptions-item>
        </el-descriptions>
        <p class="grade-hint">请为下列简答/编程题评定得分（0～满分）。仅修改的分数会写回系统。</p>
        <div v-for="(it, idx) in gradingSubjective" :key="it.pq_id" class="grade-card">
          <div class="grade-card-head">
            <el-tag size="small" type="primary" effect="plain">{{ qbTypeLabel(it.type) }}</el-tag>
            <span class="grade-max">第 {{ idx + 1 }} 题 · 满分 {{ it.max_score }} 分</span>
          </div>
          <div class="grade-stem">{{ it.stem }}</div>
          <div class="grade-label">学生作答</div>
          <pre class="grade-ans">{{ studentAnswerText(gAttempt, it.pq_id) }}</pre>
          <div v-if="aiHintForPq(gAttempt, it.pq_id)" class="grade-ai">
            <span class="grade-ai-t">AI 参考</span>
            {{ aiHintForPq(gAttempt, it.pq_id) }}
          </div>
          <div class="grade-row">
            <span class="grade-label-inline">评定得分</span>
            <el-input-number
              v-model="gScores[String(it.pq_id)]"
              :min="0"
              :max="it.max_score"
              :step="0.5"
              :precision="1"
              controls-position="right"
              style="width: 160px"
            />
          </div>
        </div>
        <div class="grade-drawer-actions">
          <el-button @click="gDlg = false">取消</el-button>
          <el-button type="primary" :loading="gradeSaving" @click="saveGradePractice">保存批改</el-button>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, reactive } from 'vue'
import { useRtOnDomains } from '../../composables/useRtOnDomains'
import { getMyTeachingOverview } from '../../api/class'
import {
  listTeacherPractices,
  createPractice,
  updatePractice,
  deletePractice,
  getPracticeTeacher,
  setPracticeQuestions,
  listPracticeAttempts,
  gradePracticeAttempt,
  adoptPracticeAiScores,
  listQuestions,
} from '../../api/qb'
import {
  qbDifficultyLabel,
  qbDifficultyTagType,
  qbTypeLabel,
  qbAttemptStatusLabel,
  qbAttemptStatusTagType,
  qbPublishStatusLabel,
  parseJsonLoose,
} from '../../utils/qbLabels'
import { ElMessage, ElMessageBox } from 'element-plus'
import { formatDateTime, formatDateTimePicker } from '../../utils/format'

const classes = ref([])
const classId = ref(null)
const rows = ref([])
const loading = ref(false)
const dlg = ref(false)
const qDlg = ref(false)
const aDlg = ref(false)
const currentId = ref(null)
const attempts = ref([])
const gradingSubjective = ref([])
const gDlg = ref(false)
const gAttempt = ref(null)
const gScores = reactive({})
const gradeSaving = ref(false)

const gradeDrawerTitle = computed(() => {
  if (!gAttempt.value) return '主观题批改'
  return `主观题批改 · ${gAttempt.value.real_name || ''}`
})

const fmtScore = (v) => {
  if (v == null || v === '') return '—'
  const n = Number(v)
  return Number.isFinite(n) ? n.toFixed(2) : '—'
}

function studentAnswerText(attempt, pqId) {
  const ans = parseJsonLoose(attempt?.answers_json) || {}
  const t = ans[String(pqId)]
  return t != null && t !== '' ? String(t) : '（未作答）'
}

function aiHintForPq(attempt, pqId) {
  const per = attempt?.per_question_scores && typeof attempt.per_question_scores === 'object' ? attempt.per_question_scores : parseJsonLoose(attempt?.per_question_scores) || {}
  const cur = per[String(pqId)]
  if (!cur) return ''
  const parts = []
  if (Number.isFinite(Number(cur.ai_suggested_score))) parts.push(`建议 ${cur.ai_suggested_score} 分`)
  if (cur.ai_rationale) parts.push(String(cur.ai_rationale))
  return parts.join(' · ') || ''
}
const allQuestions = ref([])
const pickedQ = ref([])
const transferFilterType = ref('')
const transferTypeOpts = [
  { v: 'single', l: '单选题' },
  { v: 'multi', l: '多选题' },
  { v: 'judge', l: '判断题' },
  { v: 'fill', l: '填空题' },
  { v: 'short', l: '简答题' },
  { v: 'code', l: '编程题' },
]

function clipStem(s) {
  const t = String(s || '').replace(/\s+/g, ' ').trim()
  if (t.length <= 72) return t || '（无题干）'
  return `${t.slice(0, 72)}…`
}

function transferFilterMethod(query, item) {
  if (transferFilterType.value && item.type !== transferFilterType.value) return false
  const q = String(query || '').trim().toLowerCase()
  if (!q) return true
  return (
    String(item.stem || '').toLowerCase().includes(q) ||
    String(item.key || '').includes(q) ||
    qbTypeLabel(item.type).toLowerCase().includes(q)
  )
}

const transferData = computed(() =>
  allQuestions.value.map((q) => ({
    key: String(q.id),
    label: `[${qbTypeLabel(q.type)}] ${String(q.stem).slice(0, 40)}`,
    stem: q.stem,
    type: q.type,
    difficulty: q.difficulty,
    score: q.default_score,
  }))
)

const form = ref({
  title: '',
  deadline_at: '',
  publish_scores_at: '',
  description: '',
  shuffle_options: false,
})

const loadClasses = async () => {
  const res = await getMyTeachingOverview()
  if (res.success) {
    classes.value = res.data || []
    if (!classId.value && classes.value.length) classId.value = classes.value[0].id
  }
}

const load = async () => {
  if (!classId.value) return
  loading.value = true
  try {
    const res = await listTeacherPractices({ classId: classId.value })
    if (res.success) rows.value = res.data || []
  } finally {
    loading.value = false
  }
}

const openCreate = () => {
  currentId.value = null
  form.value = { title: '', deadline_at: '', publish_scores_at: '', description: '', shuffle_options: false }
  dlg.value = true
}

const openEdit = async (row) => {
  currentId.value = row.id
  try {
    const det = await getPracticeTeacher(row.id)
    if (!det.success) return
    const pr = det.data.practice
    form.value = {
      title: pr.title,
      deadline_at: pr.deadline_at ? formatDateTimePicker(pr.deadline_at) : '',
      publish_scores_at: pr.publish_scores_at ? formatDateTimePicker(pr.publish_scores_at) : '',
      description: pr.description || '',
      shuffle_options: !!pr.shuffle_options,
    }
    dlg.value = true
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '加载失败')
  }
}

const savePractice = async () => {
  if (!classId.value) return
  const payload = {
    classId: classId.value,
    ...form.value,
    publish_scores_at: form.value.publish_scores_at || null,
    deadline_at: form.value.deadline_at || null,
    status: 'published',
  }
  try {
    if (currentId.value) {
      await updatePractice(currentId.value, payload)
    } else {
      await createPractice(payload)
    }
    ElMessage.success('已保存')
    dlg.value = false
    load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '失败')
  }
}

const configure = async (row) => {
  currentId.value = row.id
  transferFilterType.value = ''
  const res = await listQuestions({ page: 1, pageSize: 500 })
  if (res.success) allQuestions.value = res.data || []
  const det = await getPracticeTeacher(row.id)
  if (det.success) {
    pickedQ.value = (det.data.questions || []).map((q) => String(q.question_id))
  }
  qDlg.value = true
}

const saveQuestions = async () => {
  try {
    await setPracticeQuestions(currentId.value, pickedQ.value.map((x) => Number(x)))
    ElMessage.success('题目已更新')
    qDlg.value = false
    load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '失败')
  }
}

const viewAttempts = async (row) => {
  currentId.value = row.id
  try {
    const [res, det] = await Promise.all([listPracticeAttempts(row.id), getPracticeTeacher(row.id)])
    if (!res.success) return
    attempts.value = res.data || []
    const qs = det.success ? det.data?.questions || [] : []
    gradingSubjective.value = qs
      .filter((q) => q.type === 'short' || q.type === 'code')
      .map((q) => ({
        pq_id: q.pq_id,
        type: q.type,
        stem: q.stem,
        max_score: Number(q.score_override) || Number(q.default_score) || 0,
      }))
    gDlg.value = false
    gAttempt.value = null
    aDlg.value = true
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '加载失败')
  }
}

const openGradePractice = (row) => {
  gAttempt.value = row
  Object.keys(gScores).forEach((k) => delete gScores[k])
  const per =
    row.per_question_scores && typeof row.per_question_scores === 'object'
      ? row.per_question_scores
      : parseJsonLoose(row.per_question_scores) || {}
  for (const it of gradingSubjective.value) {
    const k = String(it.pq_id)
    const cur = per[k]
    gScores[k] = Number.isFinite(Number(cur?.earned)) ? Number(cur.earned) : null
  }
  gDlg.value = true
}

const onGradeDrawerClosed = () => {
  gAttempt.value = null
  Object.keys(gScores).forEach((k) => delete gScores[k])
}

const saveGradePractice = async () => {
  if (!gAttempt.value) return
  const subjectiveScores = {}
  for (let i = 0; i < gradingSubjective.value.length; i++) {
    const it = gradingSubjective.value[i]
    const k = String(it.pq_id)
    const v = gScores[k]
    if (!Number.isFinite(v)) {
      ElMessage.warning(`请为第 ${i + 1} 道主观题填写得分`)
      return
    }
    if (v < 0 || v > it.max_score) {
      ElMessage.warning(`第 ${i + 1} 题得分须在 0～${it.max_score} 之间`)
      return
    }
    subjectiveScores[k] = v
  }
  gradeSaving.value = true
  try {
    await gradePracticeAttempt(currentId.value, gAttempt.value.id, subjectiveScores)
    ElMessage.success('批改已保存')
    gDlg.value = false
    await viewAttempts({ id: currentId.value })
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '保存失败')
  } finally {
    gradeSaving.value = false
  }
}

const adoptPracticeAi = async (row) => {
  try {
    await adoptPracticeAiScores(currentId.value, row.id, {})
    ElMessage.success('已按 AI 建议写入得分，可再打开「批改主观题」微调')
    await viewAttempts({ id: currentId.value })
    if (gDlg.value && gAttempt.value && gAttempt.value.id === row.id) {
      const fresh = attempts.value.find((a) => a.id === row.id)
      if (fresh) openGradePractice(fresh)
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '采纳失败')
  }
}

const remove = async (row) => {
  try {
    await ElMessageBox.confirm('确定删除该练习？', '确认', { type: 'warning' })
    await deletePractice(row.id)
    ElMessage.success('已删除')
    load()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('删除失败')
  }
}

useRtOnDomains(['qb_practices', 'qb_questions', 'scores'], () => load())

onMounted(async () => {
  await loadClasses()
  await load()
})
</script>

<style scoped>
.page-qb {
  max-width: 1400px;
}
.page-head {
  margin-bottom: 16px;
}
.page-title {
  margin: 0 0 6px;
  font-size: 22px;
  font-weight: 600;
}
.page-desc {
  margin: 0;
  font-size: 14px;
  color: var(--sg-text-secondary);
}
.panel-card {
  border-radius: var(--sg-radius-lg);
  border: 1px solid var(--sg-border);
}
.toolbar-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
}
.hint {
  font-size: 13px;
  color: var(--sg-text-secondary);
  margin: 0 0 12px;
}
.mt6 {
  margin-top: 6px;
}
.row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.tip {
  font-size: 12px;
  color: var(--sg-text-secondary);
  line-height: 1.4;
  margin-top: 4px;
}
.muted {
  color: var(--sg-text-secondary);
  font-size: 12px;
}
.ai-pre {
  margin: 0;
  font-size: 11px;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 360px;
  overflow: auto;
}
.qb-config-dialog :deep(.el-dialog__body) {
  padding-top: 12px;
}
.qb-config-hero {
  margin-bottom: 14px;
}
.qb-config-lead {
  margin: 0;
  font-size: 13px;
  line-height: 1.65;
  color: var(--sg-text-secondary);
}
.qb-transfer-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.qb-transfer-stat {
  font-size: 13px;
}
.pro-transfer {
  --transfer-panel-w: 380px;
  /** 覆盖 EP 默认 30px 行高，否则多行自定义插槽会重叠 */
  --el-transfer-item-height: auto;
}
.pro-transfer :deep(.el-transfer-panel) {
  width: var(--transfer-panel-w);
}
.pro-transfer :deep(.el-transfer-panel__body) {
  height: 420px;
}
.pro-transfer :deep(.el-transfer__buttons) {
  padding: 0 12px;
}
/* 穿梭框每项：自适应高度 + 取消单行省略 */
.pro-transfer :deep(.el-transfer-panel__item.el-checkbox) {
  height: auto !important;
  min-height: 48px;
  margin-right: 0;
  padding: 10px 12px 10px 15px;
  align-items: flex-start;
  box-sizing: border-box;
  line-height: 1.45;
}
.pro-transfer :deep(.el-transfer-panel__item .el-checkbox__input) {
  top: 12px;
}
.pro-transfer :deep(.el-transfer-panel__item.el-checkbox .el-checkbox__label) {
  white-space: normal !important;
  line-height: 1.45 !important;
  height: auto !important;
  min-height: 0;
  overflow: visible !important;
  text-overflow: unset !important;
  display: block;
  width: 100%;
  padding-left: 24px;
  box-sizing: border-box;
}
.qb-transfer-item {
  width: 100%;
  padding: 4px 0;
}
.qb-transfer-stem {
  font-size: 13px;
  line-height: 1.45;
  color: var(--sg-text);
  word-break: break-word;
}
.qb-transfer-meta {
  margin-top: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.qb-transfer-id {
  font-size: 12px;
  color: var(--sg-text-secondary);
  font-variant-numeric: tabular-nums;
}
.qb-transfer-score {
  font-size: 12px;
  color: var(--sg-text-secondary);
}
.transfer-empty {
  padding: 24px 12px;
  font-size: 13px;
  color: var(--sg-text-secondary);
  text-align: center;
  line-height: 1.6;
}
.mb12 {
  margin-bottom: 12px;
}
.mb16 {
  margin-bottom: 16px;
}
.ai-pop {
  max-height: 360px;
  overflow: auto;
}
.ai-pop-item + .ai-pop-item {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--sg-border);
}
.ai-pop-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 6px;
}
.ai-pop-body {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--sg-text-secondary);
}
.grade-drawer-body {
  padding-bottom: 24px;
}
.grade-hint {
  margin: 0 0 14px;
  font-size: 13px;
  color: var(--sg-text-secondary);
  line-height: 1.5;
}
.grade-card {
  border: 1px solid var(--sg-border);
  border-radius: var(--sg-radius-md, 8px);
  padding: 12px 14px;
  margin-bottom: 14px;
  background: var(--sg-bg-soft, rgba(0, 0, 0, 0.02));
}
.grade-card-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.grade-max {
  font-size: 12px;
  color: var(--sg-text-secondary);
}
.grade-stem {
  font-size: 14px;
  line-height: 1.55;
  margin-bottom: 10px;
  word-break: break-word;
}
.grade-label {
  font-size: 12px;
  color: var(--sg-text-secondary);
  margin-bottom: 4px;
}
.grade-label-inline {
  font-size: 13px;
  margin-right: 10px;
}
.grade-ans {
  margin: 0 0 10px;
  padding: 10px;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--el-fill-color-light);
  border-radius: 6px;
  max-height: 220px;
  overflow: auto;
}
.grade-ai {
  font-size: 12px;
  color: var(--sg-text-secondary);
  margin-bottom: 10px;
  line-height: 1.5;
}
.grade-ai-t {
  font-weight: 600;
  color: var(--sg-text);
  margin-right: 6px;
}
.grade-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.grade-drawer-actions {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
