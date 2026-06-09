<template>
  <div class="submission-workbench">
    <header class="workbench-head">
      <div class="workbench-head__left">
        <el-button plain @click="goBack">返回</el-button>
        <div class="workbench-head__info">
          <p class="workbench-eyebrow">任务提交与批改工作台</p>
          <h1 class="workbench-title">{{ taskInfo?.title || taskTitle || '加载中…' }}</h1>
          <div class="task-meta">
            <span class="task-meta__item">
              <el-tag size="small" effect="plain">{{ scopeInfo.type }}</el-tag>
              {{ scopeInfo.name }}
            </span>
            <span class="task-meta__item">截止 {{ formatDateTime(taskInfo?.deadline) || '—' }}</span>
            <span class="task-meta__item">满分 {{ taskInfo?.max_score ?? 100 }}</span>
            <span class="task-meta__item">
              类型 {{ scenarioLabel(taskInfo?.scenario_type) }}
            </span>
            <el-tag size="small" :type="deadlineMeta.tagType" effect="light">
              {{ deadlineMeta.statusText }}
            </el-tag>
          </div>
        </div>
      </div>
      <div class="workbench-head__actions-wrap">
        <div class="workbench-head__actions">
          <el-button @click="dlXlsx" :disabled="!canExport">导出成绩 Excel</el-button>
          <el-button plain @click="dlZip" :disabled="!canExport">打包作业 ZIP</el-button>
          <el-button plain @click="goGradingJobs">批改任务</el-button>
          <el-button
            type="success"
            :disabled="selectedCount === 0"
            @click="confirmBatchSelected"
          >
            批量 AI 批改{{ selectedCount ? `（${selectedCount}）` : '' }}
          </el-button>
          <el-button type="warning" plain @click="batchRetryFailed">重试失败项</el-button>
          <el-dropdown trigger="click" @command="onMoreBatchCommand">
            <el-button plain>
              更多
              <el-icon class="el-icon--right"><ArrowDown /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="regrade_all">重批全部（需确认）</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
        <p class="batch-select-hint">
          批量 AI 批改仅处理「已提交、未 AI 批改、内容安全通过、代码运行检查已满足」的学生提交；已完成 AI 批改或待教师复核的记录不可重复选择。
        </p>
      </div>
    </header>

    <el-alert
      v-if="hasGradingInProgress"
      type="info"
      :closable="false"
      show-icon
      class="async-tip"
      title="部分提交正在后台 AI 批改中，列表将自动刷新；进度见右下角卡片或「批改任务」。"
    />

    <el-skeleton v-if="loading" animated :rows="8" class="sk-main" />

    <template v-else>
      <section class="metric-grid">
        <button
          v-for="card in metricCards"
          :key="card.key"
          type="button"
          class="metric-card"
          :class="{ 'metric-card--active': card.filter && activeFilter === card.filter }"
          @click="card.filter && (activeFilter = card.filter)"
        >
          <div class="metric-card__icon" :class="`metric-card__icon--${card.tone}`">
            <el-icon><component :is="card.icon" /></el-icon>
          </div>
          <div class="metric-card__body">
            <span class="metric-card__value">{{ card.value }}</span>
            <span class="metric-card__label">{{ card.label }}</span>
          </div>
        </button>
      </section>

      <section class="alert-row">
        <div class="alert-card">
          <div class="alert-card__head">
            <h3>未提交学生</h3>
            <span class="alert-card__count">{{ kpis.unsubmitted }} 人</span>
            <el-button
              v-if="unsubNamesText"
              size="small"
              link
              type="primary"
              @click="copyText(unsubNamesText)"
            >
              复制名单
            </el-button>
          </div>
          <p class="alert-card__body">{{ unsubNamesText || '全部学生均已提交' }}</p>
          <p v-if="overview?.deadline" class="alert-card__hint">
            截止时间：{{ formatDateTime(overview.deadline) }}
          </p>
        </div>
        <div class="alert-card">
          <div class="alert-card__head">
            <h3>超时提交</h3>
            <span class="alert-card__count">{{ kpis.late }} 人</span>
            <el-button
              v-if="lateNamesText"
              size="small"
              link
              type="primary"
              @click="copyText(lateNamesText)"
            >
              复制名单
            </el-button>
          </div>
          <p class="alert-card__body">{{ lateNamesText || '暂无超时提交' }}</p>
        </div>
      </section>

      <div v-if="!submissions.length" class="panel empty-panel">
        <el-empty :image-size="100">
          <template #description>
            <p class="empty-title">暂无学生提交</p>
            <p class="empty-desc">
              当前任务还没有学生提交作业。学生提交后，可在此进行 AI 批改、教师复核和成绩导出。
            </p>
          </template>
          <div class="empty-actions">
            <el-button v-if="unsubNamesText" @click="copyText(unsubNamesText)">复制未提交名单</el-button>
            <el-button type="primary" plain @click="goBack">返回任务列表</el-button>
          </div>
        </el-empty>
      </div>

      <div v-else class="panel">
        <div class="panel__header">
          <div>
            <h2 class="panel__title">提交记录</h2>
            <span class="panel__meta">筛选后 {{ filteredRows.length }} 条</span>
          </div>
          <div class="toolbar">
            <span class="toolbar-label">表格密度</span>
            <el-radio-group v-model="mode" size="small">
              <el-radio-button value="default">{{ labelMap.default }}</el-radio-button>
              <el-radio-button value="compact">{{ labelMap.compact }}</el-radio-button>
              <el-radio-button value="comfortable">{{ labelMap.comfortable }}</el-radio-button>
            </el-radio-group>
          </div>
        </div>

        <div class="select-toolbar">
          <div class="select-toolbar__left">
            <el-button size="small" type="primary" plain @click="selectAllEligibleInFilter">
              一键全选可批改
            </el-button>
            <el-dropdown trigger="click" @command="onQuickSelect">
              <el-button size="small">
                快速选择
                <el-icon class="el-icon--right"><ArrowDown /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="page">本页可批改提交</el-dropdown-item>
                  <el-dropdown-item command="filter_all">当前筛选全部可批改提交</el-dropdown-item>
                  <el-dropdown-item command="pending_ai" divided>已提交但未 AI 批改</el-dropdown-item>
                  <el-dropdown-item command="late">超时提交但可批改</el-dropdown-item>
                  <el-dropdown-item command="clear" divided>清空选择</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <el-button v-if="selectedCount > 0" size="small" plain @click="clearSelection">
              清空选择
            </el-button>
          </div>
          <span class="select-toolbar__meta">
            当前筛选可批改 {{ filterEligibleCount }} 条
          </span>
        </div>

        <el-tabs v-model="activeFilter" class="filter-tabs">
          <el-tab-pane
            v-for="tab in FILTER_TABS"
            :key="tab.key"
            :label="tab.label"
            :name="tab.key"
          />
        </el-tabs>

        <div v-if="selectedCount > 0" class="batch-bar">
          <div class="batch-bar__main">
            <span class="batch-bar__text">
              已选择 {{ selectedCount }} 条可批改提交
              <span v-if="hiddenSelectedCount > 0">，其中包含跨页选择项</span>
            </span>
            <el-button
              v-if="filterEligibleCount > selectedCount"
              link
              type="primary"
              size="small"
              class="batch-bar__link"
              @click="selectAllEligibleInFilter"
            >
              选择当前筛选下全部 {{ filterEligibleCount }} 条可批改提交
            </el-button>
          </div>
          <div class="batch-bar__actions">
            <el-button type="success" size="small" @click="confirmBatchSelected">
              批量 AI 批改（{{ selectedCount }}）
            </el-button>
            <el-button size="small" plain @click="clearSelection">清空选择</el-button>
          </div>
        </div>

        <el-table
          :data="filteredRows"
          border
          :size="tableSize"
          stripe
          class="data-table"
          style="width: 100%"
          row-key="selectionKey"
        >
          <template #empty>
            <div class="table-empty">当前筛选条件下暂无记录</div>
          </template>

          <el-table-column width="48" align="center" fixed="left">
            <template #header>
              <el-checkbox
                :model-value="headerAllChecked"
                :indeterminate="headerIndeterminate"
                :disabled="!pageEligibleRows.length"
                aria-label="全选当前页可批改学生"
                @change="onHeaderSelectAll"
              />
            </template>
            <template #default="{ row }">
              <el-tooltip
                v-if="row._rowType === 'submitted'"
                :content="rowEligibility(row).reason || '可批改'"
                :disabled="rowEligibility(row).eligible"
                placement="top"
              >
                <el-checkbox
                  :model-value="isSelected(row.id)"
                  :disabled="!rowEligibility(row).eligible"
                  aria-label="选择该学生提交"
                  @change="(val) => toggleRowSelection(row.id, val)"
                />
              </el-tooltip>
            </template>
          </el-table-column>

          <el-table-column label="学生信息" min-width="140" show-overflow-tooltip>
            <template #default="{ row }">
              <div class="student-cell">
                <span class="student-cell__name">{{ row.student_name || '—' }}</span>
                <span class="student-cell__class">{{ row.class_name || '—' }}</span>
              </div>
            </template>
          </el-table-column>

          <el-table-column label="提交材料" min-width="180" show-overflow-tooltip>
            <template #default="{ row }">
              <span :title="row.file_name || ''">{{ row.file_name || '—' }}</span>
            </template>
          </el-table-column>

          <el-table-column label="提交时间" min-width="158" show-overflow-tooltip>
            <template #default="{ row }">
              {{ row.submitted_at ? formatDateTime(row.submitted_at) : '—' }}
            </template>
          </el-table-column>

          <el-table-column label="提交状态" width="108" align="center">
            <template #default="{ row }">
              <el-tag size="small" :type="submitStatusMeta(row).type" effect="light">
                {{ submitStatusMeta(row).text }}
              </el-tag>
            </template>
          </el-table-column>

          <el-table-column label="内容安全" width="108" align="center">
            <template #default="{ row }">
              <template v-if="row._rowType === 'submitted'">
                <el-tag size="small" :type="safetyStatusMeta(row.safety_status).type" effect="light">
                  {{ safetyStatusMeta(row.safety_status).text }}
                </el-tag>
              </template>
              <span v-else class="muted">—</span>
            </template>
          </el-table-column>

          <el-table-column label="AI 批改" width="108" align="center">
            <template #default="{ row }">
              <template v-if="row._rowType === 'submitted'">
                <div class="score-cell">
                  <span class="score-cell__num">{{ aiScoreDisplay(row) }}</span>
                  <el-tag size="small" :type="aiGradingMeta(row.status, row.active_grading_item_status).type" effect="light">
                    {{ aiGradingMeta(row.status, row.active_grading_item_status).text }}
                  </el-tag>
                </div>
              </template>
              <span v-else class="muted">—</span>
            </template>
          </el-table-column>

          <el-table-column label="教师复核" width="108" align="center">
            <template #default="{ row }">
              <el-tag
                v-if="row._rowType === 'submitted'"
                size="small"
                :type="humanReviewMeta(row.status).type"
                :effect="humanReviewMeta(row.status).muted ? 'plain' : 'light'"
                class="review-tag"
                :class="{ 'review-tag--muted': humanReviewMeta(row.status).muted }"
              >
                {{ humanReviewMeta(row.status).text }}
              </el-tag>
              <span v-else class="muted">—</span>
            </template>
          </el-table-column>

          <el-table-column label="反馈" width="96" align="center">
            <template #default="{ row }">
              <template v-if="row._rowType === 'submitted'">
                <el-tag
                  v-if="row.feedbackCount > 0"
                  size="small"
                  type="warning"
                  effect="dark"
                  class="feedback-tag"
                  @click="openFeedback(row)"
                >
                  待处理 {{ row.feedbackCount }}
                </el-tag>
                <el-tag
                  v-else-if="row.feedbackStatus"
                  size="small"
                  :type="feedbackStatusTag(row.feedbackStatus)"
                  effect="light"
                  class="feedback-tag"
                  @click="openFeedback(row)"
                >
                  {{ feedbackStatusText(row.feedbackStatus) }}
                </el-tag>
                <span v-else class="muted">无</span>
              </template>
              <span v-else class="muted">—</span>
            </template>
          </el-table-column>

          <el-table-column label="综合成绩" width="92" align="center">
            <template #default="{ row }">
              <span v-if="row._rowType === 'submitted'" class="final-score">
                {{ finalScoreDisplay(row) }}
              </span>
              <span v-else class="muted">—</span>
            </template>
          </el-table-column>

          <el-table-column label="查重" width="96" align="center">
            <template #default="{ row }">
              <template v-if="row._rowType === 'submitted' && similarityDisplay(row)">
                <span>{{ similarityDisplay(row) }}</span>
                <el-tag
                  v-if="row.similarity_level === 'high'"
                  type="danger"
                  size="small"
                  class="sim-tag"
                >
                  疑
                </el-tag>
                <el-tag
                  v-else-if="row.similarity_level === 'warn'"
                  type="warning"
                  size="small"
                  class="sim-tag"
                >
                  警
                </el-tag>
              </template>
              <span v-else class="muted">—</span>
            </template>
          </el-table-column>

          <el-table-column label="代码运行" width="100" align="center">
            <template #default="{ row }">
              <el-tag
                v-if="row._rowType === 'submitted'"
                size="small"
                :type="codeRunMeta(row.code_run_summary, taskCodeRunEnabled).type"
                effect="light"
              >
                {{ codeRunMeta(row.code_run_summary, taskCodeRunEnabled).text }}
              </el-tag>
              <el-tag v-else-if="!taskCodeRunEnabled" size="small" type="info" effect="light">
                未启用
              </el-tag>
              <span v-else class="muted">—</span>
            </template>
          </el-table-column>

          <el-table-column label="操作" width="220" align="right" fixed="right">
            <template #default="{ row }">
              <div v-if="row._rowType === 'submitted'" class="row-actions">
                <el-button
                  v-if="rowActions(row).showView"
                  type="primary"
                  size="small"
                  @click="viewGrading(row)"
                >
                  查看批改
                </el-button>
                <el-button
                  v-if="rowActions(row).showPrimary"
                  :type="rowActions(row).primaryType || 'success'"
                  size="small"
                  :plain="rowActions(row).primaryType !== 'warning'"
                  :disabled="rowActions(row).primaryDisabled"
                  @click="onPrimaryAction(row)"
                >
                  {{ rowActions(row).primaryLabel }}
                </el-button>
                <el-dropdown trigger="click" @command="(cmd) => handleMore(cmd, row)">
                  <el-button size="small">
                    更多
                    <el-icon class="el-icon--right"><ArrowDown /></el-icon>
                  </el-button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="grading">查看批改报告</el-dropdown-item>
                      <el-dropdown-item command="history">查看历史版本</el-dropdown-item>
                      <el-dropdown-item v-if="rowActions(row).showRegradeInMore" command="regrade">
                        重新 AI 批改
                      </el-dropdown-item>
                      <el-dropdown-item
                        v-if="row.max_similarity != null && Number(row.max_similarity) > 0"
                        command="compare"
                      >
                        查重对比
                      </el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </div>
              <span v-else class="muted">—</span>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </template>
    <SubmissionHistoryDialog ref="historyDialogRef" :submission-id="historySubmissionId || 0" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowDown,
  User,
  Upload,
  Clock,
  EditPen,
  CircleCheck,
  Document,
  Cpu,
} from '@element-plus/icons-vue'
import { getSubmissionsByTask } from '../../api/submission'
import { aiGradeSubmission, batchAiGrade, getEligibleSubmissions } from '../../api/grading'
import { getTaskById, getTaskSubmissionOverview } from '../../api/task'
import { downloadScoresExcel, downloadSubmissionsZip } from '../../api/export'
import { formatDateTime } from '../../utils/format'
import { applyGradingJobResponse, gradingJobErrorMessage } from '../../utils/gradingJobSubmit'
import { useTableDensity } from '../../composables/useTableDensity'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRtOnDomains } from '../../composables/useRtOnDomains'
import {
  scenarioLabel,
  taskDeadlineMeta,
  publishScopeLabel,
  buildSubmissionKpis,
  mergeAllRows,
  filterDisplayRows,
  submitStatusMeta,
  aiGradingMeta,
  humanReviewMeta,
  codeRunMeta,
  finalScoreDisplay,
  aiScoreDisplay,
  similarityDisplay,
  namesListText,
  lateListText,
  feedbackStatusText,
  feedbackStatusTag,
  FILTER_TABS,
  KPI_CARDS,
} from '../../utils/submissionWorkbenchData'
import { safetyStatusMeta } from '../../utils/contentSafety'
import { getSubmissionAiBatchEligibility, getSubmissionRowActions } from '../../utils/submissionAiBatchEligibility'
import SubmissionHistoryDialog from '../../components/SubmissionHistoryDialog.vue'

