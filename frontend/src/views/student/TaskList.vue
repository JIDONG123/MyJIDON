<template>
  <div class="stu-center-page">
    <header class="page-head">
      <h1 class="page-title">实训中心</h1>
      <p class="page-desc">在实训中心查看行政班与教学班，完成任务提交并查看成绩报告。</p>
    </header>

    <!-- 我的学习空间 -->
    <section class="spaces-section">
      <h2 class="section-label">我的学习空间</h2>
      <el-skeleton v-if="loading && !spaceCards.length" :rows="2" animated />
      <div v-else-if="!spaceCards.length" class="spaces-empty">
        <p>您尚未加入行政班或教学班，请等待教师添加后再进入实训中心。</p>
      </div>
      <div v-else class="spaces-grid">
        <LearningSpaceCard
          v-for="card in spaceCards"
          :key="card.key"
          :card="card"
          :selected="selectedSpaceKey === card.key"
          @select="onSelectSpace"
        />
      </div>
    </section>

    <template v-if="spaceCards.length">
      <div class="context-bar">
        <span class="context-label">当前查看：</span>
        <strong>{{ currentViewText }}</strong>
      </div>

      <StudentAnnouncementPanel
        v-if="showAnnPanel"
        :title="annSectionTitle"
        :announcements="visibleAnnouncements"
        @view-all="showAnnDialog = true"
        @detail="openAnnDetail"
      />

      <!-- 任务统计 -->
      <section class="stats-row">
        <button
          v-for="s in statItems"
          :key="s.key"
          type="button"
          class="stat-card"
          :class="[
            { 'stat-card--active': statusFilter === s.filterKey },
            s.tone ? `stat-card--${s.tone}` : '',
          ]"
          @click="setStatFilter(s.filterKey)"
        >
          <span class="stat-num">{{ s.count }}</span>
          <span class="stat-lab">{{ s.label }}</span>
        </button>
      </section>

      <!-- 筛选与搜索 -->
      <section class="filter-bar">
        <div class="filter-tabs">
          <button
            v-for="tab in filterTabs"
            :key="tab.key"
            type="button"
            class="filter-tab"
            :class="{ 'filter-tab--active': statusFilter === tab.key }"
            @click="statusFilter = tab.key"
          >
            {{ tab.label }}
          </button>
        </div>
        <el-input
          v-model="keyword"
          clearable
          placeholder="搜索任务名称"
          class="filter-search"
          :prefix-icon="Search"
        />
      </section>

      <!-- 行政班推荐（仅全部任务 / 行政班空间） -->
      <section
        v-if="showRecommendations && recommendations.tasks?.length"
        class="rec-section"
      >
        <div class="rec-head">
          <h2 class="section-label">行政班推荐任务</h2>
          <el-tag size="small" effect="plain" class="rec-tier-tag">{{ tierLabel }}</el-tag>
        </div>
        <p class="rec-desc">
          根据历史均分与薄弱维度，在<strong>当前空间</strong>已发布且尚未提交的任务中优先展示匹配档位。
        </p>
        <div class="rec-list">
          <div v-for="t in recommendations.tasks" :key="t.id" class="rec-item" @click="viewTask(t.id)">
            <div class="rec-item-main">
              <strong>{{ t.title }}</strong>
              <el-tag v-if="t.difficulty_level" size="small" effect="plain">
                {{ diffLabel(t.difficulty_level) }}
              </el-tag>
            </div>
            <span class="rec-meta">截止 {{ formatDateTime(t.deadline) }} · 满分 {{ t.max_score }}</span>
            <el-button type="primary" size="small" plain @click.stop="viewTask(t.id)">去提交</el-button>
          </div>
        </div>
      </section>

      <el-skeleton v-if="loading" :rows="6" animated class="sk-main" />

      <template v-else-if="!spaceFilteredTasks.length">
        <div class="empty-panel">
          <el-icon class="empty-icon"><Reading /></el-icon>
          <h3>暂无任务</h3>
          <p>当前学习空间暂无任务，请切换其他空间或关注教师通知。</p>
        </div>
      </template>

      <template v-else-if="!filteredTasks.length">
        <div class="empty-panel empty-panel--muted">
          <h3>暂无符合条件的任务</h3>
          <p>请切换任务状态或清空搜索条件。</p>
        </div>
      </template>

      <div v-else class="task-grid">
        <StudentTaskCard
          v-for="task in filteredTasks"
          :key="task.id"
          :task="task"
          :grade="gradeByTaskId.get(task.id)"
          :class-name-fallback="userStore.user?.className || userStore.user?.class_name"
          @action="onTaskAction"
        />
      </div>
    </template>

    <!-- 公告详情 -->
    <el-dialog v-model="annDetailVisible" :title="annDetail?.title || '公告详情'" width="520px" destroy-on-close>
      <template v-if="annDetail">
        <p class="ann-dialog-meta">
          <span>{{ annDetail._sourceLabel || '行政班公告' }}</span>
          <span v-if="annDetail.teacher_name"> · {{ annDetail.teacher_name }}</span>
          <span> · {{ formatDateTime(annDetail.created_at) }}</span>
        </p>
        <div class="ann-dialog-body">{{ annDetail.content || '（无正文）' }}</div>
      </template>
    </el-dialog>

    <!-- 全部公告 -->
    <el-dialog v-model="showAnnDialog" :title="annSectionTitle" width="640px" destroy-on-close>
      <div class="ann-dialog-list">
        <article
          v-for="ann in visibleAnnouncements"
          :key="ann.id"
          class="ann-card-dialog"
          :class="{ 'ann-card-dialog--important': isImportantAnn(ann) }"
        >
          <div class="ann-dialog-item-head">
            <span class="ann-type-tag">{{ ann._sourceLabel || '行政班公告' }}</span>
            <span class="ann-time">{{ formatDateTime(ann.created_at) }}</span>
          </div>
          <h3 class="ann-dialog-item-title">{{ ann.title }}</h3>
          <p class="ann-dialog-item-summary">{{ annSummary(ann.content) }}</p>
          <el-button link type="primary" @click="openAnnDetail(ann)">查看详情</el-button>
        </article>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onActivated, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Reading, Search } from '@element-plus/icons-vue'
