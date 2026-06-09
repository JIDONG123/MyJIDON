<template>
  <div class="class-workbench">
    <header class="workbench-head">
      <div class="workbench-head__left">
        <el-button class="back-btn" @click="$router.push('/teacher/classes')">
          <el-icon><ArrowLeft /></el-icon>
          返回班级列表
        </el-button>
        <div v-if="cls" class="workbench-head__info">
          <h1 class="workbench-title">{{ cls.class_name }}</h1>
          <p class="workbench-meta">
            <span>{{ cls.major || '—' }} · {{ cls.grade || '—' }}</span>
            <span class="meta-dot">·</span>
            <span>{{ cls.studentCount ?? 0 }} 名学生</span>
            <span class="meta-dot">·</span>
            <span>已发布 {{ classTasks.length }} 个任务</span>
            <span class="meta-dot">·</span>
            <span>任课教师 {{ teacherLabel }}</span>
            <span v-if="lastUpdatedLabel" class="meta-dot">·</span>
            <span v-if="lastUpdatedLabel">最近更新 {{ lastUpdatedLabel }}</span>
          </p>
        </div>
      </div>
      <div v-if="cls" class="workbench-head__actions">
        <el-button type="primary" @click="goCreateTask">
          <el-icon><DocumentAdd /></el-icon>
          发布任务
        </el-button>
        <el-button @click="goAnnounceMgmt">
          <el-icon><Bell /></el-icon>
          发布公告
        </el-button>
        <el-button @click="goStudentMgmt">
          <el-icon><UserFilled /></el-icon>
          学生管理
        </el-button>
      </div>
    </header>

    <el-skeleton v-if="loading" animated :rows="8" class="workbench-skeleton" />

    <el-alert v-else-if="errorMsg" type="error" :title="errorMsg" show-icon :closable="false" class="err-alert" />

    <template v-else-if="cls">
      <section class="metric-grid">
        <div v-for="card in overviewCards" :key="card.key" class="metric-card metric-card--static">
          <div class="metric-card__icon" :class="`metric-card__icon--${card.tone}`">
            <el-icon><component :is="card.icon" /></el-icon>
          </div>
          <div class="metric-card__body">
            <span class="metric-card__value">{{ card.value }}</span>
            <span class="metric-card__label">{{ card.label }}</span>
            <span v-if="card.hint" class="metric-card__hint">{{ card.hint }}</span>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="panel__header">
          <h2 class="panel__title">功能入口</h2>
          <span class="panel__meta">发布任务将默认选中本班级；列表、统计与知识图谱自动带入当前班级</span>
        </div>
        <div class="entry-grid">
          <button
            v-for="entry in functionEntries"
            :key="entry.key"
            type="button"
            class="entry-card"
            @click="entry.action()"
          >
            <div class="entry-card__icon" :class="`entry-card__icon--${entry.tone}`">
              <el-icon><component :is="entry.icon" /></el-icon>
            </div>
            <span class="entry-card__label">{{ entry.label }}</span>
            <span v-if="entry.hint" class="entry-card__hint">{{ entry.hint }}</span>
          </button>
        </div>
      </section>

      <el-row :gutter="16" class="dual-row">
        <el-col :xs="24" :lg="12">
          <div class="panel panel--fill">
            <div class="panel__header">
              <h2 class="panel__title">最近任务</h2>
              <el-button link type="primary" @click="goClassTasks">全部任务</el-button>
            </div>
            <div v-loading="tasksLoading" class="panel__body">
              <template v-if="recentTasks.length">
                <ul class="task-list">
                  <li v-for="task in recentTasks" :key="task.id" class="task-item">
                    <div class="task-item__main">
                      <span class="task-item__title">{{ task.title }}</span>
                      <div class="task-item__meta">
                        <el-tag :type="deadlineMeta(task.deadline).tagType" size="small" effect="light">
                          {{ formatDeadline(task.deadline) }}
                        </el-tag>
                        <span class="task-item__progress">
                          {{ task.submittedStudentCount ?? 0 }} / {{ task.classStudentCount ?? '—' }} 已提交
                        </span>
                      </div>
                      <el-progress
                        :percentage="progressPercent(task)"
                        :stroke-width="6"
                        :show-text="false"
                        color="#1677ff"
                        class="task-item__bar"
                      />
                    </div>
                    <el-button type="primary" link @click="goSubmissions(task.id)">查看提交</el-button>
                  </li>
                </ul>
              </template>
              <el-empty v-else description="暂无任务，去发布任务" :image-size="72" class="panel-empty">
                <el-button type="primary" @click="goCreateTask">发布任务</el-button>
              </el-empty>
            </div>
          </div>
        </el-col>
        <el-col :xs="24" :lg="12">
          <div class="panel panel--fill">
            <div class="panel__header">
              <h2 class="panel__title">本班公告</h2>
              <el-button link type="primary" @click="goAnnounceMgmt">公告管理</el-button>
            </div>
            <div v-loading="previewLoading" class="panel__body">
              <template v-if="previewList.length">
                <ul class="ann-list">
                  <li
                    v-for="(a, idx) in previewList"
                    :key="a.id"
                    class="ann-item"
                    @click="openPreviewDetail(a)"
                  >
                    <div class="ann-item__main">
                      <div class="ann-item__title-row">
                        <span class="ann-item__title">{{ a.title }}</span>
                        <el-tag v-if="idx === 0" size="small" type="warning" effect="light">最新</el-tag>
                      </div>
                      <time class="ann-item__time">{{ formatDateTime(a.created_at) }}</time>
                    </div>
                    <el-button type="primary" link @click.stop="goAnnounceMgmt">管理</el-button>
                  </li>
                </ul>
              </template>
              <el-empty v-else description="暂无公告，去发布公告" :image-size="72" class="panel-empty">
                <el-button type="primary" @click="goAnnounceMgmt">发布公告</el-button>
              </el-empty>
            </div>
          </div>
        </el-col>
      </el-row>

      <section class="panel panel--advanced">
        <el-collapse v-model="advancedOpen" class="advanced-collapse">
          <el-collapse-item name="rec-rules">
            <template #title>
              <div class="advanced-title">
                <el-icon class="advanced-title__icon"><Setting /></el-icon>
                <span>高级设置 · 分层推荐规则（本班）</span>
              </div>
            </template>
            <el-collapse v-model="recRulesDescOpen" class="desc-collapse">
              <el-collapse-item name="desc">
                <template #title>
                  <span class="collapse-title">规则说明</span>
                  <span class="collapse-hint">（可收起）</span>
                </template>
                <div class="desc-body">
                  控制学生首页「推荐任务」的难度档位：低于「巩固线」或维度明显薄弱时优先推荐<strong>基础</strong>难度未交任务；达到「挑战线」且无显著薄弱时优先推荐<strong>进阶</strong>。仅筛选已发布任务，不新增、不覆盖您手动发布的任务。
                </div>
              </el-collapse-item>
            </el-collapse>
            <div class="rec-form-block">
              <el-form label-position="top" class="rec-form" @submit.prevent>
                <el-row :gutter="20">
                  <el-col :xs="24" :sm="8" :md="6">
                    <el-form-item label="巩固线（分）">
                      <el-input-number
                        v-model="recRules.basicBelow"
                        :min="1"
                        :max="99"
                        :step="1"
                        controls-position="right"
                        class="rec-input-num"
                      />
                    </el-form-item>
                  </el-col>
                  <el-col :xs="24" :sm="8" :md="6">
                    <el-form-item label="挑战线（分）">
                      <el-input-number
                        v-model="recRules.advancedAbove"
                        :min="1"
                        :max="100"
                        :step="1"
                        controls-position="right"
                        class="rec-input-num"
                      />
                    </el-form-item>
                  </el-col>
                  <el-col :xs="24" :sm="24" :md="12" class="rec-actions-col">
                    <el-form-item label=" " class="rec-actions-item">
                      <div class="rec-btns">
                        <el-button type="primary" :loading="recRulesSaving" @click="saveRecRules">保存规则</el-button>
                        <el-button @click="loadRecRules">重置为已保存</el-button>
                      </div>
                    </el-form-item>
                  </el-col>
                </el-row>
              </el-form>
            </div>
            <p v-if="recRulesHint" class="api-hint">{{ recRulesHint }}</p>
          </el-collapse-item>
        </el-collapse>
      </section>
    </template>

    <el-dialog v-model="previewDetailVisible" title="公告详情" width="520px" destroy-on-close>
      <template v-if="previewDetail">
        <p class="detail-time">{{ formatDateTime(previewDetail.created_at) }}</p>
        <h3 class="detail-title">{{ previewDetail.title }}</h3>
        <div class="detail-content">{{ previewDetail.content || '（无正文）' }}</div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  ArrowLeft,
  Bell,
  Document,
  DocumentAdd,
  List,
  Setting,
  Share,
  TrendCharts,
  User,
  UserFilled,
  Warning,
} from '@element-plus/icons-vue'
import { useUserStore } from '../../stores/user'
import { getMyTeachingOverview, listClassAnnouncements } from '../../api/class'
import { getTasksByClass } from '../../api/task'
import { formatDateTime } from '../../utils/format'
import { getClassRecommendationRules, putClassRecommendationRules } from '../../api/analytics'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const loading = ref(true)
const errorMsg = ref('')
const overviewRow = ref(null)
const classTasks = ref([])
const tasksLoading = ref(false)