const route = useRoute()
const router = useRouter()
const { mode, tableSize, labelMap } = useTableDensity()

const KPI_ICON_MAP = {
  expected: User,
  submitted: Upload,
  unsubmitted: Document,
  late: Clock,
  aiGraded: Cpu,
  pendingReview: EditPen,
  completed: CircleCheck,
}

const submissions = ref([])
const taskInfo = ref(null)
const taskTitle = ref('')
const taskCodeRunEnabled = ref(false)
const loading = ref(true)
const taskClassId = ref(null)
const taskTeachingClassId = ref(null)
const overview = ref(null)
const canExport = computed(
  () => !!(taskTeachingClassId.value || taskClassId.value)
)

const exportAudienceId = computed(() =>
  taskTeachingClassId.value ? taskTeachingClassId.value : taskClassId.value
)

const exportOpts = computed(() =>
  taskTeachingClassId.value
    ? { scope: 'teaching', teachingClassId: taskTeachingClassId.value }
    : { scope: 'class' }
)
const activeFilter = ref('all')
const selectedSubmissionIds = ref(new Set())
const historySubmissionId = ref(null)
const historyDialogRef = ref(null)

const eligibilityOptions = computed(() => ({
  codeRunEnabled: taskCodeRunEnabled.value,
}))

function rowEligibility(row) {
  return getSubmissionAiBatchEligibility(row, eligibilityOptions.value)
}

