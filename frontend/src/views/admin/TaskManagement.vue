<template>
  <div class="tw-page admin-task-monitor">
    <header class="tw-head">
      <div class="tw-head__left">
        <div>
          <h1 class="tw-title">全校任务监管</h1>
          <p class="tw-subtitle">
            监管全校实训任务发布、提交进度、AI 批改、教师复核与企业评价状态。
          </p>
          <p class="tw-sub">管理员在此进行全校任务监管与异常追踪，不替代任课教师完成日常批改。</p>
        </div>
      </div>
      <div class="tw-head__actions">
        <el-tooltip
          content="管理员发布任务主要用于校级统一实训或测试；日常教学任务建议由任课教师在教学班中发布。"
          placement="bottom-end"
        >
          <el-button type="primary" @click="goCreate">
            <el-icon><Plus /></el-icon>
            发布校级任务
          </el-button>
        </el-tooltip>
      </div>
    </header>

    <section class="tw-metric-grid">
        <div v-for="card in overviewCards" :key="card.key" class="tw-metric-card">
          <div class="tw-metric-card__icon" :class="`tw-metric-card__icon--${card.tone}`">
            <el-icon><component :is="card.icon" /></el-icon>
          </div>
          <div class="tw-metric-card__body">
            <span class="tw-metric-card__label">{{ card.label }}</span>
            <span class="tw-metric-card__value">{{ card.value }}</span>
          </div>
        </div>
      </section>

      <section v-if="riskAlerts.length" class="risk-strip">
        <div class="risk-strip__label">
          <el-icon><Warning /></el-icon>
          任务风险提醒
        </div>
        <div class="risk-strip__items">
          <button
            v-for="item in riskAlerts"
            :key="item.key"
            type="button"
            class="risk-chip"
            @click="applyRiskFilter(item.key)"
          >
            <span class="risk-chip__text">{{ item.label }}</span>
            <span class="risk-chip__count">{{ item.count }}</span>
          </button>
        </div>
        <el-button v-if="activeRiskFilter" link type="primary" @click="clearRiskFilter">清除</el-button>
      </section>

      <section class="tw-panel tw-filter-bar">
        <div class="filter-toolbar">
          <el-input
            v-model="keyword"
            placeholder="搜索任务名称 / 创建人 / 课程 / 班级"
            clearable
            class="filter-toolbar__search"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
          <el-select v-model="filterCourseId" clearable filterable placeholder="课程" class="filter-toolbar__select">
            <el-option v-for="c in courseOptions" :key="c.id" :label="c.course_name" :value="c.id" />
          </el-select>
          <el-select v-model="filterLegacyClassId" clearable filterable placeholder="行政班" class="filter-toolbar__select">
            <el-option v-for="c in legacyClassOptions" :key="c.id" :label="c.class_name" :value="c.id" />
          </el-select>
          <el-select
            v-model="filterTeachingClassId"
            clearable
            filterable
            placeholder="教学班"
            class="filter-toolbar__select"
          >
            <el-option v-for="tc in teachingClassOptions" :key="tc.id" :label="tc.class_name" :value="tc.id" />
          </el-select>
          <el-select v-model="filterTaskStatus" placeholder="任务状态" class="filter-toolbar__select">
            <el-option label="全部" value="all" />
            <el-option label="未开始" value="not_started" />
            <el-option label="进行中" value="active" />
            <el-option label="已截止" value="ended" />
          </el-select>
          <el-select v-model="filterPublishType" clearable placeholder="发布类型" class="filter-toolbar__select">
            <el-option label="行政班" value="legacy" />
            <el-option label="教学班" value="teaching" />
            <el-option label="校企" value="enterprise" />
          </el-select>
          <el-button plain @click="showAdvanced = !showAdvanced">
            {{ showAdvanced ? '收起高级筛选' : '高级筛选' }}
            <el-icon class="filter-chevron" :class="{ 'filter-chevron--open': showAdvanced }">
              <ArrowDown />
            </el-icon>
          </el-button>
          <el-button v-if="hasActiveFilters" plain @click="resetFilters">重置</el-button>
          <div class="filter-toolbar__spacer" />
          <span class="toolbar-label">表格密度</span>
          <el-radio-group v-model="mode" size="small">
            <el-radio-button value="default">{{ labelMap.default }}</el-radio-button>
            <el-radio-button value="compact">{{ labelMap.compact }}</el-radio-button>
            <el-radio-button value="comfortable">{{ labelMap.comfortable }}</el-radio-button>
          </el-radio-group>
        </div>

        <div v-show="showAdvanced" class="filter-advanced">
          <el-select v-model="filterAiStatus" clearable placeholder="AI 批改状态" class="filter-toolbar__select">
            <el-option label="未启用" value="disabled" />
            <el-option label="待批改" value="pending" />
            <el-option label="批改中" value="running" />
            <el-option label="已完成" value="done" />
            <el-option label="异常" value="error" />
          </el-select>
          <el-select v-model="filterCodeRun" clearable placeholder="代码运行" class="filter-toolbar__select">
            <el-option label="已启用" value="enabled" />
            <el-option label="未启用" value="disabled" />
          </el-select>
          <el-select v-model="filterEnterprise" clearable placeholder="企业评价" class="filter-toolbar__select">
            <el-option label="已启用" value="enabled" />
            <el-option label="未启用" value="disabled" />
          </el-select>
          <el-select v-model="filterCreator" clearable filterable placeholder="创建人" class="filter-toolbar__select">
            <el-option v-for="name in creatorOptions" :key="name" :label="name" :value="name" />
          </el-select>
          <el-date-picker
            v-model="filterCreatedRange"
            type="daterange"
            range-separator="至"
            start-placeholder="创建开始"
            end-placeholder="创建结束"
            value-format="YYYY-MM-DD"
            class="filter-toolbar__daterange"
          />
          <el-date-picker
            v-model="filterDeadlineRange"
            type="daterange"
            range-separator="至"
            start-placeholder="截止开始"
            end-placeholder="截止结束"
            value-format="YYYY-MM-DD"
            class="filter-toolbar__daterange"
          />
        </div>
      </section>

      <section class="tw-panel">
        <div class="tw-panel__header">
          <h2 class="tw-panel__title">全校任务列表</h2>
          <span class="tw-panel__meta">共 {{ displayTasks.length }} / {{ tasks.length }} 个</span>
        </div>

        <div
          v-if="!loading && !tasks.length"
          class="tw-panel__body tw-empty-panel"
        >
          <el-empty :image-size="96">
            <template #description>
              <h3 class="tw-empty-title">暂无任务数据</h3>
              <p class="tw-empty-desc">
                教师或管理员发布实训任务后，系统将在此汇总展示全校任务进度、提交情况与智能评价状态。
              </p>
            </template>
          </el-empty>
          <div class="empty-actions">
            <el-button type="primary" @click="goCreate">发布校级任务</el-button>
          </div>
        </div>

        <div
          v-else-if="!loading && !displayTasks.length"
          class="tw-panel__body tw-empty-panel"
        >
          <el-empty description="没有符合筛选条件的任务" :image-size="88" />
          <el-button plain @click="resetFilters">清除筛选</el-button>
        </div>

        <div v-else class="tw-panel__body tw-panel__body--flush table-wrap" v-loading="refreshing">
          <el-skeleton v-if="showSkeleton" animated :rows="8" />
          <template v-else>
            <el-table :data="displayTasks" :size="tableSize" class="monitor-table" style="width: 100%">
              <el-table-column label="任务信息" min-width="220" show-overflow-tooltip>
                <template #default="{ row }">
                  <div class="task-info-cell">
                    <span class="task-info-cell__title">{{ row.title }}</span>
                    <span class="task-info-cell__sub">
                      {{ scenarioLabel(row.scenario_type) }} · 满分 {{ row.max_score ?? '—' }} · 创建于
                      {{ formatCreatedDate(row.created_at) }}
                    </span>
                  </div>
                </template>
              </el-table-column>

              <el-table-column label="发布范围" min-width="180" show-overflow-tooltip>
                <template #default="{ row }">
                  <div class="scope-cell">
                    <el-tag size="small" effect="light" :type="publishScopeMeta(row).type || undefined">
                      {{ publishScopeMeta(row).tag }}
                    </el-tag>
                    <span class="scope-cell__name">{{ row.course_name || '—' }}</span>
                    <span class="scope-cell__sub">
                      {{ row.teaching_class_name || row.class_name || '—' }}
                    </span>
                  </div>
                </template>
              </el-table-column>

              <el-table-column label="提交进度" min-width="168">
                <template #default="{ row }">
                  <div class="progress-cell" :class="{ 'progress-cell--warn': isLowSubmitRate(row) }">
                    <el-progress
                      :percentage="progressPercent(row) ?? 0"
                      :stroke-width="8"
                      :show-text="false"
                      :color="isLowSubmitRate(row) ? '#ea580c' : '#2563eb'"
                    />
                    <span class="progress-caption">
                      {{ row.submittedStudentCount ?? 0 }} / {{ row.classStudentCount ?? '—' }} 已提交
                    </span>
                    <span class="progress-pct" :class="{ 'progress-pct--warn': isLowSubmitRate(row) }">
                      {{ progressPercent(row) != null ? `${progressPercent(row)}%` : '—' }}
                    </span>
                  </div>
                </template>
              </el-table-column>

              <el-table-column label="智能评价" min-width="200">
                <template #default="{ row }">
                  <div class="eval-tags">
                    <span class="eval-tags__item">
                      <span class="eval-tags__label">AI</span>
                      <el-tag size="small" effect="light" :type="aiMeta(row).type">
                        {{ aiMeta(row).text }}
                      </el-tag>
                    </span>
                    <span class="eval-tags__item">
                      <span class="eval-tags__label">代码</span>
                      <el-tag size="small" effect="light" :type="codeMeta(row).type">
                        {{ codeMeta(row).text }}
                      </el-tag>
                    </span>
                    <span class="eval-tags__item">
                      <span class="eval-tags__label">企业</span>
                      <el-tag size="small" effect="light" :type="enterpriseMeta(row).type">
                        {{ enterpriseMeta(row).text }}
                      </el-tag>
                    </span>
                  </div>
                </template>
              </el-table-column>

              <el-table-column label="截止状态" width="140">
                <template #default="{ row }">
                  <div class="deadline-cell">
                    <el-tag size="small" effect="light" :type="deadlineMeta(row.deadline).tagType">
                      {{ deadlineMeta(row.deadline).statusText }}
                    </el-tag>
                    <span class="deadline-cell__time">{{ formatDateTime(row.deadline) }}</span>
                  </div>
                </template>
              </el-table-column>

              <el-table-column label="创建人" width="110" show-overflow-tooltip>
                <template #default="{ row }">
                  <div class="creator-cell">
                    <span class="creator-cell__name">{{ row.creator_name || '—' }}</span>
                    <span class="creator-cell__role">教师</span>
                  </div>
                </template>
              </el-table-column>

              <el-table-column label="操作" min-width="280" align="right" fixed="right">
                <template #default="{ row }">
                  <div class="table-row-actions">
                    <el-button type="primary" size="small" plain @click="openDetail(row)">查看详情</el-button>
                    <el-button size="small" plain @click="viewSubmissions(row.id)">查看提交</el-button>
                    <el-dropdown trigger="click" @command="(cmd) => handleMore(cmd, row)">
                      <el-button size="small">
                        更多
                        <el-icon class="el-icon--right"><ArrowDown /></el-icon>
                      </el-button>
                      <template #dropdown>
                        <el-dropdown-menu>
                          <el-dropdown-item command="grading-jobs">查看批改进度</el-dropdown-item>
                          <el-dropdown-item command="export">导出成绩</el-dropdown-item>
                          <el-dropdown-item command="copy">复制任务</el-dropdown-item>
                          <el-dropdown-item command="edit">编辑任务</el-dropdown-item>
                          <el-dropdown-item command="delete" divided>
                            <span class="danger-text">删除任务</span>
                          </el-dropdown-item>
                        </el-dropdown-menu>
                      </template>
                    </el-dropdown>
                  </div>
                </template>
              </el-table-column>
            </el-table>
          </template>
        </div>
      </section>

    <AdminTaskDetailDrawer
      v-model:visible="drawerVisible"
      :task-id="drawerTaskId"
      :task-row="drawerTaskRow"
      @view-submissions="(t) => viewSubmissions(t.id)"
      @export-scores="exportScores"
      @view-grading-jobs="viewGradingJobs"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onActivated } from 'vue'