import { useUserStore } from '../../stores/user'
import { getAllTasks } from '../../api/task'
import { getLatestAnnouncementForStudent, listClassAnnouncements } from '../../api/class'
import { listTeachingClasses } from '../../api/teachingClass'
import { getMyRecommendations } from '../../api/analytics'
import { getStudentGradingResults } from '../../api/grading'
import { formatDateTime } from '../../utils/format'
import { useRtOnDomains } from '../../composables/useRtOnDomains'
import {
  useStudentLearningSpaces,
  buildGradeMap,
  enrichTasks,
  filterTasksForSpace,
  computeTaskStats,
  buildLearningSpaceCards,
  currentViewLabel,
  announcementSectionTitle,
  shouldShowAnnouncementPanel,
  announcementsForSpace,
  matchStatusFilter,
  isDeadlineSoon,
  isImportantAnn,
  annSummary,
} from '../../composables/useStudentLearningSpaces'
import LearningSpaceCard from '../../components/student/LearningSpaceCard.vue'
import StudentTaskCard from '../../components/student/StudentTaskCard.vue'
import StudentAnnouncementPanel from '../../components/student/StudentAnnouncementPanel.vue'

const router = useRouter()
const userStore = useUserStore()
const { selectedSpaceKey, selectSpace } = useStudentLearningSpaces()

const tasks = ref([])
const myTeachingClasses = ref([])
const loading = ref(true)
const allAnnouncements = ref([])
const gradeByTaskId = ref(new Map())
const recommendations = ref({ tier: 'standard', tasks: [] })
const statusFilter = ref('all')
const keyword = ref('')
const showAnnDialog = ref(false)
const annDetailVisible = ref(false)
const annDetail = ref(null)

const enrichedTasks = computed(() => enrichTasks(tasks.value, gradeByTaskId.value))