const recRules = reactive({ basicBelow: 62, advancedAbove: 86 })
const recRulesSaving = ref(false)
const recRulesHint = ref('')
const recRulesDescOpen = ref([])
const advancedOpen = ref([])

const previewLoading = ref(false)
const previewList = ref([])
const previewDetailVisible = ref(false)
const previewDetail = ref(null)

const cls = computed(() => overviewRow.value)
const classId = computed(() => route.params.id)

const teacherLabel = computed(() => {
  const u = userStore.user
  return u?.real_name || u?.realName || u?.username || '—'
})

const completedTaskCount = computed(() =>
  classTasks.value.filter((t) => {
    const total = Number(t.classStudentCount)
    const sub = Number(t.submittedStudentCount ?? 0)
    return Number.isFinite(total) && total > 0 && sub >= total
  }).length
)

const pendingSubmitCount = computed(() =>
  classTasks.value.reduce((sum, t) => {
    const total = Number(t.classStudentCount) || Number(cls.value?.studentCount) || 0
    const sub = Number(t.submittedStudentCount ?? 0)
    return sum + Math.max(0, total - sub)
  }, 0)
)

const avgCompletionRate = computed(() => {
  let sum = 0
  let n = 0
  for (const t of classTasks.value) {
    const total = Number(t.classStudentCount)
    const sub = Number(t.submittedStudentCount ?? 0)
    if (Number.isFinite(total) && total > 0) {
      sum += Math.min(100, Math.round((sub / total) * 100))
      n += 1
    }
  }
  return n ? Math.round(sum / n) : 0
})