import { useRouter } from 'vue-router'
import {
  Plus,
  Search,
  ArrowDown,
  Warning,
  List,
  Clock,
  EditPen,
  View,
  Cpu,
  Timer,
} from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getAllTasks, getTaskById, deleteTask as apiDeleteTask } from '../../api/task'
import { getSubmissionsByTask } from '../../api/submission'
import { listCourses } from '../../api/course'
import { listTeachingClasses } from '../../api/teachingClass'
import { getAllClasses } from '../../api/class'
import { downloadScoresExcel } from '../../api/export'
import { useTableDensity } from '../../composables/useTableDensity'
import { formatDateTime } from '../../utils/format'
import { useRtOnDomains } from '../../composables/useRtOnDomains'
import { usePageCacheStore } from '../../stores/pageCache'
import { useDelayedSkeleton } from '../../utils/useDelayedLoading'
import AdminTaskDetailDrawer from '../../components/admin/AdminTaskDetailDrawer.vue'
import {
  scenarioLabel,
  formatCreatedDate,
  adminDeadlineMeta as deadlineMeta,
  publishScopeMeta,
  progressPercent,
  isLowSubmitRate,
  taskAiGradingMeta,
  taskCodeRunMeta,
  taskEnterpriseMeta,
  taskHasPendingGrade,
  taskHasPendingReview,
  computeRiskAlerts,
  isEnterpriseEvalEnabled,
  taskHasLongPendingReview,
} from '../../utils/adminTaskMonitor'