function rowActions(row) {
  return getSubmissionRowActions(row, eligibilityOptions.value)
}

const pageEligibleRows = computed(() =>
  filteredRows.value.filter((r) => r._rowType === 'submitted' && rowEligibility(r).eligible)
)

const filterEligibleRows = computed(() => pageEligibleRows.value)

const filterEligibleCount = computed(() => filterEligibleRows.value.length)

const lateStudentIds = computed(() =>
  (overview.value?.lateSubmitters || []).map((x) => Number(x.id)).filter(Boolean)
)

const pendingAiEligibleRows = computed(() =>
  filterEligibleRows.value.filter((r) => {
    const st = r.status || 'pending'
    return !st || st === 'pending' || st === 'ai_failed'
  })
)

const lateEligibleRows = computed(() => filterEligibleRows.value.filter((r) => r._late))

const selectedCount = computed(() => selectedSubmissionIds.value.size)

const visibleSelectedCount = computed(
  () => filteredRows.value.filter((r) => r.id && selectedSubmissionIds.value.has(r.id)).length
)

const hiddenSelectedCount = computed(() =>
  Math.max(0, selectedCount.value - visibleSelectedCount.value)
)

const headerAllChecked = computed(() => {
  const eligible = pageEligibleRows.value
  if (!eligible.length) return false
  return eligible.every((r) => selectedSubmissionIds.value.has(r.id))
})