const spaceCards = computed(() =>
  buildLearningSpaceCards({
    user: userStore.user,
    teachingClasses: myTeachingClasses.value,
    enrichedTasks: enrichedTasks.value,
    announcements: allAnnouncements.value,
  })
)

const spaceFilteredTasks = computed(() =>
  filterTasksForSpace(enrichedTasks.value, selectedSpaceKey.value, userStore.user?.classId)
)

const visibleAnnouncements = computed(() =>
  announcementsForSpace(allAnnouncements.value, selectedSpaceKey.value)
)

const showAnnPanel = computed(() =>
  shouldShowAnnouncementPanel(selectedSpaceKey.value, visibleAnnouncements.value)
)

const annSectionTitle = computed(() => announcementSectionTitle(selectedSpaceKey.value))

const currentViewText = computed(() => currentViewLabel(selectedSpaceKey.value, spaceCards.value))

const showRecommendations = computed(() => {
  const key = selectedSpaceKey.value
  return key === 'all' || key.startsWith('legacy:')
})

const tierLabel = computed(() => {
  const m = { basic: '巩固型', standard: '标准型', advanced: '挑战型' }
  return m[recommendations.value.tier] || m.standard
})

function diffLabel(level) {
  const m = { basic: '基础', standard: '标准', advanced: '进阶' }
  return m[level] || level
}

const filteredTasks = computed(() => {
  let list = spaceFilteredTasks.value
  if (statusFilter.value === 'soon') {
    list = list.filter((t) => t.uiStatus === 'unsubmitted' && isDeadlineSoon(t.deadline))
  } else if (statusFilter.value !== 'all') {
    list = list.filter((t) => matchStatusFilter(t.uiStatus, statusFilter.value))
  }
  const k = keyword.value.trim().toLowerCase()
  if (k) {
    list = list.filter(
      (t) =>
        String(t.title || '').toLowerCase().includes(k) ||
        String(t.description || '').toLowerCase().includes(k)
    )
  }
  return list
})

const statItems = computed(() => {
  const stats = computeTaskStats(spaceFilteredTasks.value)
  return [
    { key: 'all', filterKey: 'all', label: '全部任务', count: stats.total, tone: '' },
    { key: 'unsubmitted', filterKey: 'unsubmitted', label: '待提交', count: stats.unsubmitted, tone: 'warn' },
    { key: 'pending', filterKey: 'pending_grade', label: '待批改', count: stats.pendingGrade, tone: '' },
    { key: 'done', filterKey: 'graded', label: '已完成', count: stats.completed, tone: 'ok' },
    { key: 'soon', filterKey: 'soon', label: '即将截止', count: stats.soon, tone: 'muted' },
  ]
})

const filterTabs = [
  { key: 'all', label: '全部' },
  { key: 'unsubmitted', label: '未提交' },
  { key: 'submitted', label: '已提交' },
  { key: 'pending_grade', label: '待批改' },
  { key: 'graded', label: '已批改' },
  { key: 'expired', label: '已截止' },
]

function onSelectSpace(key) {
  selectSpace(key)
  statusFilter.value = 'all'
  keyword.value = ''
}

function setStatFilter(key) {
  statusFilter.value = key
}

function openAnnDetail(ann) {
  annDetail.value = ann
  annDetailVisible.value = true
  showAnnDialog.value = false
}

