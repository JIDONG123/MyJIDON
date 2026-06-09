<template>
  <div class="teacher-workbench">
    <header class="workbench-head">
      <div class="workbench-head__main">
        <h1 class="workbench-title">教师工作台</h1>
        <p class="workbench-subtitle">
          汇总课程、教学班、实训任务、AI 批改与在线实训运行情况
        </p>
      </div>
      <div class="workbench-head__actions">
        <el-button type="primary" @click="$router.push('/teacher/tasks/create')">
          <el-icon><Plus /></el-icon>
          发布任务
        </el-button>
        <el-button
          v-if="smartCaps.onlinePractice"
          @click="$router.push('/teacher/online-practice/create')"
        >
          <el-icon><Monitor /></el-icon>
          创建在线实训
        </el-button>
        <el-button @click="$router.push('/teacher/classes')">
          <el-icon><OfficeBuilding /></el-icon>
          进入班级管理
        </el-button>
      </div>
    </header>

    <el-skeleton v-if="loading" animated :rows="10" class="workbench-skeleton" />

    <template v-else>
      <section class="metric-grid">
        <button
          v-for="card in metricCards"
          :key="card.key"
          type="button"
          class="metric-card"
          :class="{ 'metric-card--static': !card.to }"
          @click="card.to && $router.push(card.to)"
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

      <el-row :gutter="16" class="workbench-row">
        <el-col :xs="24" :lg="14">
          <div class="panel">
            <div class="panel__header">
              <h2 class="panel__title">今日待办</h2>
              <span class="panel__meta">{{ todoItems.length ? `${todoItems.length} 项` : '已清空' }}</span>
            </div>
            <div v-if="todoItems.length" class="todo-list">
              <div v-for="item in todoItems" :key="item.key" class="todo-item">
                <div class="todo-item__main">
                  <el-tag :type="item.tagType" size="small" effect="light" class="todo-item__tag">
                    {{ item.tagLabel }}
                  </el-tag>
                  <span class="todo-item__text">{{ item.text }}</span>
                </div>
                <el-button type="primary" link @click="$router.push(item.to)">去处理</el-button>
              </div>
            </div>
            <el-empty v-else description="今日暂无待处理事项" :image-size="72" class="panel-empty" />
          </div>
        </el-col>
        <el-col :xs="24" :lg="10">
          <div class="panel">
            <div class="panel__header">
              <h2 class="panel__title">智能能力状态</h2>
            </div>
            <div class="cap-grid">
              <div
                v-for="cap in capabilityItems"
                :key="cap.key"
                class="cap-item"
                :class="{ 'cap-item--clickable': cap.to }"
                @click="cap.to && $router.push(cap.to)"
              >
                <span class="cap-item__label">{{ cap.label }}</span>
                <el-tag :type="cap.tagType" size="small" effect="light">{{ cap.status }}</el-tag>
              </div>
            </div>
          </div>
        </el-col>
      </el-row>

      <div class="panel">
        <div class="panel__header">
          <div>
            <h2 class="panel__title">最近任务</h2>
            <span class="panel__meta">本人发布 · 最多展示 8 条</span>
          </div>
          <el-button link type="primary" @click="$router.push('/teacher/tasks')">全部任务</el-button>
        </div>
        <div v-if="recentTasks.length" class="table-wrap">
          <el-table :data="recentTasks" class="workbench-table" stripe>
            <el-table-column prop="title" label="任务名称" min-width="160" show-overflow-tooltip>
              <template #default="{ row }">
                <span class="cell-strong">{{ row.title }}</span>
              </template>
            </el-table-column>
            <el-table-column label="班级" min-width="120" show-overflow-tooltip>
              <template #default="{ row }">
                <span class="cell-muted">{{ taskAudienceLabel(row) }}</span>
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
                <el-tag :type="taskGradingMeta(row.id).type" size="small" effect="light">
                  {{ taskGradingMeta(row.id).text }}
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
            <el-table-column label="操作" min-width="300" align="right" fixed="right">
              <template #default="{ row }">
                <div class="table-row-actions">
                  <el-button type="primary" size="small" plain :icon="EditPen" @click="goGradingForTask(row.id)">
                    批改
                  </el-button>
                  <el-button
                    type="primary"
                    size="small"
                    plain
                    :icon="Document"
                    @click="$router.push(`/teacher/submissions/${row.id}`)"
                  >
                    任务提交
                  </el-button>
                  <el-button
                    type="primary"
                    size="small"
                    plain
                    :icon="DataAnalysis"
                    @click="$router.push('/teacher/statistics')"
                  >
                    查看报告
                  </el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>
        </div>
        <el-empty v-else description="暂无任务，可从班级或教学班发布实训任务" :image-size="80" class="panel-empty">
          <el-button type="primary" @click="$router.push('/teacher/classes')">前往班级管理</el-button>
        </el-empty>
      </div>

      <div class="panel">
        <div class="panel__header">
          <div>
            <h2 class="panel__title">班级进度</h2>
            <span class="panel__meta">行政班与教学班汇总</span>
          </div>
          <el-button link type="primary" @click="$router.push('/teacher/teaching-classes')">教学班管理</el-button>
        </div>
        <div v-if="classProgressRows.length" class="table-wrap">
          <el-table :data="classProgressRows" class="workbench-table" stripe>
            <el-table-column label="班级名称" min-width="160" show-overflow-tooltip>
              <template #default="{ row }">
                <span class="cell-strong">{{ row.name }}</span>
                <el-tag v-if="row.kind === 'teaching'" size="small" type="primary" effect="plain" class="kind-tag">
                  教学班
                </el-tag>
                <el-tag v-else size="small" effect="plain" class="kind-tag">行政班</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="studentCount" label="学生数" width="88" align="center" />
            <el-table-column prop="taskCount" label="当前任务" width="96" align="center" />
            <el-table-column label="平均完成率" min-width="160">
              <template #default="{ row }">
                <div class="progress-cell">
                  <el-progress
                    :percentage="row.completionRate"
                    :stroke-width="8"
                    :show-text="false"
                    :color="row.completionRate >= 80 ? '#52c41a' : '#1677ff'"
                  />
                  <span class="progress-caption">{{ row.completionRate }}%</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="recentTaskTitle" label="最近任务" min-width="140" show-overflow-tooltip />
            <el-table-column label="操作" width="120" align="right">
              <template #default="{ row }">
                <div class="table-row-actions">
                  <el-button type="primary" size="small" plain :icon="View" @click="$router.push(row.to)">
                    进入
                  </el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>
        </div>
        <el-empty v-else description="暂无班级数据" :image-size="72" class="panel-empty" />
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  OfficeBuilding,
  User,
  Document,
  EditPen,
  View,
  Plus,
  Monitor,
  School,
  Cpu,
  DataAnalysis,
} from '@element-plus/icons-vue'
import { getMyTeachingOverview } from '../../api/class'
import { getAllTasks, getTaskById } from '../../api/task'
import { getTeacherGradingWorkbench } from '../../api/submission'
import { listMyTeachingClasses } from '../../api/teachingClass'
import { listOnlinePracticeTemplates, getOnlinePracticeAiReviewStatus } from '../../api/onlinePractice'
import { listKbDocuments } from '../../api/kb'
import { probeCodeRunnerEnabled } from '../../composables/useCodeRunnerFeature'