const headerIndeterminate = computed(() => {
  const eligible = pageEligibleRows.value
  if (!eligible.length) return false
  const picked = eligible.filter((r) => selectedSubmissionIds.value.has(r.id)).length
  return picked > 0 && picked < eligible.length
})

function onHeaderSelectAll(checked) {
  const next = new Set(selectedSubmissionIds.value)
  for (const row of pageEligibleRows.value) {
    if (checked) next.add(row.id)
    else next.delete(row.id)
  }
  selectedSubmissionIds.value = next
}

function addSelectionIds(ids) {
  const next = new Set(selectedSubmissionIds.value)
  for (const id of ids) {
    if (id != null) next.add(id)
  }
  selectedSubmissionIds.value = next
}

function selectAllEligibleInFilter() {
  addSelectionIds(filterEligibleRows.value.map((r) => r.id))
  if (!filterEligibleRows.value.length) {
    ElMessage.info('当前筛选下没有可批改提交')
  }
}

async function selectAllEligibleViaApi() {
  try {
    const res = await getEligibleSubmissions(route.params.taskId, {
      filter: activeFilter.value,
      lateStudentIds: lateStudentIds.value,
    })
    if (res.success && res.data?.submissionIds?.length) {
      addSelectionIds(res.data.submissionIds)
    } else {
      ElMessage.info('当前筛选下没有可批改提交')
    }
  } catch {
    selectAllEligibleInFilter()
  }
}