const loadTasks = async ({ background = false } = {}) => {
  const hadData = tasks.value.length > 0
  if (!background || !hadData) loading.value = true

  try {
    const tcRes = await listTeachingClasses()
    if (tcRes.success) myTeachingClasses.value = tcRes.data || []
  } catch {
    if (!hadData) myTeachingClasses.value = []
  }

  const classId = userStore.user?.classId
  const hasClass = !!classId
  const hasTeachingClass = myTeachingClasses.value.length > 0

  if (!hasClass && !hasTeachingClass) {
    recommendations.value = { tier: 'standard', tasks: [] }
    loading.value = false
    return
  }

  if (!hasClass && hasTeachingClass) {
    try {
      const probe = await getAllTasks()
      if (!probe.success) {
        recommendations.value = { tier: 'standard', tasks: [] }
        loading.value = false
        return
      }
    } catch {
      recommendations.value = { tier: 'standard', tasks: [] }
      loading.value = false
      return
    }
  }

  try {
    const reqs = [
      getAllTasks(),
      hasClass ? getMyRecommendations() : Promise.resolve({ success: true, data: { tier: 'standard', tasks: [] } }),
      getStudentGradingResults().catch(() => ({ success: true, data: [] })),
    ]
    if (hasClass) {
      reqs.push(
        listClassAnnouncements(classId).catch(() => ({ success: true, data: [] })),
        getLatestAnnouncementForStudent().catch(() => ({ success: true, data: null }))
      )
    }
    const results = await Promise.all(reqs)
    const [taskRes, recRes, gradeRes, annListRes, annLatestRes] = results

    if (taskRes.success) tasks.value = taskRes.data || []
    if (recRes?.success && recRes.data) {
      recommendations.value = { tier: recRes.data.tier || 'standard', tasks: recRes.data.tasks || [] }
    }
    if (gradeRes?.success) gradeByTaskId.value = buildGradeMap(gradeRes.data)

    if (hasClass) {
      if (annListRes?.success && Array.isArray(annListRes.data) && annListRes.data.length) {
        allAnnouncements.value = annListRes.data
      } else if (annLatestRes?.success && annLatestRes.data) {
        allAnnouncements.value = [annLatestRes.data]
      }
    }
  } catch (error) {
    console.error('获取任务列表失败:', error)
  } finally {
    loading.value = false
  }
}

watch(spaceCards, (cards) => {
  if (!cards.length) return
  if (!cards.some((c) => c.key === selectedSpaceKey.value)) {
    selectSpace('all')
  }
})

const viewTask = (taskId) => {
  router.push(`/student/tasks/${taskId}`)
}

const onTaskAction = (task) => {
  const grade = gradeByTaskId.value.get(task.id)
  if ((task.uiStatus === 'graded' || task.uiStatus === 'completed') && grade?.submission_id) {
    router.push(`/student/results/${grade.submission_id}`)
    return
  }
  viewTask(task.id)
}

onMounted(async () => {
  await userStore.fetchUserInfo()
  loadTasks({ background: false })
})

onActivated(() => {
  loadTasks({ background: true })
})

useRtOnDomains(
  ['tasks', 'task_templates', 'announcements', 'submission_student', 'grading', 'similarity', 'users'],
  () => {
    loadTasks({ background: true })
  }
)
</script>

<style scoped>
.stu-center-page {
  max-width: 1400px;
  margin: 0 auto;
  padding-bottom: 24px;
  min-height: 100%;
}

.page-head {
  margin-bottom: 16px;
}

.page-title {
  margin: 0 0 6px;
  font-size: 22px;
  font-weight: 600;
  color: #1f2d3d;
}

.page-desc {
  margin: 0;
  font-size: 14px;
  color: #6b7280;
  line-height: 1.55;
}

.section-label {
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 600;
  color: #1f2d3d;
}

.spaces-section {
  margin-bottom: 16px;
}

.spaces-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