const router = useRouter()
const { mode, tableSize, labelMap } = useTableDensity()
const pageCache = usePageCacheStore()
const PAGE_CACHE_KEY = 'admin:task-management'

const cached = pageCache.get(PAGE_CACHE_KEY)
const tasks = ref(cached?.tasks ?? [])
const loading = ref(!tasks.value.length)
const refreshing = ref(false)
const showSkeleton = useDelayedSkeleton(computed(() => loading.value && !tasks.value.length))
const enriching = ref(false)
const taskDetailMap = ref(cached?.taskDetailMap ?? {})
const submissionMap = ref(cached?.submissionMap ?? {})

const courseOptions = ref([])
const teachingClassOptions = ref([])
const legacyClassOptions = ref([])

const keyword = ref('')
const filterCourseId = ref(null)
const filterLegacyClassId = ref(null)
const filterTeachingClassId = ref(null)
const filterTaskStatus = ref('all')
const filterPublishType = ref('')
const filterAiStatus = ref('')
const filterCodeRun = ref('')
const filterEnterprise = ref('')
const filterCreator = ref('')
const filterCreatedRange = ref(null)
const filterDeadlineRange = ref(null)
const showAdvanced = ref(false)
const activeRiskFilter = ref('')

const drawerVisible = ref(false)
const drawerTaskId = ref(null)
const drawerTaskRow = ref(null)