function onQuickSelect(command) {
  if (command === 'clear') {
    clearSelection()
    return
  }
  if (command === 'page') {
    addSelectionIds(pageEligibleRows.value.map((r) => r.id))
    return
  }
  if (command === 'filter_all') {
    void selectAllEligibleViaApi()
    return
  }
  if (command === 'pending_ai') {
    addSelectionIds(pendingAiEligibleRows.value.map((r) => r.id))
    return
  }
  if (command === 'late') {
    addSelectionIds(lateEligibleRows.value.map((r) => r.id))
  }
}

function isSelected(id) {
  return selectedSubmissionIds.value.has(id)
}

function toggleRowSelection(id, checked) {
  const next = new Set(selectedSubmissionIds.value)
  if (checked) next.add(id)
  else next.delete(id)
  selectedSubmissionIds.value = next
}

function clearSelection() {
  selectedSubmissionIds.value = new Set()
}

watch(
  () => route.params.taskId,
  () => {
    clearSelection()
  }
)

const scopeInfo = computed(() => publishScopeLabel(taskInfo.value))
const deadlineMeta = computed(() => taskDeadlineMeta(taskInfo.value?.deadline))
const kpis = computed(() => buildSubmissionKpis(submissions.value, overview.value, taskInfo.value))

const metricCards = computed(() =>
  KPI_CARDS.map((c) => ({
    ...c,
    value: kpis.value[c.key] ?? '—',
    icon: KPI_ICON_MAP[c.key] || User,
  }))
)