@media (min-width: 768px) {
  .spaces-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1200px) {
  .spaces-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (min-width: 1440px) {
  .spaces-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

.spaces-empty {
  padding: 20px;
  background: #fff;
  border: 1px dashed #e5eaf2;
  border-radius: 12px;
  color: #6b7280;
  font-size: 14px;
  text-align: center;
}

.context-bar {
  margin-bottom: 14px;
  padding: 10px 14px;
  background: #eef5ff;
  border: 1px solid #dbeafe;
  border-radius: 10px;
  font-size: 14px;
  color: #6b7280;
}

.context-bar strong {
  color: #1d5fd6;
  font-weight: 600;
}

.context-label {
  margin-right: 4px;
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}

@media (min-width: 768px) {
  .stats-row {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
}

.stat-card {
  background: #fff;
  border: 1px solid #e5eaf2;
  border-radius: 12px;
  padding: 12px 10px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.stat-card:hover,
.stat-card--active {
  border-color: #1d5fd6;
  box-shadow: 0 0 0 1px rgba(29, 95, 214, 0.12);
}

.stat-card--warn .stat-num {
  color: #f59e0b;
}

.stat-card--ok .stat-num {
  color: #16a34a;
}

.stat-card--muted .stat-num {
  color: #6b7280;
}

.stat-num {
  display: block;
  font-size: 22px;
  font-weight: 700;
  color: #1d5fd6;
  line-height: 1.2;
}

.stat-lab {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: #6b7280;
}

.filter-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
  padding: 12px 14px;
  background: #fff;
  border: 1px solid #e5eaf2;
  border-radius: 12px;
}

.filter-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex: 1;
  min-width: 200px;
}

.filter-tab {
  border: 1px solid #e5eaf2;
  background: #f9fafb;
  color: #6b7280;
  font-size: 13px;
  padding: 5px 12px;
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.15s;
}

.filter-tab:hover {
  border-color: #cbd5e1;
  color: #1f2d3d;
}

.filter-tab--active {
  background: #eff6ff;
  border-color: #1d5fd6;
  color: #1d5fd6;
  font-weight: 500;
}

.filter-search {
  width: 100%;
  max-width: 240px;
}

@media (max-width: 640px) {
  .filter-search {
    max-width: 100%;
  }
}

.rec-section {
  background: #fff;
  border: 1px solid #e5eaf2;
  border-radius: 12px;
  padding: 14px 16px;
  margin-bottom: 16px;
}

.rec-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.rec-tier-tag {
  border-color: #dbeafe;
  color: #1d5fd6;
}

.rec-desc {
  margin: 8px 0 12px;
  font-size: 13px;
  color: #6b7280;
}

.rec-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rec-item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  padding: 10px 12px;
  border: 1px solid #e5eaf2;
  border-radius: 10px;
  cursor: pointer;
}

.rec-item:hover {
  background: #f9fafb;
}

.rec-item-main {
  flex: 1;
  min-width: 160px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.rec-item-main strong {
  font-size: 14px;
  color: #1f2d3d;
}

.rec-meta {
  font-size: 12px;
  color: #9ca3af;
}

.sk-main {
  padding: 12px 0;
}

.empty-panel {
  text-align: center;
  padding: 40px 20px;
  background: #fff;
  border: 1px solid #e5eaf2;
  border-radius: 12px;
  margin-bottom: 16px;
}

.empty-panel--muted {
  background: #f9fafb;
}

.empty-panel h3 {
  margin: 12px 0 8px;
  font-size: 16px;
  color: #1f2d3d;
}

.empty-panel p {
  margin: 0;
  font-size: 14px;
  color: #6b7280;
}

.empty-icon {
  font-size: 40px;
  color: #1d5fd6;
}

.task-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
}

@media (min-width: 768px) {
  .task-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1200px) {
  .task-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (min-width: 1440px) {
  .task-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

.ann-dialog-meta {
  margin: 0 0 12px;
  font-size: 13px;
  color: #6b7280;
}

.ann-dialog-body {
  white-space: pre-wrap;
  font-size: 14px;
  line-height: 1.65;
  color: #374151;
}

.ann-dialog-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 420px;
  overflow-y: auto;
}

.ann-card-dialog {
  padding: 12px 14px;
  border: 1px solid #e5eaf2;
  border-radius: 10px;
  background: #fff;
}

.ann-card-dialog--important {
  background: #fff7ed;
  border-left: 3px solid #f59e0b;
}

.ann-dialog-item-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.ann-type-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  background: #eff6ff;
  color: #1d5fd6;
  border: 1px solid #dbeafe;
}

.ann-time {
  font-size: 12px;
  color: #9ca3af;
}

.ann-dialog-item-title {
  margin: 0 0 6px;
  font-size: 15px;
  font-weight: 600;
}

.ann-dialog-item-summary {
  margin: 0 0 8px;
  font-size: 13px;
  color: #6b7280;
}
</style>
