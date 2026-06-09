<template>
  <div class="class-cockpit">
    <header class="cockpit-head">
      <div class="cockpit-head__main">
        <h1 class="cockpit-title">行政班工作台</h1>
        <p class="cockpit-subtitle">集中管理行政班学生、公告、任务与班级学习情况</p>
      </div>
      <div class="cockpit-head__actions">
        <el-button @click="goAnnouncements">
          <el-icon><Bell /></el-icon>
          发布班级公告
        </el-button>
        <el-button type="primary" @click="goCreateTask">
          <el-icon><DocumentAdd /></el-icon>
          创建班级任务
        </el-button>
      </div>
    </header>

    <el-skeleton v-if="loading" animated :rows="10" class="cockpit-skeleton" />

    <template v-else-if="!rawOverview.length">
      <el-empty description="暂无负责班级，请联系管理员为您分配班级。" :image-size="120" class="cockpit-empty" />
    </template>

    <template v-else>
      <section class="metric-grid">
        <button
          v-for="card in summaryCards"
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

      <div class="panel filter-panel">
        <div class="filter-bar">
          <el-input
            v-model="searchText"
            clearable
            placeholder="搜索班级名称"
            class="filter-input"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
          <el-select v-model="majorFilter" clearable placeholder="专业筛选" class="filter-select">
            <el-option v-for="m in majorOptions" :key="m" :label="m" :value="m" />
          </el-select>
          <el-select v-model="gradeFilter" clearable placeholder="年级筛选" class="filter-select">
            <el-option v-for="g in gradeOptions" :key="g" :label="g" :value="g" />
          </el-select>
          <el-select v-model="sortBy" placeholder="排序" class="filter-select filter-select--sort">
            <el-option label="学生数（多→少）" value="students" />
            <el-option label="任务数（多→少）" value="tasks" />
            <el-option label="最近更新" value="updated" />
          </el-select>
        </div>
      </div>

      <section class="panel class-panel">
        <div class="panel__header">
          <div>
            <h2 class="panel__title">行政班列表</h2>
            <span class="panel__meta">共 {{ filteredClasses.length }} 个班级</span>
          </div>
        </div>

        <div v-if="filteredClasses.length" class="class-grid">
          <article
            v-for="cls in filteredClasses"
            :key="cls.id"
            class="class-card"
            role="button"
            tabindex="0"
            @click="goDetail(cls.id)"
            @keyup.enter="goDetail(cls.id)"
          >
            <div class="class-card__top">
              <div class="class-card__title-wrap">
                <h3 class="class-card__title">{{ cls.class_name }}</h3>
                <p class="class-card__meta">{{ cls.major || '—' }} · {{ cls.grade || '—' }}</p>
              </div>
              <span class="class-card__arrow" aria-hidden="true">
                <el-icon><ArrowRight /></el-icon>
              </span>
            </div>

            <div class="class-card__stats">
              <span><strong>{{ cls.studentCount }}</strong> 学生</span>
              <span><strong>{{ cls.taskCount }}</strong> 任务</span>
              <span><strong>{{ cls.annCount }}</strong> 公告</span>
              <span><strong>{{ cls.pendingSubmit }}</strong> 待提交</span>
            </div>

            <div class="class-card__recent">
              <div class="recent-row">
                <span class="recent-label">最近任务</span>
                <span class="recent-value" :title="cls.recentTaskTitle">
                  {{ cls.recentTaskTitle }}
                </span>
              </div>
              <div class="recent-row">
                <span class="recent-label">最近公告</span>
                <span class="recent-value" :title="cls.recentAnnTitle">
                  {{ cls.recentAnnTitle }}
                </span>
              </div>
            </div>

            <div class="class-card__footer">
              <el-button type="primary" plain size="small" @click.stop="goDetail(cls.id)">
                进入班级工作台
                <el-icon><ArrowRight /></el-icon>
              </el-button>
            </div>
          </article>
        </div>

        <el-empty
          v-else
          description="暂无匹配的行政班，请调整筛选条件"
          :image-size="80"
          class="panel-empty"
        />
      </section>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  ArrowRight,
  Bell,
  DocumentAdd,
  Document,
  OfficeBuilding,
  Search,
  User,
  Warning,
} from '@element-plus/icons-vue'
import { getMyTeachingOverview, listClassAnnouncements } from '../../api/class'
import { getAllTasks } from '../../api/task'

const router = useRouter()
const loading = ref(true)
const rawOverview = ref([])
const allTasks = ref([])
const announcementsMap = ref({})

const searchText = ref('')
const majorFilter = ref('')
const gradeFilter = ref('')
const sortBy = ref('updated')

const RECENT_ANN_DAYS = 30

function legacyTasksForClass(classId) {
  return allTasks.value.filter(
    (t) => Number(t.class_id) === Number(classId) && !t.teaching_class_id
  )
}