const creatorOptions = computed(() => {
  const set = new Set(tasks.value.map((t) => t.creator_name).filter(Boolean))
  return [...set].sort()
})

const riskAlerts = computed(() =>
  computeRiskAlerts(tasks.value, submissionMap.value, taskDetailMap.value)
)

const overviewCards = computed(() => {
  const enriched = !enriching.value || Object.keys(submissionMap.value).length > 0
  const pendingAi = enriched
    ? tasks.value.filter((t) => taskHasPendingGrade(t, submissionMap.value[t.id], taskDetailMap.value[t.id])).length
    : '--'
  const pendingReview = enriched
    ? tasks.value.filter((t) => taskHasPendingReview(submissionMap.value[t.id])).length
    : '--'
  const codeRunEnabled = tasks.value.filter((t) => taskDetailMap.value[t.id]?.code_run_enabled).length

  return [
    { key: 'all', label: '全部任务', value: tasks.value.length, icon: List, tone: 'slate' },
    {
      key: 'active',
      label: '进行中',
      value: tasks.value.filter((t) => {
        const s = deadlineMeta(t.deadline).statusText
        return s === '进行中' || s === '临近截止'
      }).length,
      icon: Clock,
      tone: 'blue',
    },
    {
      key: 'ended',
      label: '已截止',
      value: tasks.value.filter((t) => deadlineMeta(t.deadline).statusText === '已截止').length,
      icon: Timer,
      tone: 'orange',
    },
    { key: 'pending_ai', label: '待 AI 批改', value: pendingAi, icon: EditPen, tone: 'indigo' },
    { key: 'pending_review', label: '待教师复核', value: pendingReview, icon: View, tone: 'violet' },
    { key: 'code_run', label: '启用代码运行', value: codeRunEnabled, icon: Cpu, tone: 'teal' },
  ]
})