const router = useRouter()
const loading = ref(true)
const legacyOverview = ref([])
const teachingClasses = ref([])
const allTasks = ref([])
const workbenchRows = ref([])
const practiceTemplates = ref([])
const kbDocCount = ref(0)
const codeRunnerOn = ref(false)
const aiReviewGlobalOn = ref(false)
const taskDetailMap = ref({})

const DEADLINE_SOON_MS = 72 * 60 * 60 * 1000

const totalLegacyStudents = computed(() =>
  legacyOverview.value.reduce((s, c) => s + (Number(c.studentCount) || 0), 0)
)
const totalTeachingStudents = computed(() =>
  teachingClasses.value.reduce((s, c) => s + (Number(c.student_count) || 0), 0)
)
const totalStudents = computed(() => totalLegacyStudents.value + totalTeachingStudents.value)

const pendingGradeCount = computed(() =>
  workbenchRows.value.filter(
    (r) =>
      r.grading_status == null ||
      r.grading_status === '' ||
      r.grading_status === 'pending' ||
      r.grading_status === 'ai_failed'
  ).length
)
const pendingReviewCount = computed(() =>
  workbenchRows.value.filter((r) => r.grading_status === 'ai_graded').length
)
const submittedStudentCount = computed(() => {
  const ids = new Set(workbenchRows.value.map((r) => r.student_id))
  return ids.size
})
const codeRunEnabledTaskCount = computed(() =>
  allTasks.value.filter((t) => taskDetailMap.value[t.id]?.code_run_enabled).length
)
const codeRunSubmissionCount = computed(() =>
  allTasks.value
    .filter((t) => taskDetailMap.value[t.id]?.code_run_enabled)
    .reduce((s, t) => s + (Number(t.submissionCount) || 0), 0)
)