function pendingSubmitForTasks(tasks, studentCount) {
  return tasks.reduce((sum, t) => {
    const total = Number(t.classStudentCount) || Number(studentCount) || 0
    const sub = Number(t.submittedStudentCount ?? 0)
    return sum + Math.max(0, total - sub)
  }, 0)
}

function latestByDate(items, field) {
  if (!items.length) return null
  return [...items].sort((a, b) => new Date(b[field]) - new Date(a[field]))[0]
}

function classLastUpdated(cls, tasks, announcements) {
  const dates = []
  for (const t of tasks) {
    if (t.updated_at) dates.push(new Date(t.updated_at))
    else if (t.created_at) dates.push(new Date(t.created_at))
  }
  for (const a of announcements) {
    if (a.created_at) dates.push(new Date(a.created_at))
  }
  if (!dates.length) return 0
  return Math.max(...dates.map((d) => d.getTime()))
}

const enrichedClasses = computed(() =>
  rawOverview.value.map((cls) => {
    const tasks = legacyTasksForClass(cls.id)
    const sortedTasks = [...tasks].sort(
      (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
    )
    const announcements = announcementsMap.value[cls.id] || []
    const recentTask = sortedTasks[0]
    const recentAnn = latestByDate(announcements, 'created_at')
    return {
      ...cls,
      taskCount: tasks.length,
      annCount: announcements.length,
      pendingSubmit: pendingSubmitForTasks(tasks, cls.studentCount),
      recentTaskTitle: recentTask?.title || '暂无任务',
      recentAnnTitle: recentAnn?.title || '暂无公告',
      lastUpdated: classLastUpdated(cls, tasks, announcements),
    }
  })
)

const majorOptions = computed(() =>
  [...new Set(rawOverview.value.map((c) => c.major).filter(Boolean))].sort()
)
const gradeOptions = computed(() =>
  [...new Set(rawOverview.value.map((c) => c.grade).filter(Boolean))].sort()
)

const filteredClasses = computed(() => {
  let rows = enrichedClasses.value
  const q = searchText.value.trim().toLowerCase()
  if (q) {
    rows = rows.filter((c) => (c.class_name || '').toLowerCase().includes(q))
  }
  if (majorFilter.value) {
    rows = rows.filter((c) => c.major === majorFilter.value)
  }
  if (gradeFilter.value) {
    rows = rows.filter((c) => c.grade === gradeFilter.value)
  }
  rows = [...rows]
  if (sortBy.value === 'students') {
    rows.sort((a, b) => (Number(b.studentCount) || 0) - (Number(a.studentCount) || 0))
  } else if (sortBy.value === 'tasks') {
    rows.sort((a, b) => (Number(b.taskCount) || 0) - (Number(a.taskCount) || 0))
  } else {
    rows.sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0))
  }
  return rows
})

const totalStudents = computed(() =>
  rawOverview.value.reduce((s, c) => s + (Number(c.studentCount) || 0), 0)
)

const totalLegacyTasks = computed(() => {
  const ids = new Set(rawOverview.value.map((c) => Number(c.id)))
  return allTasks.value.filter(
    (t) => !t.teaching_class_id && ids.has(Number(t.class_id))
  ).length
})

const totalPendingSubmit = computed(() =>
  enrichedClasses.value.reduce((s, c) => s + (Number(c.pendingSubmit) || 0), 0)
)

const recentAnnouncementCount = computed(() => {
  const cutoff = Date.now() - RECENT_ANN_DAYS * 24 * 60 * 60 * 1000
  let count = 0
  for (const list of Object.values(announcementsMap.value)) {
    for (const a of list) {
      const t = new Date(a.created_at).getTime()
      if (!Number.isNaN(t) && t >= cutoff) count += 1
    }
  }
  return count
})

const summaryCards = computed(() => [
  {
    key: 'classes',
    label: '行政班数量',
    value: rawOverview.value.length,
    icon: OfficeBuilding,
    tone: 'slate',
    to: null,
  },
  {
    key: 'students',
    label: '学生总数',
    value: totalStudents.value,
    icon: User,
    tone: 'blue',
    to: null,
  },
  {
    key: 'tasks',
    label: '已发布任务',
    value: totalLegacyTasks.value,
    icon: Document,
    tone: 'indigo',
    to: '/teacher/tasks',
  },
  {
    key: 'pending',
    label: '待提交人数',
    value: totalPendingSubmit.value,
    hint: '按任务名额估算',
    icon: Warning,
    tone: 'orange',
    to: '/teacher/tasks',
  },
  {
    key: 'announcements',
    label: '近期公告',
    value: recentAnnouncementCount.value,
    hint: `近 ${RECENT_ANN_DAYS} 天`,
    icon: Bell,
    tone: 'teal',
    to: '/teacher/class-announcements',
  },
])

const goDetail = (id) => {
  router.push(`/teacher/classes/${id}`)
}

const goAnnouncements = () => {
  const first = rawOverview.value[0]
  if (first) {
    router.push({ path: '/teacher/class-announcements', query: { classId: String(first.id) } })
  } else {
    router.push('/teacher/class-announcements')
  }
}