const hasActiveFilters = computed(
  () =>
    !!keyword.value.trim() ||
    filterCourseId.value ||
    filterLegacyClassId.value ||
    filterTeachingClassId.value ||
    filterTaskStatus.value !== 'all' ||
    filterPublishType.value ||
    filterAiStatus.value ||
    filterCodeRun.value ||
    filterEnterprise.value ||
    filterCreator.value ||
    filterCreatedRange.value?.length ||
    filterDeadlineRange.value?.length ||
    activeRiskFilter.value
)

function subsFor(taskId) {
  return submissionMap.value[taskId] || []
}

function detailFor(taskId) {
  return taskDetailMap.value[taskId]
}

function aiMeta(row) {
  return taskAiGradingMeta(row, subsFor(row.id), detailFor(row.id))
}

function codeMeta(row) {
  return taskCodeRunMeta(row, detailFor(row.id), subsFor(row.id))
}

function enterpriseMeta(row) {
  return taskEnterpriseMeta(row, detailFor(row.id))
}

function inDateRange(value, range) {
  if (!range?.length) return true
  if (!value) return false
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return false
  const start = new Date(`${range[0]}T00:00:00`)
  const end = new Date(`${range[1]}T23:59:59`)
  return d >= start && d <= end
}

function matchesAiFilter(row) {
  if (!filterAiStatus.value) return true
  const text = aiMeta(row).text
  const map = {
    disabled: '未启用',
    pending: '待批改',
    running: '批改中',
    done: '已完成',
    error: '异常',
  }
  return text === map[filterAiStatus.value]
}

function matchesRiskFilter(row) {
  if (!activeRiskFilter.value) return true
  const key = activeRiskFilter.value
  if (key === 'near_deadline') return deadlineMeta(row.deadline).statusText === '临近截止'
  if (key === 'low_submit') return isLowSubmitRate(row)
  if (key === 'ai_failed') return subsFor(row.id).some((r) => r.status === 'ai_failed')
  if (key === 'code_run_failed') {
    if (!detailFor(row.id)?.code_run_enabled) return false
    return subsFor(row.id).some((s) => {
      const summary = String(s.code_run_summary || '').toLowerCase()
      return summary.includes('失败') || summary.includes('fail') || summary.includes('未通过')
    })
  }
  if (key === 'long_review') return taskHasLongPendingReview(subsFor(row.id))
  if (key === 'submit_insufficient') {
    if (deadlineMeta(row.deadline).statusText !== '已截止') return false
    const total = Number(row.classStudentCount) || 0
    const sub = Number(row.submittedStudentCount) || 0
    return total > 0 && sub < total
  }
  return true
}