const soonDeadlineTasks = computed(() =>
  allTasks.value.filter((t) => deadlineMeta(t.deadline).statusText === '即将截止')
)

const unsubmittedSlots = computed(() =>
  allTasks.value.reduce((sum, t) => {
    const total = Number(t.classStudentCount)
    const sub = Number(t.submittedStudentCount ?? 0)
    if (!Number.isFinite(total) || total <= 0) return sum
    return sum + Math.max(0, total - sub)
  }, 0)
)

const recentTasks = computed(() => allTasks.value.slice(0, 8))

const metricCards = computed(() => {
  const cards = [
    {
      key: 'legacy-class',
      label: '负责班级',
      value: legacyOverview.value.length,
      hint: '行政班',
      icon: OfficeBuilding,
      tone: 'slate',
      to: '/teacher/classes',
    },
    {
      key: 'teaching-class',
      label: '教学班',
      value: teachingClasses.value.length,
      hint: '课程教学班',
      icon: School,
      tone: 'blue',
      to: '/teacher/teaching-classes',
    },
    {
      key: 'students',
      label: '学生总数',
      value: totalStudents.value,
      hint: `行政 ${totalLegacyStudents.value} · 教学班 ${totalTeachingStudents.value}`,
      icon: User,
      tone: 'teal',
      to: '/teacher/classes',
    },
    {
      key: 'tasks',
      label: '已发布任务',
      value: allTasks.value.length,
      icon: Document,
      tone: 'indigo',
      to: '/teacher/tasks',
    },
    {
      key: 'submitted',
      label: '已提交学生',
      value: submittedStudentCount.value,
      hint: '去重统计',
      icon: View,
      tone: 'cyan',
      to: '/teacher/grading-queue',
    },
    {
      key: 'pending-grade',
      label: '待批改',
      value: pendingGradeCount.value,
      icon: EditPen,
      tone: 'orange',
      to: '/teacher/grading-queue',
    },
    {
      key: 'pending-review',
      label: '待复核',
      value: pendingReviewCount.value,
      hint: 'AI 批改后待教师确认',
      icon: EditPen,
      tone: 'amber',
      to: '/teacher/grading-queue',
    },
  ]
  if (codeRunnerOn.value) {
    cards.push({
      key: 'practice-templates',
      label: '在线实训模板',
      value: practiceTemplates.value.length,
      icon: Monitor,
      tone: 'purple',
      to: '/teacher/online-practice',
    })
    cards.push({
      key: 'code-runs',
      label: '代码运行提交',
      value: codeRunSubmissionCount.value,
      hint: `${codeRunEnabledTaskCount.value} 个任务已开启检查`,
      icon: Cpu,
      tone: 'green',
      to: '/teacher/tasks',
    })
  }
  return cards
})