const allRows = computed(() => {
  const rows = mergeAllRows(submissions.value, overview.value, taskInfo.value)
  return rows.map((r) => ({
    ...r,
    selectionKey: r._rowType === 'submitted' ? `s-${r.id}` : `u-${r.student_id}`,
  }))
})
const filteredRows = computed(() => filterDisplayRows(allRows.value, activeFilter.value))

const unsubNamesText = computed(() => namesListText(overview.value?.unsubmitted))
const lateNamesText = computed(() => lateListText(overview.value?.lateSubmitters))

const hasGradingInProgress = computed(() =>
  submissions.value.some((s) => s.status === 'ai_grading')
)

async function loadSubmissions() {
  try {
    const response = await getSubmissionsByTask(route.params.taskId)
    if (response.success) submissions.value = response.data
  } catch (error) {
    console.error('获取提交列表失败:', error)
  } finally {
    loading.value = false
  }
}

async function loadTaskInfo() {
  try {
    const response = await getTaskById(route.params.taskId)
    if (response.success) {
      taskInfo.value = response.data
      taskTitle.value = response.data.title
      taskClassId.value = response.data.class_id
      taskTeachingClassId.value = response.data.teaching_class_id ?? null
      taskCodeRunEnabled.value = Boolean(Number(response.data.code_run_enabled))
    }
  } catch (error) {
    console.error('获取任务信息失败:', error)
  }
}

async function loadOverview() {
  try {
    const res = await getTaskSubmissionOverview(route.params.taskId)
    if (res.success) overview.value = res.data
    else overview.value = null
  } catch {
    overview.value = null
  }
}

async function copyText(text) {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('已复制到剪贴板')
  } catch {
    ElMessage.error('复制失败，请手动选择文本')
  }
}

const dlXlsx = async () => {
  try {
    await downloadScoresExcel(exportAudienceId.value, route.params.taskId, exportOpts.value)
    ElMessage.success('已开始下载')
  } catch (e) {
    ElMessage.error(e?.message || '导出失败')
  }
}

const dlZip = async () => {
  try {
    await downloadSubmissionsZip(exportAudienceId.value, route.params.taskId, exportOpts.value)
    ElMessage.success('已开始下载')
  } catch (e) {
    ElMessage.error(e?.message || '打包失败')
  }
}

const goBack = () => router.push('/teacher/tasks')

const viewGrading = (row) => {
  const id = typeof row === 'object' ? row.id : row
  const className = typeof row === 'object' ? row.class_name : null
  router.push({
    path: `/teacher/grading/${id}`,
    query: className ? { className: String(className) } : {},
  })
}

const openCompare = (submissionId) => {
  router.push(`/teacher/submissions/${route.params.taskId}/similarity/${submissionId}`)
}

const goGradingJobs = () => router.push('/teacher/grading-jobs')

const gradeSubmission = async (submissionId, options = {}) => {
  try {
    const response = await aiGradeSubmission(submissionId, options)
    if (applyGradingJobResponse(response, { submissionId, taskId: route.params.taskId })) {
      await refreshListAndOverview()
    }
  } catch (error) {
    ElMessage.error(gradingJobErrorMessage(error))
    console.error(error)
  }
}

function onPrimaryAction(row) {
  const actions = rowActions(row)
  if (actions.primaryDisabled || actions.primaryAction !== 'grade') return
  const elig = rowEligibility(row)
  if (!elig.eligible) {
    ElMessage.warning(elig.reason || '当前状态不可发起 AI 批改')
    return
  }
  void gradeSubmission(row.id)
}

