<template>
  <div class="page-qb page-qb-exams">
    <header class="page-head exam-page-head">
      <div>
        <h1 class="page-title">在线考试</h1>
        <p class="page-desc">配置时间窗、时长与防作弊；学生交卷后客观题自动判分，主观题可批改，并支持成绩公布与导出。</p>
      </div>
    </header>

    <el-card shadow="never" class="panel-card exam-panel">
      <div class="exam-toolbar">
        <div class="exam-toolbar-left">
          <el-select
            v-model="classId"
            class="exam-class-select"
            placeholder="选择授课班级"
            filterable
            clearable
            @change="load"
          >
            <el-option v-for="c in classes" :key="c.id" :label="c.class_name" :value="c.id" />
          </el-select>
          <el-button type="primary" :disabled="!classId" :icon="Plus" @click="openCreate">新建考试</el-button>
        </div>
      </div>

      <el-table v-loading="loading" :data="rows" class="exam-table" border stripe style="width: 100%; margin-top: 14px">
        <el-table-column prop="title" label="考试名称" min-width="160" show-overflow-tooltip />
        <el-table-column label="开始时间" width="178">
          <template #default="{ row }">{{ formatDateTime(row.start_at) }}</template>
        </el-table-column>
        <el-table-column label="结束时间" width="178">
          <template #default="{ row }">{{ formatDateTime(row.end_at) }}</template>
        </el-table-column>
        <el-table-column prop="duration_minutes" label="时长(分)" width="92" align="center" />
        <el-table-column label="防切屏" width="88" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="row.anti_tab_switch ? 'warning' : 'info'" effect="plain">
              {{ row.anti_tab_switch ? '已开启' : '关闭' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag size="small" type="info" effect="plain">{{ qbPublishStatusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="520" align="right" fixed="right">
          <template #default="{ row }">
            <div class="exam-row-actions">
              <el-button type="primary" size="small" plain :icon="Edit" @click="openEdit(row)">编辑</el-button>
              <el-button type="primary" size="small" plain :icon="Setting" @click="configure(row)">组卷</el-button>
              <el-button type="primary" size="small" plain :icon="View" @click="openPaperPreview(row)">试卷</el-button>
              <el-button type="warning" size="small" plain :icon="Monitor" @click="openExamMonitor(row)">监考</el-button>
              <el-button type="primary" size="small" plain :icon="DataAnalysis" @click="viewAttempts(row)">成绩</el-button>
              <el-button type="success" size="small" plain :icon="Download" @click="exportX(row)">导出</el-button>
              <el-button type="danger" size="small" plain :icon="Delete" @click="remove(row)">删除</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dlg" :title="currentId ? '编辑考试' : '新建考试'" width="560px" destroy-on-close>
      <el-form label-width="120px">
        <el-form-item label="名称"><el-input v-model="form.title" /></el-form-item>
        <el-form-item label="说明"><el-input v-model="form.instructions" type="textarea" :rows="2" /></el-form-item>
        <el-form-item label="开始时间">
          <el-date-picker v-model="form.start_at" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" style="width: 100%" />
        </el-form-item>
        <el-form-item label="结束时间">
          <el-date-picker v-model="form.end_at" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" style="width: 100%" />
        </el-form-item>
        <el-form-item label="考试时长(分)"><el-input-number v-model="form.duration_minutes" :min="5" :max="600" /></el-form-item>
        <el-form-item label="提前交卷(分)">
          <el-input-number v-model="form.early_submit_minutes" :min="0" :max="120" />
          <span class="tip">结束前多少分钟内才允许交卷；0 表示不限制</span>
        </el-form-item>
        <el-form-item label="打乱题目"><el-switch v-model="form.shuffle_questions" /></el-form-item>
        <el-form-item label="打乱选项"><el-switch v-model="form.shuffle_options" /></el-form-item>
        <el-form-item label="防切屏"><el-switch v-model="form.anti_tab_switch" /></el-form-item>
        <el-form-item label="切屏上限"><el-input-number v-model="form.tab_switch_limit" :min="1" :max="20" /></el-form-item>
        <el-form-item label="成绩公布">
          <el-date-picker v-model="form.publish_scores_at" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" style="width: 100%" clearable />
        </el-form-item>
        <el-form-item label="IP 白名单">
          <el-input v-model="form.ip_allowlist" placeholder="可选，逗号分隔" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg = false">取消</el-button>
        <el-button type="primary" @click="saveExam">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="qDlg" class="qb-config-dialog" title="试卷题目配置" width="1000px" destroy-on-close align-center>
      <div class="qb-config-hero">
        <p class="qb-config-lead">
          从题库编排本场试卷题目顺序即右侧列表自上而下的出题顺序。题库中的<strong>题库ID</strong>为全局主键，不等于表格「序号」。
        </p>
      </div>
      <div class="qb-transfer-toolbar">
        <el-select v-model="transferFilterType" clearable placeholder="题型筛选" style="width: 140px">
          <el-option label="全部题型" value="" />
          <el-option v-for="t in transferTypeOpts" :key="t.v" :label="t.l" :value="t.v" />
        </el-select>
        <span class="qb-transfer-stat muted">题库 {{ allQuestions.length }} 题 · 已选 {{ pickedQ.length }} 题</span>
        <el-button size="small" type="primary" plain :icon="View" :disabled="!currentId" @click="openPaperPreviewByCurrent">预览本场试卷</el-button>
      </div>
      <el-transfer
        v-model="pickedQ"
        class="qb-transfer pro-transfer exam-transfer"
        filterable
        :filter-method="transferFilterMethod"
        filter-placeholder="搜索题干、题库ID 或题型…"
        :titles="['题库候选', '本场试卷已选']"
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
          <div class="transfer-empty">尚未选题；也可用下方「随机组卷」快速填充后再微调</div>
        </template>
      </el-transfer>
      <el-divider content-position="left">随机组卷</el-divider>
      <p class="hint">
        按题型分别设定抽题数量（各题型 0～100）；可限制难度与标签。若各题型数量均为 0，「跳过预览直接随机写入」将按默认从全题型随机抽 10 题。预览满意后再写入；写入将<strong>覆盖</strong>右侧已选列表（仍可在穿梭框微调后点保存）。
      </p>
      <div class="rand-counts-grid">
        <div v-for="t in transferTypeOpts" :key="t.v" class="rand-count-cell">
          <span class="rand-count-label">{{ t.l }}</span>
          <el-input-number v-model="randomCounts[t.v]" :min="0" :max="100" size="small" controls-position="right" />
        </div>
      </div>
      <div class="rand-row rand-row-second">
        <span class="rand-label">难度</span>
        <el-select v-model="randomDifficulty" clearable placeholder="不限" style="width: 120px">
          <el-option label="易" value="easy" />
          <el-option label="中" value="medium" />
          <el-option label="难" value="hard" />
        </el-select>
        <el-input v-model="randomTag" placeholder="知识点 / 课程标签关键词" clearable style="width: 260px" />
      </div>
      <div class="rand-actions">
        <el-button :disabled="!currentId" :loading="randomPreviewLoading" @click="doRandomPreview">预览抽题结果</el-button>
        <el-button type="warning" plain :disabled="!currentId" :loading="randomPickLoading" @click="doRandomPickDirect">跳过预览直接随机写入</el-button>
      </div>
      <template #footer>
        <el-button @click="qDlg = false">取消</el-button>
        <el-button type="primary" @click="saveQuestions">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="aDlg" title="考试作答 / 批改" width="960px" destroy-on-close align-center>
      <el-alert
        v-if="!gradingSubjective.length"
        type="info"
        show-icon
        :closable="false"
        title="本场考试仅含客观题，交卷后由系统自动判分，无需教师主观批改。"
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
              @click="openGradeExam(row)"
            >
              批改主观题
            </el-button>
            <el-button
              v-if="gradingSubjective.length && row.ai_suggestion?.items?.length"
              link
              type="warning"
              size="small"
              @click="adoptExamAi(row)"
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
        <p class="grade-hint">请为下列简答/编程题评定得分（0～满分）。</p>
        <div v-for="(it, idx) in gradingSubjective" :key="it.eq_id" class="grade-card">
          <div class="grade-card-head">
            <el-tag size="small" type="primary" effect="plain">{{ qbTypeLabel(it.type) }}</el-tag>
            <span class="grade-max">第 {{ idx + 1 }} 题 · 满分 {{ it.max_score }} 分</span>
          </div>
          <div class="grade-stem">{{ it.stem }}</div>
          <div class="grade-label">学生作答</div>
          <pre class="grade-ans">{{ studentExamAnswerText(gAttempt, it.eq_id) }}</pre>
          <div v-if="aiHintForEq(gAttempt, it.eq_id)" class="grade-ai">
            <span class="grade-ai-t">AI 参考</span>
            {{ aiHintForEq(gAttempt, it.eq_id) }}
          </div>
          <div class="grade-row">
            <span class="grade-label-inline">评定得分</span>
            <el-input-number
              v-model="gScores[String(it.eq_id)]"
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
          <el-button type="primary" :loading="gradeSaving" @click="saveGradeExam">保存批改</el-button>
        </div>
      </div>
    </el-drawer>

    <el-dialog v-model="paperDlg" title="试卷预览" width="920px" destroy-on-close align-center class="paper-preview-dlg">
      <el-skeleton v-if="paperLoading" :rows="8" animated />
      <template v-else>
        <p class="paper-preview-lead">{{ paperExamTitle }} · 共 <strong>{{ paperRows.length }}</strong> 题（顺序即学生作答顺序）</p>
        <el-table v-if="paperRows.length" :data="paperRows" size="small" border stripe max-height="520">
          <el-table-column type="index" label="#" width="52" align="center" />
          <el-table-column label="题型" width="100" align="center">
            <template #default="{ row }">
              <el-tag size="small" type="primary" effect="plain">{{ qbTypeLabel(row.type) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="难度" width="88" align="center">
            <template #default="{ row }">
              <el-tag size="small" :type="qbDifficultyTagType(row.difficulty)" effect="light">{{ qbDifficultyLabel(row.difficulty) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="分值" width="80" align="right">
            <template #default="{ row }">{{ row.max_score }}</template>
          </el-table-column>
          <el-table-column label="题干摘要" min-width="240" show-overflow-tooltip>
            <template #default="{ row }">{{ clipStem(row.stem) }}</template>
          </el-table-column>
        </el-table>
        <el-empty v-else description="本场尚未配置题目" />
      </template>
    </el-dialog>

    <el-dialog v-model="randomPreviewDlg" title="随机抽题预览" width="920px" destroy-on-close align-center>
      <p class="hint preview-hint">
        以下为按当前规则随机抽中的题目（每次预览结果可能不同）。确认后「写入试卷」将覆盖右侧已选；关闭可返回继续调整数量或筛选条件。
      </p>
      <el-table v-if="randomPreviewRows.length" :data="randomPreviewRows" size="small" border stripe max-height="440">
        <el-table-column type="index" label="#" width="52" align="center" />
        <el-table-column label="题型" width="100" align="center">
          <template #default="{ row }">
            <el-tag size="small" type="primary" effect="plain">{{ qbTypeLabel(row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="难度" width="88" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="qbDifficultyTagType(row.difficulty)" effect="light">{{ qbDifficultyLabel(row.difficulty) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="默认分" width="88" align="right">
          <template #default="{ row }">{{ row.default_score }}</template>
        </el-table-column>
        <el-table-column label="题干摘要" min-width="240" show-overflow-tooltip>
          <template #default="{ row }">{{ clipStem(row.stem) }}</template>
        </el-table-column>
      </el-table>
      <el-empty v-else description="当前条件下没有抽到题目，请增加数量或放宽难度/标签" />
      <template #footer>
        <el-button @click="randomPreviewDlg = false">关闭</el-button>
        <el-button
          type="primary"
          :loading="randomApplyLoading"
          :disabled="!lastPreviewQuestionIds.length"
          @click="applyRandomPreview"
        >
          写入试卷
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, reactive } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Edit, Setting, View, DataAnalysis, Download, Delete, Plus, Monitor } from '@element-plus/icons-vue'
import { getMyTeachingOverview } from '../../api/class'
import {
  listTeacherExams,
  createExam,
  updateExam,
  deleteExam,
  getExamTeacher,
  setExamQuestions,
  listExamAttempts,
  gradeExamAttempt,
  listQuestions,
  exportExamScores,
  previewExamRandomPick,
  randomPickExamQuestions,
  adoptExamAiScores,
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
import { useRtOnDomains } from '../../composables/useRtOnDomains'

const router = useRouter()
const route = useRoute()
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

const openExamMonitor = (row) => {
  if (!classId.value) {
    ElMessage.warning('请先选择班级')
    return
  }
  router.push(`/teacher/qbank/exams/${row.id}/monitor?classId=${classId.value}`)
}

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
    label: `[${qbTypeLabel(q.type)}] ${String(q.stem).slice(0, 36)}`,
    stem: q.stem,
    type: q.type,
    difficulty: q.difficulty,
    score: q.default_score,
  }))
)

const form = ref({
  title: '',
  instructions: '',
  start_at: '',
  end_at: '',
  duration_minutes: 90,
  early_submit_minutes: 0,
  shuffle_questions: false,
  shuffle_options: false,
  anti_tab_switch: false,
  tab_switch_limit: 3,
  publish_scores_at: '',
  ip_allowlist: '',
})

const randomCounts = reactive({
  single: 0,
  multi: 0,
  judge: 0,
  fill: 0,
  short: 0,
  code: 0,
})
const randomDifficulty = ref('')
const randomTag = ref('')
const randomPreviewLoading = ref(false)
const randomPickLoading = ref(false)
const randomApplyLoading = ref(false)
const randomPreviewDlg = ref(false)
const randomPreviewRows = ref([])
const lastPreviewQuestionIds = ref([])
const paperDlg = ref(false)
const paperLoading = ref(false)
const paperRows = ref([])
const paperExamTitle = ref('')

const gradeDrawerTitle = computed(() => {
  if (!gAttempt.value) return '主观题批改'
  return `主观题批改 · ${gAttempt.value.real_name || ''}`
})

const fmtScore = (v) => {
  if (v == null || v === '') return '—'
  const n = Number(v)
  return Number.isFinite(n) ? n.toFixed(2) : '—'
}

function studentExamAnswerText(attempt, eqId) {
  const ans =
    attempt?.answers && typeof attempt.answers === 'object' ? attempt.answers : parseJsonLoose(attempt?.answers) || {}
  const t = ans[String(eqId)]
  return t != null && t !== '' ? String(t) : '（未作答）'
}

function aiHintForEq(attempt, eqId) {
  const per =
    attempt?.per_question_scores && typeof attempt.per_question_scores === 'object'
      ? attempt.per_question_scores
      : parseJsonLoose(attempt?.per_question_scores) || {}
  const cur = per[String(eqId)]
  if (!cur) return ''
  const parts = []
  if (Number.isFinite(Number(cur.ai_suggested_score))) parts.push(`建议 ${cur.ai_suggested_score} 分`)
  if (cur.ai_rationale) parts.push(String(cur.ai_rationale))
  return parts.join(' · ') || ''
}

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
    const res = await listTeacherExams({ classId: classId.value })
    if (res.success) rows.value = res.data || []
  } finally {
    loading.value = false
  }
}

const openCreate = () => {
  currentId.value = null
  form.value = {
    title: '',
    instructions: '',
    start_at: '',
    end_at: '',
    duration_minutes: 90,
    early_submit_minutes: 0,
    shuffle_questions: false,
    shuffle_options: false,
    anti_tab_switch: false,
    tab_switch_limit: 3,
    publish_scores_at: '',
    ip_allowlist: '',
  }
  dlg.value = true
}

const openEdit = (row) => {
  currentId.value = row.id
  form.value = {
    title: row.title,
    instructions: row.instructions || '',
    start_at: formatDateTimePicker(row.start_at),
    end_at: formatDateTimePicker(row.end_at),
    duration_minutes: row.duration_minutes,
    early_submit_minutes: row.early_submit_minutes,
    shuffle_questions: !!row.shuffle_questions,
    shuffle_options: !!row.shuffle_options,
    anti_tab_switch: !!row.anti_tab_switch,
    tab_switch_limit: row.tab_switch_limit,
    publish_scores_at: row.publish_scores_at ? formatDateTimePicker(row.publish_scores_at) : '',
    ip_allowlist: row.ip_allowlist || '',
  }
  dlg.value = true
}

const saveExam = async () => {
  if (!classId.value) return
  const payload = {
    classId: classId.value,
    ...form.value,
    status: 'published',
    publish_scores_at: form.value.publish_scores_at || null,
  }
  try {
    if (currentId.value) {
      await updateExam(currentId.value, payload)
    } else {
      await createExam(payload)
    }
    ElMessage.success('已保存')
    dlg.value = false
    load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '失败')
  }
}

function buildRandomRules() {
  return {
    counts_by_type: {
      single: randomCounts.single,
      multi: randomCounts.multi,
      judge: randomCounts.judge,
      fill: randomCounts.fill,
      short: randomCounts.short,
      code: randomCounts.code,
    },
    difficulty: randomDifficulty.value || undefined,
    knowledge_tag: randomTag.value?.trim() || undefined,
  }
}

function mapExamQuestionsToPaperRows(qs) {
  return (qs || []).map((q) => ({
    type: q.type,
    stem: q.stem,
    difficulty: q.difficulty,
    max_score: Number(q.score) || Number(q.default_score) || 0,
  }))
}

const openPaperPreview = async (row) => {
  paperLoading.value = true
  paperDlg.value = true
  paperRows.value = []
  try {
    const det = await getExamTeacher(row.id)
    if (det.success) {
      paperExamTitle.value = det.data?.exam?.title || row.title || '试卷预览'
      paperRows.value = mapExamQuestionsToPaperRows(det.data?.questions || [])
    }
  } catch {
    ElMessage.error('加载试卷失败')
  } finally {
    paperLoading.value = false
  }
}

const openPaperPreviewByCurrent = async () => {
  if (!currentId.value) return
  const row = rows.value.find((r) => r.id === currentId.value)
  await openPaperPreview({ id: currentId.value, title: row?.title || '本场考试' })
}

const configure = async (row) => {
  currentId.value = row.id
  transferTypeOpts.forEach((t) => {
    randomCounts[t.v] = 0
  })
  randomDifficulty.value = ''
  randomTag.value = ''
  lastPreviewQuestionIds.value = []
  randomPreviewRows.value = []
  transferFilterType.value = ''
  const res = await listQuestions({ page: 1, pageSize: 500 })
  if (res.success) allQuestions.value = res.data || []
  const det = await getExamTeacher(row.id)
  if (det.success) {
    pickedQ.value = (det.data.questions || []).map((q) => String(q.question_id))
  }
  qDlg.value = true
}

const doRandomPreview = async () => {
  if (!currentId.value) return
  randomPreviewLoading.value = true
  lastPreviewQuestionIds.value = []
  randomPreviewRows.value = []
  try {
    const res = await previewExamRandomPick(currentId.value, { rules: buildRandomRules() })
    if (!res.success) {
      ElMessage.error(res.message || '预览失败')
      return
    }
    randomPreviewRows.value = res.data?.questions || []
    lastPreviewQuestionIds.value = res.data?.question_ids || []
    randomPreviewDlg.value = true
    if (!randomPreviewRows.value.length) ElMessage.info('当前条件下未抽到题目，请放宽难度或标签')
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '预览失败')
  } finally {
    randomPreviewLoading.value = false
  }
}

const applyRandomPreview = async () => {
  if (!currentId.value || !lastPreviewQuestionIds.value.length) return
  randomApplyLoading.value = true
  try {
    await randomPickExamQuestions(currentId.value, { question_ids: lastPreviewQuestionIds.value })
    ElMessage.success('已按预览写入试卷')
    randomPreviewDlg.value = false
    const det = await getExamTeacher(currentId.value)
    if (det.success) {
      pickedQ.value = (det.data.questions || []).map((q) => String(q.question_id))
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '写入失败')
  } finally {
    randomApplyLoading.value = false
  }
}

const doRandomPickDirect = async () => {
  if (!currentId.value) return
  try {
    await ElMessageBox.confirm(
      '将按当前题型数量与筛选条件重新随机抽题，并覆盖本场全部题目（与预览结果可能不同）。是否继续？',
      '直接随机写入',
      { type: 'warning' }
    )
  } catch {
    return
  }
  randomPickLoading.value = true
  try {
    await randomPickExamQuestions(currentId.value, { rules: buildRandomRules() })
    ElMessage.success('已随机组卷')
    const det = await getExamTeacher(currentId.value)
    if (det.success) {
      pickedQ.value = (det.data.questions || []).map((q) => String(q.question_id))
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '随机组卷失败')
  } finally {
    randomPickLoading.value = false
  }
}

const saveQuestions = async () => {
  const items = pickedQ.value.map((id) => ({ questionId: Number(id), score: null }))
  try {
    await setExamQuestions(currentId.value, items)
    ElMessage.success('已保存')
    qDlg.value = false
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '失败')
  }
}

const viewAttempts = async (row) => {
  currentId.value = row.id
  try {
    const [res, det] = await Promise.all([listExamAttempts(row.id), getExamTeacher(row.id)])
    if (!res.success) return
    attempts.value = res.data || []
    const qs = det.success ? det.data?.questions || [] : []
    gradingSubjective.value = qs
      .filter((q) => q.type === 'short' || q.type === 'code')
      .map((q) => ({
        eq_id: q.id,
        type: q.type,
        stem: q.stem,
        max_score: Number(q.score) || Number(q.default_score) || 0,
      }))
    gDlg.value = false
    gAttempt.value = null
    aDlg.value = true
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '加载失败')
  }
}

const openGradeExam = (row) => {
  gAttempt.value = row
  Object.keys(gScores).forEach((k) => delete gScores[k])
  const per =
    row.per_question_scores && typeof row.per_question_scores === 'object'
      ? row.per_question_scores
      : parseJsonLoose(row.per_question_scores) || {}
  for (const it of gradingSubjective.value) {
    const k = String(it.eq_id)
    const cur = per[k]
    gScores[k] = Number.isFinite(Number(cur?.earned)) ? Number(cur.earned) : null
  }
  gDlg.value = true
}

const onGradeDrawerClosed = () => {
  gAttempt.value = null
  Object.keys(gScores).forEach((k) => delete gScores[k])
}

const saveGradeExam = async () => {
  if (!gAttempt.value) return
  const subjectiveScores = {}
  for (let i = 0; i < gradingSubjective.value.length; i++) {
    const it = gradingSubjective.value[i]
    const k = String(it.eq_id)
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
    await gradeExamAttempt(currentId.value, gAttempt.value.id, subjectiveScores)
    ElMessage.success('批改已保存')
    gDlg.value = false
    await viewAttempts({ id: currentId.value })
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '保存失败')
  } finally {
    gradeSaving.value = false
  }
}

const adoptExamAi = async (row) => {
  try {
    await adoptExamAiScores(currentId.value, row.id, {})
    ElMessage.success('已按 AI 建议写入得分，可再打开「批改主观题」微调')
    await viewAttempts({ id: currentId.value })
    if (gDlg.value && gAttempt.value && gAttempt.value.id === row.id) {
      const fresh = attempts.value.find((a) => a.id === row.id)
      if (fresh) openGradeExam(fresh)
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '采纳失败')
  }
}

const exportX = async (row) => {
  try {
    const blob = await exportExamScores(row.id)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `exam-${row.id}-scores.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    ElMessage.error('导出失败')
  }
}

const remove = async (row) => {
  try {
    await ElMessageBox.confirm('确定删除该考试？', '确认', { type: 'warning' })
    await deleteExam(row.id)
    ElMessage.success('已删除')
    load()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('删除失败')
  }
}

onMounted(async () => {
  await loadClasses()
  const qc = Number(route.query.classId)
  if (Number.isFinite(qc) && qc > 0) classId.value = qc
  await load()
})

useRtOnDomains(['qb_exams', 'qb_questions', 'scores'], () => {
  void load()
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
}
.tip {
  margin-left: 8px;
  font-size: 12px;
  color: var(--sg-text-secondary);
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
.hint {
  font-size: 13px;
  color: var(--sg-text-secondary);
  margin: 0 0 12px;
}
.rand-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-bottom: 10px;
}
.rand-types {
  margin-bottom: 12px;
}
.rand-label {
  font-size: 13px;
  color: var(--sg-text-secondary);
  margin-right: 4px;
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
  max-height: 400px;
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
.exam-transfer {
  --transfer-panel-w: 380px;
  --el-transfer-item-height: auto;
}
.exam-transfer :deep(.el-transfer-panel) {
  width: var(--transfer-panel-w);
}
.exam-transfer :deep(.el-transfer-panel__body) {
  height: 400px;
}
.exam-transfer :deep(.el-transfer__buttons) {
  padding: 0 12px;
}
.exam-transfer :deep(.el-transfer-panel__item.el-checkbox) {
  height: auto !important;
  min-height: 48px;
  margin-right: 0;
  padding: 10px 12px 10px 15px;
  align-items: flex-start;
  box-sizing: border-box;
  line-height: 1.45;
}
.exam-transfer :deep(.el-transfer-panel__item .el-checkbox__input) {
  top: 12px;
}
.exam-transfer :deep(.el-transfer-panel__item.el-checkbox .el-checkbox__label) {
  white-space: normal !important;
  line-height: 1.45 !important;
  height: auto !important;
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

.page-qb-exams .exam-panel {
  border-radius: var(--sg-radius-lg, 12px);
}
.exam-page-head {
  margin-bottom: 18px;
}
.exam-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 0 2px;
}
.exam-toolbar-left {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}
.exam-class-select {
  width: 280px;
}
.exam-table :deep(.el-table__cell) {
  vertical-align: middle;
}
.exam-row-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
}
.exam-row-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

.rand-counts-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px 14px;
  margin: 14px 0 10px;
}
@media (max-width: 900px) {
  .rand-counts-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
.rand-count-cell {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-blank);
}
.rand-count-label {
  font-size: 13px;
  color: var(--sg-text-secondary, #606266);
  flex-shrink: 0;
}
.rand-row-second {
  margin-top: 4px;
}
.rand-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
}
.preview-hint {
  margin: 0 0 12px;
  line-height: 1.55;
}
.paper-preview-lead {
  margin: 0 0 14px;
  font-size: 14px;
  color: var(--sg-text-secondary, #606266);
}
.paper-preview-lead strong {
  color: var(--el-color-primary);
  font-weight: 600;
}
</style>