const todoItems = computed(() => {
  const items = []
  if (pendingGradeCount.value > 0) {
    items.push({
      key: 'pending-grade',
      tagLabel: '待批改',
      tagType: 'warning',
      text: `${pendingGradeCount.value} 份作业待批改`,
      to: '/teacher/grading-queue',
    })
  }
  if (pendingReviewCount.value > 0) {
    items.push({
      key: 'pending-review',
      tagLabel: '待复核',
      tagType: 'warning',
      text: `${pendingReviewCount.value} 份 AI 批改待教师复核`,
      to: '/teacher/grading-queue',
    })
  }
  if (soonDeadlineTasks.value.length > 0) {
    items.push({
      key: 'deadline',
      tagLabel: '截止',
      tagType: 'danger',
      text: `${soonDeadlineTasks.value.length} 个任务即将截止（72 小时内）`,
      to: '/teacher/tasks',
    })
  }
  if (unsubmittedSlots.value > 0) {
    items.push({
      key: 'unsubmitted',
      tagLabel: '提醒',
      tagType: 'info',
      text: `约 ${unsubmittedSlots.value} 人次尚未提交（按任务名额估算）`,
      to: '/teacher/tasks',
    })
  }
  return items
})

const smartCaps = computed(() => ({
  onlinePractice: codeRunnerOn.value,
  aiReview: aiReviewGlobalOn.value,
}))

const capabilityItems = computed(() => [
  {
    key: 'ai-grade',
    label: 'AI 批改',
    status: pendingReviewCount.value > 0 ? '有待复核' : '正常',
    tagType: pendingReviewCount.value > 0 ? 'warning' : 'success',
    to: '/teacher/grading-queue',
  },
  {
    key: 'online-practice',
    label: '在线实训',
    status: codeRunnerOn.value ? '已启用' : '未启用',
    tagType: codeRunnerOn.value ? 'success' : 'info',
    to: codeRunnerOn.value ? '/teacher/online-practice' : undefined,
  },
  {
    key: 'code-run',
    label: '代码运行',
    status: codeRunnerOn.value ? '正常' : '未启用',
    tagType: codeRunnerOn.value ? 'success' : 'info',
    to: codeRunnerOn.value ? '/teacher/online-practice' : undefined,
  },
  {
    key: 'kb',
    label: '知识库 / RAG',
    status: kbDocCount.value > 0 ? '已配置' : '未配置',
    tagType: kbDocCount.value > 0 ? 'success' : 'info',
    to: '/teacher/knowledge-base',
  },
])

const classProgressRows = computed(() => {
  const rows = []
  for (const c of legacyOverview.value) {
    const tasks = allTasks.value.filter((t) => Number(t.class_id) === Number(c.id) && !t.teaching_class_id)
    rows.push(buildClassProgressRow({
      kind: 'legacy',
      id: c.id,
      name: c.class_name,
      studentCount: Number(c.studentCount) || 0,
      tasks,
      to: `/teacher/classes/${c.id}`,
    }))
  }
  for (const tc of teachingClasses.value) {
    const tasks = allTasks.value.filter((t) => Number(t.teaching_class_id) === Number(tc.id))
    rows.push(buildClassProgressRow({
      kind: 'teaching',
      id: tc.id,
      name: tc.class_name,
      studentCount: Number(tc.student_count) || 0,
      tasks,
      to: `/teacher/teaching-classes/${tc.id}`,
    }))
  }
  return rows.sort((a, b) => b.taskCount - a.taskCount)
})