const nearestDeadlineTask = computed(() => {
  const now = Date.now()
  const withDeadline = classTasks.value.filter((t) => t.deadline && !Number.isNaN(new Date(t.deadline).getTime()))
  if (!withDeadline.length) return null
  const future = withDeadline
    .filter((t) => new Date(t.deadline).getTime() >= now)
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
  if (future.length) return future[0]
  return [...withDeadline].sort((a, b) => new Date(b.deadline) - new Date(a.deadline))[0]
})

const lastUpdatedLabel = computed(() => {
  const dates = []
  for (const t of classTasks.value) {
    if (t.updated_at) dates.push(new Date(t.updated_at))
    else if (t.created_at) dates.push(new Date(t.created_at))
  }
  for (const a of previewList.value) {
    if (a.created_at) dates.push(new Date(a.created_at))
  }
  if (!dates.length) return ''
  const latest = new Date(Math.max(...dates.map((d) => d.getTime())))
  return formatDateTime(latest)
})

const overviewCards = computed(() => [
  {
    key: 'students',
    label: '学生人数',
    value: cls.value?.studentCount ?? 0,
    icon: User,
    tone: 'blue',
  },
  {
    key: 'tasks',
    label: '任务总数',
    value: classTasks.value.length,
    icon: Document,
    tone: 'indigo',
  },
  {
    key: 'completed',
    label: '已完成任务',
    value: completedTaskCount.value,
    hint: '全员已提交',
    icon: List,
    tone: 'green',
  },
  {
    key: 'pending',
    label: '待提交',
    value: pendingSubmitCount.value,
    hint: '按名额估算',
    icon: Warning,
    tone: 'orange',
  },
  {
    key: 'rate',
    label: '平均完成率',
    value: `${avgCompletionRate.value}%`,
    icon: TrendCharts,
    tone: 'teal',
  },
  {
    key: 'deadline',
    label: '最近截止任务',
    value: nearestDeadlineTask.value?.title || '—',
    hint: nearestDeadlineTask.value?.deadline
      ? formatDeadline(nearestDeadlineTask.value.deadline)
      : '暂无截止任务',
    icon: DocumentAdd,
    tone: 'slate',
  },
])