const goCreateTask = () => {
  const first = rawOverview.value[0]
  if (first) {
    router.push({ path: '/teacher/tasks/create', query: { classId: String(first.id) } })
  } else {
    router.push('/teacher/tasks/create')
  }
}

const load = async () => {
  loading.value = true
  try {
    const [overviewRes, tasksRes] = await Promise.all([
      getMyTeachingOverview(),
      getAllTasks(),
    ])
    if (overviewRes.success) rawOverview.value = overviewRes.data || []
    if (tasksRes.success) allTasks.value = tasksRes.data || []

    const classes = rawOverview.value
    if (classes.length) {
      const results = await Promise.all(
        classes.map((c) =>
          listClassAnnouncements(c.id).catch(() => ({ success: false, data: [] }))
        )
      )
      const map = {}
      classes.forEach((c, i) => {
        map[c.id] = results[i]?.success ? results[i].data || [] : []
      })
      announcementsMap.value = map
    } else {
      announcementsMap.value = {}
    }
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.class-cockpit {
  max-width: 1360px;
  margin: 0 auto;
  padding: 20px 4px 32px;
  min-height: calc(100vh - 120px);
}

.cockpit-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px 24px;
  margin-bottom: 24px;
}

.cockpit-title {
  margin: 0 0 8px;
  font-size: 24px;
  font-weight: 700;
  color: #0f172a;
  letter-spacing: -0.02em;
}

.cockpit-subtitle {
  margin: 0;
  max-width: 40rem;
  font-size: 14px;
  line-height: 1.6;
  color: #64748b;
}

.cockpit-head__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.cockpit-skeleton {
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
  transition: box-shadow 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
}

.metric-card:hover:not(.metric-card--static) {
  border-color: #c9d8ef;
  box-shadow: 0 4px 14px rgba(15, 76, 129, 0.08);
  transform: translateY(-2px);
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
.metric-card__icon--blue { background: #eff6ff; color: #2563eb; }
.metric-card__icon--indigo { background: #eef2ff; color: #4f46e5; }
.metric-card__icon--orange { background: #fff7ed; color: #ea580c; }
.metric-card__icon--teal { background: #f0fdfa; color: #0d9488; }

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
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}

.metric-card__label {
  font-size: 13px;
  font-weight: 600;
  color: #64748b;
}

.metric-card__hint {
  font-size: 12px;
  color: #94a3b8;
}

.panel {
  background: #fff;
  border: 1px solid #e8edf3;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
  margin-bottom: 20px;
}

.filter-panel {
  padding: 16px 18px;
}

.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.filter-input {
  width: 220px;
  max-width: 100%;
}

.filter-select {
  width: 150px;
}

.filter-select--sort {
  width: 168px;
}

.class-panel {
  padding: 0 0 20px;
}

.panel__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 20px 14px;
  border-bottom: 1px solid #eef2f7;
}

.panel__title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.panel__meta {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: #94a3b8;
}

.class-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
  padding: 18px 20px 0;
}

.class-card {
  background: #fff;
  border: 1px solid #e8edf3;
  border-radius: 12px;
  padding: 20px 18px 16px;
  cursor: pointer;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    border-color 0.2s ease;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
}

.class-card:hover {
  transform: translateY(-3px);
  border-color: rgba(22, 119, 255, 0.45);
  box-shadow: 0 8px 24px rgba(15, 76, 129, 0.1);
}

.class-card:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}

.class-card__top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 14px;
}

.class-card__title {
  margin: 0 0 6px;
  font-size: 17px;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.35;
}

.class-card__meta {
  margin: 0;
  font-size: 13px;
  color: #64748b;
}

.class-card__arrow {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: #f8fafc;
  color: #64748b;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  transition: background 0.2s ease, color 0.2s ease;
}

.class-card:hover .class-card__arrow {
  background: #eff6ff;
  color: var(--el-color-primary);
}

.class-card__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  margin-bottom: 14px;
  font-size: 13px;
  color: #475569;
}

.class-card__stats strong {
  font-weight: 700;
  color: var(--el-color-primary);
  margin-right: 2px;
}

.class-card__recent {
  padding: 12px 14px;
  border-radius: 10px;
  background: #f8fafc;
  margin-bottom: 14px;
}

.recent-row {
  display: flex;
  gap: 10px;
  align-items: baseline;
  font-size: 12px;
  line-height: 1.5;
}

.recent-row + .recent-row {
  margin-top: 6px;
}

.recent-label {
  flex-shrink: 0;
  color: #94a3b8;
  width: 56px;
}

.recent-value {
  flex: 1;
  min-width: 0;
  color: #334155;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.class-card__footer {
  display: flex;
  justify-content: flex-end;
}

.class-card__footer .el-button {
  border-radius: 8px;
  font-weight: 600;
}

.panel-empty,
.cockpit-empty {
  padding: 24px 0;
}

@media (max-width: 768px) {
  .filter-input,
  .filter-select,
  .filter-select--sort {
    width: 100%;
  }
}
</style>