async function confirmRegrade(row) {
  try {
    await ElMessageBox.confirm(
      '确认重新对该学生提交发起 AI 批改？系统将重新生成 AI 分数与评语，原 AI 结果可能被覆盖。',
      '重新 AI 批改',
      { type: 'warning', confirmButtonText: '确认重新批改', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  await gradeSubmission(row.id, {
    forceRegrade: true,
    regradeReason: 'teacher_manual_regrade',
  })
}

const batchGrade = async (batchMode = 'new_only', submissionIds = null) => {
  try {
    const payload = { batchMode }
    if (submissionIds?.length) payload.submissionIds = submissionIds
    const response = await batchAiGrade(route.params.taskId, payload)
    if (applyGradingJobResponse(response, { taskId: route.params.taskId })) {
      if (response.data?.skippedCount > 0 && response.data?.acceptedCount > 0) {
        ElMessage.info(`已入队 ${response.data.acceptedCount} 条，跳过 ${response.data.skippedCount} 条`)
      }
      clearSelection()
      await refreshListAndOverview()
    }
  } catch (error) {
    ElMessage.error(gradingJobErrorMessage(error))
    console.error(error)
  }
}

async function confirmBatchSelected() {
  const ids = [...selectedSubmissionIds.value]
  if (!ids.length) return
  try {
    await ElMessageBox.confirm(
      `确认对已选择的 ${ids.length} 条学生提交发起 AI 批改？系统将自动跳过已批改、未提交、内容安全异常或代码运行未完成的提交。`,
      '批量 AI 批改',
      { type: 'warning', confirmButtonText: '确认批改', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  await batchGrade('selected', ids)
}

async function batchRetryFailed() {
  const failedCount = submissions.value.filter((s) => s.status === 'ai_failed').length
  if (!failedCount) {
    ElMessage.info('当前没有可重试的失败项')
    return
  }
  try {
    await ElMessageBox.confirm(
      `将重试该任务下 ${failedCount} 条 AI 批改失败的提交。是否继续？`,
      '重试失败项',
      { type: 'warning', confirmButtonText: '继续', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  await batchGrade('retry_failed')
}

async function onMoreBatchCommand(command) {
  if (command === 'regrade_all') {
    try {
      await ElMessageBox.confirm(
        '将重新 AI 批改该任务下所有已提交学生，可能覆盖已有 AI 分数。是否继续？',
        '重批全部',
        { type: 'warning', confirmButtonText: '继续重批', cancelButtonText: '取消' }
      )
    } catch {
      return
    }
    await batchGrade('regrade_all')
  }
}

function handleMore(cmd, row) {
  if (cmd === 'grading') viewGrading(row)
  else if (cmd === 'regrade') void confirmRegrade(row)
  else if (cmd === 'compare') openCompare(row.id)
  else if (cmd === 'history') openSubmissionHistory(row)
}

function openSubmissionHistory(row) {
  historySubmissionId.value = row.id
  void nextTick(() => historyDialogRef.value?.open())
}

function openFeedback(row) {
  if (row.latestFeedbackId) {
    router.push({ path: '/teacher/submission-feedbacks', query: { id: row.latestFeedbackId } })
  } else {
    router.push('/teacher/submission-feedbacks')
  }
}

async function refreshListAndOverview() {
  await loadSubmissions()
  await loadOverview()
}

onMounted(async () => {
  loading.value = true
  await loadTaskInfo()
  await loadSubmissions()
  await loadOverview()
})

useRtOnDomains(['submissions', 'grading', 'tasks', 'similarity', 'grading_job'], (payload) => {
  if (payload?.domain === 'grading_job') {
    const tid = payload.taskId
    if (tid != null && String(tid) !== String(route.params.taskId)) return
    if (!['item_done', 'job_finished', 'job_cancelled'].includes(payload.action)) return
  }
  void refreshListAndOverview()
})
</script>

<style scoped>
.submission-workbench {
  max-width: 1440px;
  margin: 0 auto;
  padding-bottom: 28px;
}

.feedback-tag {
  cursor: pointer;
}

.workbench-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
  padding: 16px 18px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.05);
}

.workbench-head__left {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  flex: 1;
  min-width: 280px;
}

.workbench-eyebrow {
  margin: 0 0 4px;
  font-size: 12px;
  color: #64748b;
  font-weight: 500;
}

.workbench-title {
  margin: 0 0 10px;
  font-size: 22px;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.25;
}

.task-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
  font-size: 13px;
  color: #64748b;
}

.task-meta__item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.async-tip {
  margin-bottom: 14px;
}

.sk-main {
  padding: 12px 0;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}

.metric-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
  cursor: default;
  text-align: left;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.metric-card[onclick],
button.metric-card {
  cursor: pointer;
}

.metric-card--active,
button.metric-card:hover {
  border-color: #93c5fd;
  box-shadow: 0 2px 8px rgba(37, 99, 235, 0.1);
}

.metric-card__icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  flex-shrink: 0;
}

.metric-card__icon--slate { background: #f1f5f9; color: #475569; }
.metric-card__icon--blue { background: #eff6ff; color: #2563eb; }
.metric-card__icon--gray { background: #f8fafc; color: #94a3b8; }
.metric-card__icon--orange { background: #fff7ed; color: #ea580c; }
.metric-card__icon--green { background: #ecfdf5; color: #059669; }
.metric-card__icon--amber { background: #fffbeb; color: #d97706; }
.metric-card__icon--teal { background: #f0fdfa; color: #0d9488; }

.metric-card__value {
  display: block;
  font-size: 22px;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.1;
}

.metric-card__label {
  display: block;
  font-size: 12px;
  color: #64748b;
  margin-top: 2px;
}

.alert-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 14px;
}

.alert-card {
  padding: 14px 16px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
}

.alert-card__head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.alert-card__head h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
}

.alert-card__count {
  font-size: 12px;
  color: #64748b;
}

.alert-card__head .el-button {
  margin-left: auto;
}

.alert-card__body {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: #475569;
  word-break: break-all;
}

.alert-card__hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: #94a3b8;
}

.panel {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 16px 18px;
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.05);
}

.empty-panel {
  padding: 32px 24px;
}

.empty-title {
  margin: 0 0 8px;
  font-size: 16px;
  font-weight: 600;
  color: #334155;
}

.empty-desc {
  margin: 0;
  max-width: 420px;
  font-size: 13px;
  line-height: 1.6;
  color: #64748b;
}

.empty-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
  flex-wrap: wrap;
  margin-top: 8px;
}

.panel__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.panel__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #0f172a;
}

.panel__meta {
  font-size: 12px;
  color: #94a3b8;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-label {
  font-size: 12px;
  color: #64748b;
}

.workbench-head__actions-wrap {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  max-width: 100%;
}

.batch-select-hint {
  margin: 0;
  max-width: 520px;
  font-size: 12px;
  line-height: 1.55;
  color: #94a3b8;
  text-align: right;
}

.workbench-head__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: flex-end;
}

.select-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
  padding: 10px 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
}

.select-toolbar__left {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.select-toolbar__meta {
  font-size: 12px;
  color: #64748b;
}

.batch-bar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
  padding: 10px 14px;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  border-radius: 10px;
}

.batch-bar__main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.batch-bar__text {
  font-size: 13px;
  color: #047857;
  font-weight: 600;
}

.batch-bar__link {
  padding: 0;
  height: auto;
  font-size: 12px;
}

.batch-bar__actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.review-tag--muted {
  color: #94a3b8 !important;
  border-color: transparent !important;
  background: transparent !important;
}

.filter-tabs {
  margin-bottom: 12px;
}

.filter-tabs :deep(.el-tabs__header) {
  margin-bottom: 0;
}

.data-table :deep(.el-table__header th) {
  background: #f8fafc !important;
  color: #64748b;
  font-weight: 600;
}

.data-table :deep(.el-table__row) {
  height: 52px;
}

.student-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.student-cell__name {
  font-weight: 600;
  color: #0f172a;
  font-size: 13px;
}

.student-cell__class {
  font-size: 12px;
  color: #94a3b8;
}

.score-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.score-cell__num {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
}

.final-score {
  font-size: 15px;
  font-weight: 700;
  color: #2563eb;
}

.sim-tag {
  margin-left: 4px;
}

.row-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  flex-wrap: wrap;
}

.muted {
  color: #94a3b8;
  font-size: 12px;
}

.table-empty {
  padding: 24px;
  text-align: center;
  color: #64748b;
  font-size: 13px;
}

@media (max-width: 1200px) {
  .metric-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .workbench-head__actions-wrap {
    align-items: flex-start;
    width: 100%;
  }

  .batch-select-hint {
    text-align: left;
    max-width: none;
  }

  .metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .alert-row {
    grid-template-columns: 1fr;
  }
}
</style>