const recentTasks = computed(() =>
  [...classTasks.value]
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .slice(0, 6)
)

const functionEntries = computed(() => [
  { key: 'create', label: '发布任务', hint: '新建本班实训', icon: DocumentAdd, tone: 'primary', action: goCreateTask },
  { key: 'tasks', label: '本班任务列表', icon: List, tone: 'blue', action: goClassTasks },
  { key: 'stats', label: '本班成绩统计', icon: TrendCharts, tone: 'teal', action: goClassStats },
  { key: 'graph', label: '本班知识图谱', icon: Share, tone: 'indigo', action: goKnowledgeGraph },
  { key: 'students', label: '学生管理', hint: `${cls.value?.studentCount ?? 0} 名学生`, icon: UserFilled, tone: 'slate', action: goStudentMgmt },
  { key: 'announce', label: '公告管理', icon: Bell, tone: 'orange', action: goAnnounceMgmt },
])

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
  if (diff <= 72 * 60 * 60 * 1000) return { statusText: '即将截止', tagType: 'warning' }
  return { statusText: '进行中', tagType: 'primary' }
}

function formatDeadline(deadline) {
  if (!deadline) return '未设置截止'
  const meta = deadlineMeta(deadline)
  return `${formatDateTime(deadline)} · ${meta.statusText}`
}

const loadRecRules = async () => {
  recRulesHint.value = ''
  try {
    const res = await getClassRecommendationRules(classId.value)
    if (res.success && res.data) {
      recRules.basicBelow = Number(res.data.basicBelow) || 62
      recRules.advancedAbove = Number(res.data.advancedAbove) || 86
    }
  } catch (e) {
    const msg = e?.response?.data?.message
    recRulesHint.value =
      msg || '无法加载推荐规则（若数据库未迁移，请执行 backend/sql/migration_class_recommendation_rules.sql）'
  }
}

const saveRecRules = async () => {
  recRulesSaving.value = true
  recRulesHint.value = ''
  try {
    const res = await putClassRecommendationRules(classId.value, {
      basicBelow: recRules.basicBelow,
      advancedAbove: recRules.advancedAbove,
    })
    if (res.success) {
      ElMessage.success('已保存分层推荐规则')
    }
  } catch (e) {
    recRulesHint.value = e?.response?.data?.message || '保存失败'
    ElMessage.error(recRulesHint.value)
  } finally {
    recRulesSaving.value = false
  }
}

const loadTasks = async () => {
  if (!classId.value) return
  tasksLoading.value = true
  try {
    const res = await getTasksByClass(classId.value)
    classTasks.value = res.success ? res.data || [] : []
  } catch {
    classTasks.value = []
  } finally {
    tasksLoading.value = false
  }
}

const loadPreview = async () => {
  if (!cls.value?.id) return
  previewLoading.value = true
  try {
    const res = await listClassAnnouncements(cls.value.id)
    if (res.success) {
      const all = res.data || []
      previewList.value = [...all]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 8)
    } else {
      previewList.value = []
    }
  } catch {
    previewList.value = []
  } finally {
    previewLoading.value = false
  }
}