function buildClassProgressRow({ kind, id, name, studentCount, tasks, to }) {
  let completionSum = 0
  let completionN = 0
  for (const t of tasks) {
    const total = Number(t.classStudentCount)
    const sub = Number(t.submittedStudentCount ?? 0)
    if (Number.isFinite(total) && total > 0) {
      completionSum += Math.min(100, Math.round((sub / total) * 100))
      completionN += 1
    }
  }
  const recent = tasks[0]
  return {
    kind,
    id,
    name,
    studentCount,
    taskCount: tasks.length,
    completionRate: completionN ? Math.round(completionSum / completionN) : 0,
    recentTaskTitle: recent?.title || '—',
    to,
  }
}

function progressPercent(row) {
  const total = Number(row.classStudentCount)
  const sub = Number(row.submittedStudentCount ?? 0)
  if (!Number.isFinite(total) || total <= 0) return 0
  return Math.min(100, Math.round((sub / total) * 100))
}

function deadlineMeta(deadline) {
  if (!deadline) {
    return { statusText: '未设置', tagType: 'info' }
  }
  const d = new Date(deadline)
  if (Number.isNaN(d.getTime())) {
    return { statusText: '—', tagType: 'info' }
  }
  const diff = d.getTime() - Date.now()
  if (diff <= 0) {
    return { statusText: '已截止', tagType: 'danger' }
  }
  if (diff <= DEADLINE_SOON_MS) {
    return { statusText: '即将截止', tagType: 'warning' }
  }
  return { statusText: '进行中', tagType: 'primary' }
}

function taskAudienceLabel(row) {
  return row.teaching_class_name || row.class_name || row.course_name || '—'
}

function taskGradingMeta(taskId) {
  const rows = workbenchRows.value.filter((r) => Number(r.task_id) === Number(taskId))
  if (!rows.length) {
    return { text: '暂无提交', type: 'info' }
  }
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
  if (review > 0) return { text: `待复核 ${review}`, type: 'warning' }
  if (pending > 0) return { text: `待批改 ${pending}`, type: 'warning' }
  if (done === rows.length) return { text: '已完成', type: 'success' }
  return { text: '处理中', type: 'primary' }
}

function taskCodeRunMeta(row) {
  const detail = taskDetailMap.value[row.id]
  if (!detail?.code_run_enabled) {
    return { text: '未启用', type: 'info' }
  }
  const subs = Number(row.submissionCount) || 0
  if (subs <= 0) return { text: '待运行', type: 'warning' }
  return { text: '已开启', type: 'success' }
}

function goGradingForTask(taskId) {
  const row = workbenchRows.value.find((r) => Number(r.task_id) === Number(taskId))
  if (row?.submission_id) {
    router.push(`/teacher/grading/${row.submission_id}`)
  } else {
    router.push('/teacher/grading-queue')
  }
}