const displayTasks = computed(() => {
  let list = tasks.value
  const q = keyword.value.trim().toLowerCase()
  if (q) {
    list = list.filter((t) => {
      const hay = [
        t.title,
        t.creator_name,
        t.course_name,
        t.class_name,
        t.teaching_class_name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }

  if (filterCourseId.value) {
    list = list.filter((t) => Number(t.course_id) === Number(filterCourseId.value))
  }
  if (filterLegacyClassId.value) {
    list = list.filter((t) => Number(t.class_id) === Number(filterLegacyClassId.value))
  }
  if (filterTeachingClassId.value) {
    list = list.filter((t) => Number(t.teaching_class_id) === Number(filterTeachingClassId.value))
  }
  if (filterPublishType.value === 'legacy') list = list.filter((t) => !t.teaching_class_id)
  if (filterPublishType.value === 'teaching') list = list.filter((t) => t.teaching_class_id)
  if (filterPublishType.value === 'enterprise') {
    list = list.filter((t) => t.scenario_type === 'enterprise_collab')
  }

  if (filterTaskStatus.value === 'not_started') {
    list = list.filter((t) => deadlineMeta(t.deadline).statusText === '未开始')
  } else if (filterTaskStatus.value === 'active') {
    list = list.filter((t) => {
      const s = deadlineMeta(t.deadline).statusText
      return s === '进行中' || s === '临近截止'
    })
  } else if (filterTaskStatus.value === 'ended') {
    list = list.filter((t) => deadlineMeta(t.deadline).statusText === '已截止')
  }

  if (filterCodeRun.value === 'enabled') {
    list = list.filter((t) => detailFor(t.id)?.code_run_enabled)
  } else if (filterCodeRun.value === 'disabled') {
    list = list.filter((t) => !detailFor(t.id)?.code_run_enabled)
  }

  if (filterEnterprise.value === 'enabled') {
    list = list.filter((t) => isEnterpriseEvalEnabled(t, detailFor(t.id)))
  } else if (filterEnterprise.value === 'disabled') {
    list = list.filter((t) => !isEnterpriseEvalEnabled(t, detailFor(t.id)))
  }

  if (filterCreator.value) {
    list = list.filter((t) => t.creator_name === filterCreator.value)
  }

  list = list.filter((t) => inDateRange(t.created_at, filterCreatedRange.value))
  list = list.filter((t) => inDateRange(t.deadline, filterDeadlineRange.value))
  list = list.filter(matchesAiFilter)
  list = list.filter(matchesRiskFilter)

  return list
})

function resetFilters() {
  keyword.value = ''
  filterCourseId.value = null
  filterLegacyClassId.value = null
  filterTeachingClassId.value = null
  filterTaskStatus.value = 'all'
  filterPublishType.value = ''
  filterAiStatus.value = ''
  filterCodeRun.value = ''
  filterEnterprise.value = ''
  filterCreator.value = ''
  filterCreatedRange.value = null
  filterDeadlineRange.value = null
  activeRiskFilter.value = ''
}

function applyRiskFilter(key) {
  activeRiskFilter.value = key
}

function clearRiskFilter() {
  activeRiskFilter.value = ''
}

async function enrichTaskDetails(taskList) {
  const entries = await Promise.all(
    taskList.map(async (t) => {
      try {
        const res = await getTaskById(t.id)
        return [t.id, res.success ? res.data : null]
      } catch {
        return [t.id, null]
      }
    })
  )
  const map = {}
  for (const [id, data] of entries) {
    if (data) map[id] = data
  }
  taskDetailMap.value = map
}

async function enrichSubmissionMeta(taskList) {
  const withSubs = taskList.filter((t) => Number(t.submissionCount) > 0)
  const entries = await Promise.all(
    withSubs.map(async (t) => {
      try {
        const res = await getSubmissionsByTask(t.id)
        return [t.id, res.success ? res.data || [] : []]
      } catch {
        return [t.id, []]
      }
    })
  )
  const map = {}
  for (const [id, rows] of entries) {
    map[id] = rows
  }
  submissionMap.value = map
}

const loadTasks = async ({ background = false } = {}) => {
  const hasTasks = tasks.value.length > 0
  if (background && hasTasks) refreshing.value = true
  else if (!hasTasks) loading.value = true
  else refreshing.value = true
  enriching.value = true
  try {
    const response = await getAllTasks()
    if (response.success) {
      const list = response.data || []
      tasks.value = list
      loading.value = false
      if (list.length) {
        await enrichTaskDetails(list)
        await enrichSubmissionMeta(list)
      } else {
        taskDetailMap.value = {}
        submissionMap.value = {}
      }
      pageCache.set(PAGE_CACHE_KEY, {
        tasks: tasks.value,
        taskDetailMap: taskDetailMap.value,
        submissionMap: submissionMap.value,
      })
    }
  } catch (error) {
    console.error('获取任务列表失败:', error)
  } finally {
    loading.value = false
    refreshing.value = false
    enriching.value = false
  }
}

async function loadFilterOptions() {
  const [coursesRes, tcRes, classesRes] = await Promise.all([
    listCourses(),
    listTeachingClasses(),
    getAllClasses(),
  ])
  if (coursesRes.success) courseOptions.value = coursesRes.data || []
  if (tcRes.success) teachingClassOptions.value = tcRes.data || []
  if (classesRes.success) legacyClassOptions.value = classesRes.data || []
}

const goCreate = () => {
  router.push('/admin/tasks/create')
}

const openDetail = (row) => {
  drawerTaskId.value = row.id
  drawerTaskRow.value = row
  drawerVisible.value = true
}

const viewSubmissions = (taskId) => {
  router.push(`/admin/submissions/${taskId}`)
}

const goEdit = (id) => {
  router.push(`/admin/tasks/${id}/edit`)
}

const copyTask = (row) => {
  router.push({ path: '/admin/tasks/create', query: { copyFrom: String(row.id) } })
}

const viewGradingJobs = (row) => {
  router.push({
    path: '/admin/grading-jobs',
    query: { keyword: row.title || String(row.id) },
  })
}

async function exportScores(row) {
  const audienceId = row.teaching_class_id || row.class_id
  if (!audienceId) {
    ElMessage.warning('该任务缺少班级信息，无法导出')
    return
  }
  try {
    await downloadScoresExcel(audienceId, row.id, {
      scope: row.teaching_class_id ? 'teaching' : 'legacy',
      teachingClassId: row.teaching_class_id,
    })
    ElMessage.success('导出成功')
  } catch (e) {
    ElMessage.error(e?.message || '导出失败')
  }
}

const deleteTask = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确定删除任务「${row.title}」？删除后不可恢复。`,
      '删除任务',
      {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        confirmButtonClass: 'el-button--danger',
      }
    )
    await apiDeleteTask(row.id)
    ElMessage.success('删除成功')
    loadTasks()
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(error?.response?.data?.message || '删除失败')
  }
}

const handleMore = (cmd, row) => {
  if (cmd === 'grading-jobs') viewGradingJobs(row)
  else if (cmd === 'export') exportScores(row)
  else if (cmd === 'copy') copyTask(row)
  else if (cmd === 'edit') goEdit(row.id)
  else if (cmd === 'delete') deleteTask(row)
}

onMounted(async () => {
  await Promise.all([
    loadTasks({ background: pageCache.has(PAGE_CACHE_KEY) }),
    loadFilterOptions(),
  ])
})

onActivated(() => {
  loadTasks({ background: true })
})

useRtOnDomains(['tasks', 'task_templates', 'submissions', 'grading'], () => {
  loadTasks({ background: true })
})
</script>

<style scoped>
.admin-task-monitor {
  max-width: 1400px;
}

.risk-strip {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  margin-bottom: 20px;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 12px;
}

.risk-strip__label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #b45309;
  flex-shrink: 0;
}

.risk-strip__items {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  flex: 1;
}

.risk-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: #fff;
  border: 1px solid #fcd34d;
  border-radius: 999px;
  cursor: pointer;
  font-size: 12px;
  color: #92400e;
  transition: background 0.15s ease;
}

.risk-chip:hover {
  background: #fef3c7;
}

.risk-chip__count {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.tw-filter-bar {
  padding: 16px 18px;
}

.filter-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.filter-toolbar__search {
  width: min(100%, 280px);
}

.filter-toolbar__select {
  width: 140px;
}

.filter-toolbar__daterange {
  width: 260px;
}

.filter-toolbar__spacer {
  flex: 1;
  min-width: 8px;
}

.filter-advanced {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #eef2f7;
}

.filter-chevron {
  margin-left: 4px;
  transition: transform 0.2s ease;
}

.filter-chevron--open {
  transform: rotate(180deg);
}

.toolbar-label {
  font-size: 12px;
  color: #64748b;
}

.task-info-cell__title {
  display: block;
  font-weight: 600;
  color: #0f172a;
  line-height: 1.4;
}

.task-info-cell__sub {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: #64748b;
}

.scope-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
}

.scope-cell__name {
  font-size: 13px;
  color: #334155;
}

.scope-cell__sub {
  font-size: 12px;
  color: #94a3b8;
}

.progress-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.progress-caption,
.progress-pct {
  font-size: 12px;
  color: #64748b;
}

.progress-pct--warn,
.progress-cell--warn .progress-caption {
  color: #c2410c;
}

.eval-tags {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.eval-tags__item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.eval-tags__label {
  width: 28px;
  font-size: 11px;
  color: #94a3b8;
  flex-shrink: 0;
}

.deadline-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
}

.deadline-cell__time {
  font-size: 11px;
  color: #94a3b8;
  line-height: 1.3;
}

.creator-cell__name {
  display: block;
  font-size: 13px;
  color: #334155;
}

.creator-cell__role {
  display: block;
  font-size: 11px;
  color: #94a3b8;
}

.danger-text {
  color: #dc2626;
}

.empty-actions {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-top: 8px;
}

.monitor-table :deep(.el-table__row) {
  --el-table-row-hover-bg-color: #f8fafc;
}
</style>