const openPreviewDetail = (a) => {
  previewDetail.value = a
  previewDetailVisible.value = true
}

const goStudentMgmt = () => {
  router.push(`/teacher/classes/${classId.value}/students`)
}

const goAnnounceMgmt = () => {
  router.push({ path: '/teacher/class-announcements', query: { classId: String(classId.value) } })
}

const goCreateTask = () => {
  router.push({ path: '/teacher/tasks/create', query: { classId: String(classId.value) } })
}

const goClassTasks = () => {
  router.push({ path: '/teacher/tasks', query: { classId: String(classId.value) } })
}

const goClassStats = () => {
  router.push({ path: '/teacher/statistics', query: { classId: String(classId.value) } })
}

const goKnowledgeGraph = () => {
  router.push({ path: '/teacher/knowledge-graph', query: { classId: String(classId.value) } })
}

const goSubmissions = (taskId) => {
  router.push(`/teacher/submissions/${taskId}`)
}

const load = async () => {
  loading.value = true
  errorMsg.value = ''
  overviewRow.value = null
  classTasks.value = []
  try {
    const res = await getMyTeachingOverview()
    if (!res.success) {
      errorMsg.value = '加载失败'
      return
    }
    const row = (res.data || []).find((c) => String(c.id) === String(classId.value))
    if (!row) {
      errorMsg.value = '班级不存在或您无权管理该班级'
      return
    }
    overviewRow.value = row
    await Promise.all([loadRecRules(), loadTasks(), loadPreview()])
  } finally {
    loading.value = false
  }
}

onMounted(load)

watch(
  () => route.params.id,
  async () => {
    await load()
  }
)
</script>