async function enrichTaskDetails(tasks) {
  const slice = tasks.slice(0, 20)
  const entries = await Promise.all(
    slice.map(async (t) => {
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

async function loadData() {
  loading.value = true
  try {
    const [
      overviewRes,
      tcRes,
      tasksRes,
      wbRes,
      practiceRes,
      kbRes,
      runnerOn,
      aiStatusRes,
    ] = await Promise.all([
      getMyTeachingOverview(),
      listMyTeachingClasses(),
      getAllTasks(),
      getTeacherGradingWorkbench({ status: 'all' }),
      listOnlinePracticeTemplates().catch(() => ({ success: false, data: [] })),
      listKbDocuments().catch(() => ({ success: false, data: [] })),
      probeCodeRunnerEnabled(),
      getOnlinePracticeAiReviewStatus().catch(() => ({ success: false, data: {} })),
    ])

    if (overviewRes.success) legacyOverview.value = overviewRes.data || []
    if (tcRes.success) teachingClasses.value = tcRes.data || []
    if (tasksRes.success) allTasks.value = tasksRes.data || []
    if (wbRes.success) workbenchRows.value = wbRes.data || []
    if (practiceRes.success) practiceTemplates.value = practiceRes.data || []
    if (kbRes.success) kbDocCount.value = (kbRes.data || []).length
    codeRunnerOn.value = runnerOn
    aiReviewGlobalOn.value = Boolean(aiStatusRes?.data?.globalEnabled)

    if (allTasks.value.length) {
      await enrichTaskDetails(allTasks.value)
    }
  } finally {
    loading.value = false
  }
}

onMounted(loadData)
</script>

<style scoped>
.teacher-workbench {
  max-width: 1320px;
  margin: 0 auto;
  padding: 20px 4px 32px;
  min-height: calc(100vh - 120px);
  background: #eef2f7;
  border-radius: 12px;
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

.workbench-skeleton {
  padding: 12px 0;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
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
  transition: box-shadow 0.2s ease, border-color 0.2s ease;
}

.metric-card:hover:not(.metric-card--static) {
  border-color: #c9d8ef;
  box-shadow: 0 4px 14px rgba(15, 76, 129, 0.08);
}

.metric-card--static {
  cursor: default;
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
.metric-card__icon--teal { background: #ecfdf5; color: #0d9488; }
.metric-card__icon--indigo { background: #eef2ff; color: #4f46e5; }
.metric-card__icon--cyan { background: #ecfeff; color: #0891b2; }
.metric-card__icon--orange { background: #fff7ed; color: #ea580c; }
.metric-card__icon--amber { background: #fffbeb; color: #d97706; }
.metric-card__icon--purple { background: #faf5ff; color: #7c3aed; }
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
  line-height: 1.15;
  color: #0f172a;
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
  line-height: 1.4;
}

.workbench-row {
  margin-bottom: 20px;
}

.panel {
  background: #fff;
  border: 1px solid #e8edf3;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
  margin-bottom: 20px;
  overflow: hidden;
}

.panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid #eef2f7;
  background: #fafbfc;
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

.panel-empty {
  padding: 28px 16px 36px;
}

.todo-list {
  padding: 8px 12px 12px;
}

.todo-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 10px;
  border-bottom: 1px solid #f1f5f9;
}

.todo-item:last-child {
  border-bottom: none;
}

.todo-item__main {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.todo-item__text {
  font-size: 14px;
  color: #334155;
}

.cap-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding: 16px;
}

.cap-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  border: 1px solid #eef2f7;
  border-radius: 10px;
  background: #fafbfc;
}

.cap-item--clickable {
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease;
}

.cap-item--clickable:hover {
  border-color: #c9d8ef;
  background: #f8fbff;
}

.cap-item__label {
  font-size: 13px;
  font-weight: 500;
  color: #475569;
}

.table-wrap {
  padding: 4px 4px 12px;
}

.workbench-table {
  --el-table-border-color: #eef2f7;
  --el-table-header-bg-color: #f8fafc;
}

.workbench-table :deep(.el-table__header th) {
  font-weight: 600;
  font-size: 13px;
  color: #475569;
}

.workbench-table :deep(.el-table__cell) {
  padding: 14px 16px;
}

.workbench-table :deep(.el-table__header th:first-child),
.workbench-table :deep(.el-table__body td:first-child) {
  padding-left: 20px;
}

.workbench-table :deep(.el-table__header th:last-child),
.workbench-table :deep(.el-table__body td:last-child) {
  padding-right: 20px;
}

.cell-strong {
  font-weight: 600;
  color: #1e293b;
}

.cell-muted {
  font-size: 13px;
  color: #64748b;
}

.kind-tag {
  margin-left: 8px;
  vertical-align: middle;
}

.progress-cell {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 200px;
}

.progress-caption {
  font-size: 12px;
  color: #64748b;
  font-variant-numeric: tabular-nums;
}

@media (max-width: 768px) {
  .workbench-title {
    font-size: 20px;
  }

  .cap-grid {
    grid-template-columns: 1fr;
  }

  .metric-grid {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
