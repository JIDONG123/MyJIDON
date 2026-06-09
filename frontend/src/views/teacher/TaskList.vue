<template>
  <div class="task-workbench">
    <header class="workbench-head">
      <div class="workbench-head__main">
        <h1 class="workbench-title">实训任务管理</h1>
        <p class="workbench-subtitle">
          管理本人发布的实训任务、提交进度、AI 批改与成绩报告
        </p>
      </div>
      <div class="workbench-head__actions">
        <el-button type="primary" @click="goCreateTask">
          <el-icon><Plus /></el-icon>
          发布任务
        </el-button>
      </div>
    </header>

    <el-alert
      v-if="filterClassId"
      class="filter-banner"
      type="info"
      show-icon
      :closable="false"
    >
      <template #title>
        当前仅显示所选班级的任务（班级 ID {{ filterClassId }}）
        <el-button type="primary" link @click="clearClassFilter">查看全部任务</el-button>
      </template>
    </el-alert>

    <el-skeleton v-if="showSkeleton" animated :rows="10" class="workbench-skeleton" />

    <div v-else v-loading="refreshing">
      <section class="metric-grid">
        <button
          v-for="card in metricCards"
          :key="card.key"
          type="button"
          class="metric-card"
          :class="{ 'metric-card--active': activeMetric === card.key }"
          @click="applyMetricFilter(card.key)"
        >
          <div class="metric-card__icon" :class="`metric-card__icon--${card.tone}`">
            <el-icon><component :is="card.icon" /></el-icon>
          </div>
          <div class="metric-card__body">
            <span class="metric-card__value">{{ card.value }}</span>
            <span class="metric-card__label">{{ card.label }}</span>
            <span v-if="card.hint" class="metric-card__hint">{{ card.hint }}</span>
          </div>
        </button>
      </section>

      <div class="panel">
        <div class="panel__header panel__header--filters">
          <div>
            <h2 class="panel__title">任务列表</h2>
            <span class="panel__meta">共 {{ displayedTasks.length }} 个 · 筛选后展示</span>
          </div>
          <div class="filter-bar">
            <el-input
              v-model="searchText"
              clearable
              placeholder="搜索任务名称"
              class="filter-input"
            >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
            </el-input>
            <el-select v-model="filterPublishType" clearable placeholder="发布类型" class="filter-select">
              <el-option label="行政班" value="legacy" />
              <el-option label="教学班" value="teaching" />
            </el-select>
            <el-select
              v-model="filterLegacyClassId"
              clearable
              filterable
              placeholder="行政班"
              class="filter-select"
            >
              <el-option
                v-for="c in legacyClassOptions"
                :key="c.id"
                :label="c.class_name"
                :value="c.id"
              />
            </el-select>
            <el-select
              v-model="filterTeachingClassId"
              clearable
              filterable
              placeholder="教学班"
              class="filter-select"
            >
              <el-option
                v-for="tc in teachingClassOptions"
                :key="tc.id"
                :label="tc.class_name"
                :value="tc.id"
              />
            </el-select>
            <el-select v-model="filterStatus" placeholder="任务状态" class="filter-select">
              <el-option label="全部" value="all" />
              <el-option label="进行中" value="active" />
              <el-option label="已截止" value="ended" />
              <el-option label="待批改" value="pending_grade" />
              <el-option label="待复核" value="pending_review" />
              <el-option label="已完成" value="completed" />
            </el-select>
            <el-select v-model="filterCodeRun" clearable placeholder="代码运行" class="filter-select">
              <el-option label="已启用" value="enabled" />
              <el-option label="未启用" value="disabled" />
            </el-select>
            <span class="toolbar-label">表格密度</span>
            <el-radio-group v-model="mode" size="small">
              <el-radio-button value="default">{{ labelMap.default }}</el-radio-button>
              <el-radio-button value="compact">{{ labelMap.compact }}</el-radio-button>
              <el-radio-button value="comfortable">{{ labelMap.comfortable }}</el-radio-button>
            </el-radio-group>
          </div>
        </div>

        <el-empty
          v-if="!displayedTasks.length"
          description="暂无实训任务"
          :image-size="100"
          class="panel-empty"
        >
          <el-button type="primary" @click="goCreateTask">发布第一个任务</el-button>
        </el-empty>

        <div v-else class="table-wrap">
          <el-table
            :data="displayedTasks"
            :size="tableSize"
            stripe
            class="workbench-table"
          >
            <el-table-column label="任务名称" min-width="200" show-overflow-tooltip>
              <template #default="{ row }">
                <div class="task-name-cell">
                  <span class="cell-strong">{{ row.title }}</span>
                  <span class="task-name-sub">
                    创建 {{ formatDateTime(row.created_at) }} · 满分 {{ row.max_score ?? 100 }}
                  </span>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="发布范围" min-width="140" show-overflow-tooltip>
              <template #default="{ row }">
                <div class="scope-cell">
                  <el-tag v-if="row.teaching_class_id" size="small" type="primary" effect="light">教学班</el-tag>
                  <el-tag v-else size="small" effect="light">行政班</el-tag>
                  <span class="scope-name">{{ row.teaching_class_name || row.class_name || '—' }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="任务类型" width="96" align="center">
              <template #default="{ row }">
                <el-tag size="small" type="info" effect="light">{{ scenarioLabel(row.scenario_type) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="提交进度" min-width="168">
              <template #default="{ row }">
                <div class="progress-cell">
                  <el-progress
                    :percentage="progressPercent(row)"
                    :stroke-width="8"
                    :show-text="false"
                    color="#1677ff"
                  />
                  <span class="progress-caption">
                    {{ row.submittedStudentCount ?? 0 }} / {{ row.classStudentCount ?? '—' }} 已提交
                  </span>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="AI 批改" width="108" align="center">
              <template #default="{ row }">
                <el-tag :type="taskAiGradingMeta(row.id).type" size="small" effect="light">
                  {{ taskAiGradingMeta(row.id).text }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="代码运行" width="100" align="center">
              <template #default="{ row }">
                <el-tag :type="taskCodeRunMeta(row).type" size="small" effect="light">
                  {{ taskCodeRunMeta(row).text }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="截止状态" width="108" align="center">
              <template #default="{ row }">
                <el-tag :type="deadlineMeta(row.deadline).tagType" size="small" effect="light">
                  {{ deadlineMeta(row.deadline).statusText }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="168" align="right" fixed="right">
              <template #default="{ row }">
                <div class="table-row-actions">
                  <el-button type="primary" size="small" plain :icon="Document" @click="viewSubmissions(row.id)">
                    查看提交
                  </el-button>
                  <el-dropdown trigger="click" @command="(cmd) => handleMore(cmd, row)">
                    <el-button size="small">
                      更多
                      <el-icon class="el-icon--right"><ArrowDown /></el-icon>
                    </el-button>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item command="edit" :icon="Edit">编辑</el-dropdown-item>
                        <el-dropdown-item command="report" :icon="DataAnalysis">查看报告</el-dropdown-item>
                        <el-dropdown-item command="copy" :icon="CopyDocument">复制任务</el-dropdown-item>
                        <el-dropdown-item command="delete" divided :icon="Delete">
                          <span class="danger-text">删除</span>
                        </el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </div>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onActivated } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  Plus,
  Search,
  Document,
  Edit,
  Delete,
  CopyDocument,
  DataAnalysis,
  ArrowDown,
  List,
  Clock,
  EditPen,
  View,
  Cpu,
} from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getAllTasks, deleteTask as apiDeleteTask, getTaskById } from '../../api/task'
import { getTeacherGradingWorkbench, getSubmissionsByTask } from '../../api/submission'
import { getMyTeachingOverview } from '../../api/class'
import { listMyTeachingClasses } from '../../api/teachingClass'
import { useTableDensity } from '../../composables/useTableDensity'
import { formatDateTime } from '../../utils/format'
import { useRtOnDomains } from '../../composables/useRtOnDomains'
import { usePageCacheStore } from '../../stores/pageCache'
import { useDelayedSkeleton } from '../../utils/useDelayedLoading'

const router = useRouter()
const route = useRoute()
const { mode, tableSize, labelMap } = useTableDensity()
const pageCache = usePageCacheStore()
const PAGE_CACHE_KEY = 'teacher:tasks'

const cached = pageCache.get(PAGE_CACHE_KEY)
const tasks = ref(cached?.tasks ?? [])
const loading = ref(!tasks.value.length)
const refreshing = ref(false)
const showSkeleton = useDelayedSkeleton(computed(() => loading.value && !tasks.value.length))
const workbenchRows = ref(cached?.workbenchRows ?? [])
const taskDetailMap = ref(cached?.taskDetailMap ?? {})
const codeRunMetaMap = ref(cached?.codeRunMetaMap ?? {})
const teachingClassOptions = ref([])
const legacyClassOptions = ref([])

const searchText = ref('')
const filterPublishType = ref('')
const filterLegacyClassId = ref(null)
const filterTeachingClassId = ref(null)
const filterStatus = ref('all')
const filterCodeRun = ref('')
const activeMetric = ref('all')

const DEADLINE_SOON_MS = 72 * 60 * 60 * 1000

const filterClassId = computed(() => route.query.classId || '')

const metricCards = computed(() => [
  {
    key: 'all',
    label: '全部任务',
    value: tasks.value.length,
    icon: List,
    tone: 'slate',
  },
  {
    key: 'active',
    label: '进行中',
    value: tasks.value.filter((t) => deadlineMeta(t.deadline).statusText !== '已截止').length,
    icon: Clock,
    tone: 'blue',
  },
  {
    key: 'ended',
    label: '已截止',
    value: tasks.value.filter((t) => deadlineMeta(t.deadline).statusText === '已截止').length,
    icon: View,
    tone: 'orange',
  },
  {
    key: 'pending_grade',
    label: '待批改',
    value: tasks.value.filter((t) => taskHasPendingGrade(t.id)).length,
    hint: '含待 AI 批改',
    icon: EditPen,
    tone: 'amber',
  },
  {
    key: 'pending_review',
    label: '待复核',
    value: tasks.value.filter((t) => taskHasPendingReview(t.id)).length,
    icon: EditPen,
    tone: 'orange',
  },
  {
    key: 'code_run',
    label: '启用代码运行',
    value: tasks.value.filter((t) => taskDetailMap.value[t.id]?.code_run_enabled).length,
    icon: Cpu,
    tone: 'green',
  },
])

const displayedTasks = computed(() => {
  let list = tasks.value

  if (filterPublishType.value === 'legacy') list = list.filter((t) => !t.teaching_class_id)
  if (filterPublishType.value === 'teaching') list = list.filter((t) => t.teaching_class_id)

  const cid = filterClassId.value || filterLegacyClassId.value
  if (cid) list = list.filter((t) => String(t.class_id) === String(cid))

  const tcid = route.query.teachingClassId || filterTeachingClassId.value
  if (tcid) list = list.filter((t) => String(t.teaching_class_id) === String(tcid))

  const q = searchText.value.trim().toLowerCase()
  if (q) list = list.filter((t) => (t.title || '').toLowerCase().includes(q))

  if (filterStatus.value === 'active') {
    list = list.filter((t) => deadlineMeta(t.deadline).statusText !== '已截止')
  } else if (filterStatus.value === 'ended') {
    list = list.filter((t) => deadlineMeta(t.deadline).statusText === '已截止')
  } else if (filterStatus.value === 'pending_grade') {
    list = list.filter((t) => taskHasPendingGrade(t.id))
  } else if (filterStatus.value === 'pending_review') {
    list = list.filter((t) => taskHasPendingReview(t.id))
  } else if (filterStatus.value === 'completed') {
    list = list.filter((t) => isTaskCompleted(t))
  }

  if (filterCodeRun.value === 'enabled') {
    list = list.filter((t) => taskDetailMap.value[t.id]?.code_run_enabled)
  } else if (filterCodeRun.value === 'disabled') {
    list = list.filter((t) => !taskDetailMap.value[t.id]?.code_run_enabled)
  }

  return list
})

watch(filterStatus, (val) => {
  const map = {
    all: 'all',
    active: 'active',
    ended: 'ended',
    pending_grade: 'pending_grade',
    pending_review: 'pending_review',
    completed: 'all',
  }
  if (map[val] && val !== 'completed') activeMetric.value = map[val]
})

function applyMetricFilter(key) {
  activeMetric.value = key
  if (key === 'all') {
    filterStatus.value = 'all'
    filterCodeRun.value = ''
    return
  }
  if (key === 'code_run') {
    filterCodeRun.value = 'enabled'
    filterStatus.value = 'all'
    return
  }
  filterCodeRun.value = ''
  filterStatus.value = key
}

function scenarioLabel(type) {
  const m = { teaching: '教学', enterprise_collab: '校企', mixed: '综合' }
  return m[type] || '综合'
}

function progressPercent(row) {
  const total = Number(row.classStudentCount)
  const sub = Number(row.submittedStudentCount ?? 0)
  if (!Number.isFinite(total) || total <= 0) return 0
  return Math.min(100, Math.round((sub / total) * 100))
}

function deadlineMeta(deadline) {
  if (!deadline) return { statusText: '未设置', tagType: 'info' }
  const d = new Date(deadline)
  if (Number.isNaN(d.getTime())) return { statusText: '—', tagType: 'info' }
  const diff = d.getTime() - Date.now()
  if (diff <= 0) return { statusText: '已截止', tagType: 'danger' }
  if (diff <= DEADLINE_SOON_MS) return { statusText: '即将截止', tagType: 'warning' }
  return { statusText: '进行中', tagType: 'primary' }
}

function rowsForTask(taskId) {
  return workbenchRows.value.filter((r) => Number(r.task_id) === Number(taskId))
}

function taskHasPendingGrade(taskId) {
  return rowsForTask(taskId).some(
    (r) =>
      r.grading_status == null ||
      r.grading_status === '' ||
      r.grading_status === 'pending' ||
      r.grading_status === 'ai_failed'
  )
}

function taskHasPendingReview(taskId) {
  return rowsForTask(taskId).some((r) => r.grading_status === 'ai_graded')
}

function isTaskCompleted(task) {
  const total = Number(task.classStudentCount) || 0
  const sub = Number(task.submittedStudentCount) || 0
  if (total > 0 && sub < total) return false
  const rows = rowsForTask(task.id)
  if (!rows.length) return total > 0 && sub >= total
  return rows.every((r) =>
    ['human_graded', 'human_reviewed', 'completed'].includes(r.grading_status)
  )
}

function taskAiGradingMeta(taskId) {
  const rows = rowsForTask(taskId)
  if (!rows.length) return { text: '未开始', type: 'info' }
  const review = rows.filter((r) => r.grading_status === 'ai_graded').length
  const pending = rows.filter(
    (r) =>
      r.grading_status == null ||
      r.grading_status === '' ||
      r.grading_status === 'pending' ||
      r.grading_status === 'ai_failed'
  ).length
  const done = rows.filter((r) =>
    ['human_graded', 'human_reviewed', 'completed'].includes(r.grading_status)
  ).length
  if (review > 0) return { text: '待复核', type: 'warning' }
  if (pending > 0) return { text: '待批改', type: 'warning' }
  if (done === rows.length) return { text: '已完成', type: 'success' }
  return { text: '批改中', type: 'primary' }
}

function taskCodeRunMeta(row) {
  const detail = taskDetailMap.value[row.id]
  if (!detail?.code_run_enabled) return { text: '未启用', type: 'info' }
  const meta = codeRunMetaMap.value[row.id]
  if (meta?.hasFail) return { text: '有失败', type: 'danger' }
  const subs = Number(row.submissionCount) || 0
  if (subs <= 0) return { text: '已启用', type: 'primary' }
  if (meta?.allPassed) return { text: '已完成', type: 'success' }
  return { text: '已启用', type: 'primary' }
}

const goCreateTask = () => {
  const cid = filterClassId.value
  if (cid) {
    router.push({ path: '/teacher/tasks/create', query: { classId: String(cid) } })
  } else {
    router.push('/teacher/tasks/create')
  }
}

const clearClassFilter = () => {
  router.replace({ path: '/teacher/tasks', query: {} })
}

const editTask = (id) => {
  router.push(`/teacher/tasks/${id}/edit`)
}

const viewSubmissions = (id) => {
  router.push(`/teacher/submissions/${id}`)
}

const viewReport = (row) => {
  const query = {}
  if (row.class_id) query.classId = String(row.class_id)
  if (row.teaching_class_id) query.teachingClassId = String(row.teaching_class_id)
  router.push({ path: '/teacher/statistics', query })
}

const copyTask = (row) => {
  router.push({ path: '/teacher/tasks/create', query: { copyFrom: String(row.id) } })
}

const handleMore = (cmd, row) => {
  if (cmd === 'edit') editTask(row.id)
  else if (cmd === 'report') viewReport(row)
  else if (cmd === 'copy') copyTask(row)
  else if (cmd === 'delete') deleteTask(row)
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

function isCodeRunFailure(summary) {
  const s = String(summary || '').toLowerCase()
  return (
    s.includes('失败') ||
    s.includes('fail') ||
    s.includes('error') ||
    s.includes('未通过') ||
    s.includes('运行错误')
  )
}

async function enrichCodeRunMeta(taskList) {
  const enabledIds = taskList
    .filter((t) => taskDetailMap.value[t.id]?.code_run_enabled)
    .map((t) => t.id)
  const map = {}
  await Promise.all(
    enabledIds.map(async (id) => {
      try {
        const res = await getSubmissionsByTask(id)
        if (!res.success) return
        const subs = res.data || []
        let hasFail = false
        let allPassed = subs.length > 0
        for (const s of subs) {
          if (isCodeRunFailure(s.code_run_summary)) {
            hasFail = true
            allPassed = false
          }
        }
        map[id] = { hasFail, allPassed: allPassed && !hasFail && subs.length > 0 }
      } catch {
        /* ignore */
      }
    })
  )
  codeRunMetaMap.value = map
}

const loadTasks = async ({ background = false } = {}) => {
  const hasTasks = tasks.value.length > 0
  if (background && hasTasks) refreshing.value = true
  else if (!hasTasks) loading.value = true
  else refreshing.value = true
  try {
    const [tasksRes, wbRes] = await Promise.all([
      getAllTasks(),
      getTeacherGradingWorkbench({ status: 'all' }),
    ])
    if (tasksRes.success) {
      const list = tasksRes.data || []
      tasks.value = list
      loading.value = false
      if (list.length) {
        await enrichTaskDetails(list)
        await enrichCodeRunMeta(list)
      } else {
        taskDetailMap.value = {}
        codeRunMetaMap.value = {}
      }
    }
    if (wbRes.success) workbenchRows.value = wbRes.data || []
    pageCache.set(PAGE_CACHE_KEY, {
      tasks: tasks.value,
      workbenchRows: workbenchRows.value,
      taskDetailMap: taskDetailMap.value,
      codeRunMetaMap: codeRunMetaMap.value,
    })
  } catch (error) {
    console.error('获取任务列表失败:', error)
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

onMounted(() => {
  loadTasks({ background: pageCache.has(PAGE_CACHE_KEY) })
  listMyTeachingClasses().then((r) => {
    if (r.success) teachingClassOptions.value = r.data || []
  })
  getMyTeachingOverview().then((r) => {
    if (r.success) legacyClassOptions.value = r.data || []
  })
  if (route.query.teachingClassId) {
    filterTeachingClassId.value = Number(route.query.teachingClassId)
    filterPublishType.value = 'teaching'
  }
  if (route.query.classId) {
    filterLegacyClassId.value = Number(route.query.classId)
    filterPublishType.value = 'legacy'
  }
})

onActivated(() => {
  loadTasks({ background: true })
})

useRtOnDomains(['tasks', 'task_templates', 'submissions', 'grading', 'similarity'], () => {
  loadTasks({ background: true })
})
</script>

<style scoped>
.task-workbench {
  max-width: 1360px;
  margin: 0 auto;
  padding: 20px 4px 32px;
  min-height: calc(100vh - 120px);
}

.workbench-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px 24px;
  margin-bottom: 24px;
}

.workbench-title {
  margin: 0 0 8px;
  font-size: 24px;
  font-weight: 700;
  color: #0f172a;
  letter-spacing: -0.02em;
}

.workbench-subtitle {
  margin: 0;
  max-width: 40rem;
  font-size: 14px;
  line-height: 1.6;
  color: #64748b;
}

.workbench-head__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.filter-banner {
  margin-bottom: 16px;
  border-radius: 12px;
}

.workbench-skeleton {
  padding: 12px 0;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 14px;
  margin-bottom: 20px;
}

.metric-card {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 18px 16px;
  text-align: left;
  background: #fff;
  border: 1px solid #e8edf3;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
  cursor: pointer;
  transition: box-shadow 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
}

.metric-card:hover {
  border-color: #c9d8ef;
  box-shadow: 0 4px 14px rgba(15, 76, 129, 0.08);
  transform: translateY(-2px);
}

.metric-card--active {
  border-color: rgba(22, 119, 255, 0.45);
  box-shadow: 0 4px 14px rgba(15, 76, 129, 0.1);
}

.metric-card__icon {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
}

.metric-card__icon--slate { background: #f1f5f9; color: #475569; }
.metric-card__icon--blue { background: #eff6ff; color: #1677ff; }
.metric-card__icon--orange { background: #fff7ed; color: #ea580c; }
.metric-card__icon--amber { background: #fffbeb; color: #d97706; }
.metric-card__icon--green { background: #f0fdf4; color: #16a34a; }

.metric-card__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.metric-card__value {
  font-size: 26px;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
}

.metric-card__label {
  font-size: 13px;
  font-weight: 500;
  color: #475569;
}

.metric-card__hint {
  font-size: 11px;
  color: #94a3b8;
}

.panel {
  background: #fff;
  border: 1px solid #e8edf3;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
  overflow: hidden;
}

.panel__header {
  padding: 16px 20px;
  border-bottom: 1px solid #eef2f7;
  background: #fafbfc;
}

.panel__header--filters {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px 20px;
}

.panel__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #0f172a;
}

.panel__meta {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: #94a3b8;
}

.filter-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  flex: 1;
  justify-content: flex-end;
  min-width: 280px;
}

.filter-input {
  width: 200px;
}

.filter-select {
  width: 130px;
}

.toolbar-label {
  font-size: 12px;
  color: #64748b;
}

.table-wrap {
  padding: 0 4px 8px;
}

.workbench-table :deep(.el-table__header th) {
  background: #f8fafc !important;
  color: #475569;
  font-weight: 600;
}

.workbench-table :deep(.el-table__row) {
  transition: background 0.15s ease;
}

.cell-strong {
  font-weight: 600;
  color: #0f172a;
}

.task-name-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.task-name-sub {
  font-size: 12px;
  color: #94a3b8;
  font-variant-numeric: tabular-nums;
}

.scope-cell {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.scope-name {
  font-size: 13px;
  color: #334155;
}

.progress-cell {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 120px;
}

.progress-caption {
  font-size: 12px;
  color: #64748b;
  font-variant-numeric: tabular-nums;
}

.table-row-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.danger-text {
  color: var(--el-color-danger);
}

.panel-empty {
  padding: 32px 16px 40px;
}

@media (max-width: 768px) {
  .filter-input,
  .filter-select {
    width: 100%;
  }

  .filter-bar {
    justify-content: stretch;
  }
}
</style>