<style scoped>
.class-workbench {
  max-width: 1360px;
  margin: 0 auto;
  padding: 20px 4px 40px;
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

.workbench-head__left {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 16px;
  flex: 1;
  min-width: 0;
}

.back-btn {
  border-radius: 10px;
  font-weight: 500;
  flex-shrink: 0;
}

.workbench-head__info {
  min-width: 0;
  flex: 1;
}

.workbench-title {
  margin: 0 0 10px;
  font-size: 24px;
  font-weight: 700;
  color: #0f172a;
  letter-spacing: -0.02em;
}

.workbench-meta {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: #64748b;
}

.meta-dot {
  margin: 0 4px;
  color: #cbd5e1;
}

.workbench-head__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.workbench-skeleton {
  padding: 12px 0;
}

.err-alert {
  border-radius: 12px;
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
  background: #fff;
  border: 1px solid #e8edf3;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
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
.metric-card__icon--green { background: #ecfdf5; color: #059669; }
.metric-card__icon--orange { background: #fff7ed; color: #ea580c; }
.metric-card__icon--teal { background: #f0fdfa; color: #0d9488; }
.metric-card__icon--primary { background: #eff6ff; color: var(--el-color-primary); }

.metric-card__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.metric-card__value {
  font-size: 22px;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.3;
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.metric-card__label {
  font-size: 13px;
  font-weight: 600;
  color: #64748b;
}

.metric-card__hint {
  font-size: 12px;
  color: #94a3b8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.panel {
  background: #fff;
  border: 1px solid #e8edf3;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
  margin-bottom: 20px;
}

.panel--fill {
  height: 100%;
  display: flex;
  flex-direction: column;
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
  max-width: 36rem;
  line-height: 1.5;
}

.panel__body {
  padding: 8px 12px 16px;
  flex: 1;
}

.panel-empty {
  padding: 16px 0;
}

.entry-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
  padding: 16px 18px 20px;
}

.entry-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 18px 12px;
  border: 1px solid #e8edf3;
  border-radius: 12px;
  background: #fff;
  cursor: pointer;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
}

.entry-card:hover {
  border-color: rgba(22, 119, 255, 0.35);
  box-shadow: 0 4px 14px rgba(15, 76, 129, 0.08);
  transform: translateY(-2px);
}

.entry-card__icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
}

.entry-card__icon--primary { background: #eff6ff; color: var(--el-color-primary); }
.entry-card__icon--blue { background: #eff6ff; color: #2563eb; }
.entry-card__icon--teal { background: #f0fdfa; color: #0d9488; }
.entry-card__icon--indigo { background: #eef2ff; color: #4f46e5; }
.entry-card__icon--slate { background: #f1f5f9; color: #475569; }
.entry-card__icon--orange { background: #fff7ed; color: #ea580c; }

.entry-card__label {
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
  text-align: center;
}

.entry-card__hint {
  font-size: 12px;
  color: #94a3b8;
}

.dual-row {
  margin-bottom: 4px;
}

.task-list,
.ann-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.task-item,
.ann-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 12px;
  border-radius: 10px;
  transition: background 0.18s ease;
}

.task-item:hover,
.ann-item:hover {
  background: #f8fafc;
}

.task-item + .task-item,
.ann-item + .ann-item {
  border-top: 1px solid #f1f5f9;
}

.task-item__main {
  flex: 1;
  min-width: 0;
}

.task-item__title {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-item__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.task-item__progress {
  font-size: 12px;
  color: #64748b;
}

.task-item__bar {
  max-width: 280px;
}

.ann-item {
  cursor: pointer;
}

.ann-item__main {
  flex: 1;
  min-width: 0;
}

.ann-item__title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.ann-item__title {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ann-item__time {
  font-size: 12px;
  color: #94a3b8;
}

.panel--advanced {
  padding: 0;
  overflow: hidden;
}

.advanced-collapse {
  border: none;
}

.advanced-collapse :deep(.el-collapse-item__header) {
  height: auto;
  min-height: 52px;
  padding: 14px 20px;
  font-size: 15px;
  font-weight: 600;
  color: #475569;
  background: #fafbfc;
  border-bottom: 1px solid #eef2f7;
}

.advanced-collapse :deep(.el-collapse-item__wrap) {
  border: none;
}

.advanced-collapse :deep(.el-collapse-item__content) {
  padding: 18px 20px 22px;
}

.advanced-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.advanced-title__icon {
  color: #64748b;
}

.desc-collapse {
  margin-bottom: 8px;
  border: none;
}

.desc-collapse :deep(.el-collapse-item__header) {
  font-size: 13px;
  font-weight: 600;
  color: #475569;
  background: #f8fafc;
  border-radius: 10px;
  padding: 0 14px;
  border: 1px solid #e2e8f0;
}

.desc-collapse :deep(.el-collapse-item__wrap) {
  border: none;
  background: transparent;
}

.desc-collapse :deep(.el-collapse-item__content) {
  padding: 12px 4px 4px;
}

.collapse-hint {
  margin-left: 6px;
  font-size: 12px;
  font-weight: 500;
  color: #94a3b8;
}

.desc-body {
  font-size: 13px;
  line-height: 1.7;
  color: #64748b;
  max-width: 56rem;
}

.rec-form-block {
  margin-top: 8px;
}

.rec-form :deep(.el-form-item__label) {
  font-size: 13px;
  font-weight: 600;
  color: #475569;
}

.rec-input-num {
  width: 100%;
  max-width: 200px;
}

.rec-actions-col {
  display: flex;
  align-items: flex-end;
}

.rec-actions-item :deep(.el-form-item__label) {
  visibility: hidden;
}

.rec-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.api-hint {
  margin: 14px 0 0;
  font-size: 13px;
  color: var(--el-color-danger);
}

.detail-time {
  margin: 0 0 8px;
  font-size: 12px;
  color: #94a3b8;
}

.detail-title {
  margin: 0 0 12px;
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
}

.detail-content {
  font-size: 14px;
  line-height: 1.75;
  color: #334155;
  white-space: pre-wrap;
}

@media (max-width: 768px) {
  .workbench-head__actions {
    width: 100%;
  }

  .workbench-head__actions .el-button {
    flex: 1;
  }

  .entry-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
