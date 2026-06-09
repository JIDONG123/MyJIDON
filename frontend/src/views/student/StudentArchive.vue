<template>
  <div class="growth-archive">
    <header class="archive-head">
      <div class="archive-head__main">
        <h1 class="archive-title">个人实训成长档案</h1>
        <p class="archive-subtitle">
          按时间沉淀实训提交、批改结果、教师评价与 AI 分析，形成个人学习成长记录。
        </p>
        <p class="archive-alias">个人实训电子档案</p>
      </div>
      <p class="archive-hint">成绩以教师复核后的最终评分为准 · 仅本人可见</p>
    </header>

    <el-skeleton v-if="showSkeleton" animated :rows="10" class="archive-skeleton" />

    <div v-else v-loading="refreshing">
      <section v-if="items.length" class="metric-grid">
        <div v-for="card in statCards" :key="card.key" class="metric-card">
          <div class="metric-card__icon" :class="`metric-card__icon--${card.tone}`">
            <el-icon><component :is="card.icon" /></el-icon>
          </div>
          <div class="metric-card__body">
            <span class="metric-card__value">{{ card.value }}</span>
            <span class="metric-card__label">{{ card.label }}</span>
            <span class="metric-card__hint">{{ card.hint }}</span>
          </div>
        </div>
      </section>

      <div v-if="items.length" class="panel filter-panel">
        <el-form inline class="filter-form" @submit.prevent>
          <el-form-item label="任务">
            <el-select
              v-model="filterTaskId"
              clearable
              placeholder="全部任务"
              style="width: 240px"
              @change="loadArchive"
            >
              <el-option
                v-for="t in taskOptions"
                :key="t.id"
                :label="taskOptionLabel(t)"
                :value="t.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="评价状态">
            <el-select v-model="statusFilter" clearable placeholder="全部" style="width: 140px">
              <el-option label="全部" value="" />
              <el-option label="AI已批改" value="ai_graded" />
              <el-option label="教师已复核" value="human_reviewed" />
              <el-option label="待批改" value="pending" />
            </el-select>
          </el-form-item>
          <el-form-item label="成绩">
            <el-select v-model="tierFilter" clearable placeholder="全部" style="width: 128px">
              <el-option label="全部" value="" />
              <el-option label="优秀" value="excellent" />
              <el-option label="良好" value="good" />
              <el-option label="待提升" value="fair" />
              <el-option label="需改进" value="poor" />
            </el-select>
          </el-form-item>
          <el-form-item label="搜索">
            <el-input
              v-model="keyword"
              clearable
              placeholder="任务 / 评语 / 薄弱点"
              style="width: 220px"
              :prefix-icon="Search"
            />
          </el-form-item>
        </el-form>
      </div>

      <div v-if="!items.length" class="panel empty-panel">
        <el-empty :image-size="96">
          <template #description>
            <h3 class="empty-title">暂无实训档案</h3>
            <p class="empty-desc">
              完成实训任务并通过批改后，系统会在这里沉淀你的提交记录、成绩反馈、教师评价和能力分析。
            </p>
          </template>
          <el-button type="primary" @click="goTasks">去实训中心</el-button>
        </el-empty>
      </div>

      <div v-else-if="!displayRows.length" class="panel empty-panel">
        <el-empty description="没有匹配的档案记录，请调整筛选条件" :image-size="80" />
      </div>

      <div v-else class="timeline-panel">
        <div class="timeline-panel__head">
          <h2 class="timeline-panel__title">成长时间轴</h2>
          <span class="timeline-panel__meta">
            共 {{ items.length }} 条 · 当前显示 {{ displayRows.length }} 条
          </span>
        </div>

        <el-timeline class="growth-timeline">
          <el-timeline-item
            v-for="(row, index) in displayRows"
            :key="row.submission_id"
            placement="top"
            :hide-timestamp="true"
            type="primary"
          >
            <div class="timeline-node">
              <time class="timeline-node__time">{{ formatDateTime(row.submitted_at) }}</time>
              <span v-if="index === 0" class="timeline-node__badge">最近</span>
            </div>

            <article
              class="record-card"
              :class="{
                'record-card--latest': index === 0,
                [`record-card--${row.cardAccent}`]: true,
              }"
            >
              <header class="record-card__head">
                <div class="record-card__head-main">
                  <h3 class="record-card__title">{{ row.task_title }}</h3>
                  <el-tag size="small" effect="plain" :type="row.statusMeta.tagType">
                    {{ row.statusMeta.label }}
                  </el-tag>
                </div>
                <div class="record-card__score-badge">
                  <span class="record-card__score" :class="scoreClass(row)">{{ row.scoreText }}</span>
                  <el-tag
                    v-if="row.scoreTier.label"
                    size="small"
                    effect="plain"
                    :class="`score-tier score-tier--${row.scoreTier.tone}`"
                  >
                    {{ row.scoreTier.label }}
                  </el-tag>
                </div>
              </header>

              <dl class="record-meta">
                <div class="record-meta__item">
                  <dt>截止时间</dt>
                  <dd>{{ formatDateTime(row.deadline) }}</dd>
                </div>
                <div class="record-meta__item">
                  <dt>提交时间</dt>
                  <dd>{{ formatDateTime(row.submitted_at) }}</dd>
                </div>
                <div class="record-meta__item">
                  <dt>综合得分</dt>
                  <dd :class="scoreClass(row)">{{ row.scoreText }}</dd>
                </div>
                <div class="record-meta__item">
                  <dt>评价等级</dt>
                  <dd>{{ row.scoreTier.label || '—' }}</dd>
                </div>
              </dl>

              <section v-if="row.humanComment" class="record-block record-block--teacher">
                <h4 class="record-block__title">教师评价</h4>
                <p
                  class="record-block__text"
                  :class="{ 'record-block__text--clamp': !isExpanded(row, 'human') }"
                >
                  {{ row.humanComment }}
                </p>
                <button
                  v-if="row.humanComment.length > 120"
                  type="button"
                  class="record-block__toggle"
                  @click="toggleExpand(row, 'human')"
                >
                  {{ isExpanded(row, 'human') ? '收起' : '展开全文' }}
                </button>
              </section>

              <section v-if="row.aiComment" class="record-block record-block--ai">
                <h4 class="record-block__title">AI 分析</h4>
                <p
                  class="record-block__text"
                  :class="{ 'record-block__text--clamp': !isExpanded(row, 'ai') }"
                >
                  {{ row.aiComment }}
                </p>
                <button
                  v-if="row.aiComment.length > 120"
                  type="button"
                  class="record-block__toggle"
                  @click="toggleExpand(row, 'ai')"
                >
                  {{ isExpanded(row, 'ai') ? '收起' : '展开全文' }}
                </button>
              </section>

              <section v-if="row.weakTags.length" class="record-block record-block--weak">
                <h4 class="record-block__title">薄弱知识点</h4>
                <div class="weak-tags">
                  <el-tag
                    v-for="(tag, ti) in row.weakTags"
                    :key="ti"
                    size="small"
                    effect="plain"
                    type="warning"
                    class="weak-tag"
                    :title="tag.title"
                  >
                    {{ tag.text }}
                  </el-tag>
                </div>
              </section>

              <section v-if="row.improvementTexts.length" class="record-block record-block--improve">
                <h4 class="record-block__title">改进建议</h4>
                <p
                  v-for="(text, ii) in row.improvementTexts"
                  :key="ii"
                  class="record-block__text record-block__text--improve"
                  :class="{ 'record-block__text--clamp': !isExpanded(row, 'improve') }"
                >
                  {{ text }}
                </p>
                <button
                  v-if="row.improvementTexts.some((t) => t.length > 120)"
                  type="button"
                  class="record-block__toggle"
                  @click="toggleExpand(row, 'improve')"
                >
                  {{ isExpanded(row, 'improve') ? '收起' : '展开全文' }}
                </button>
              </section>

              <footer class="record-card__actions">
                <el-button
                  v-if="row.canViewReport"
                  type="primary"
                  plain
                  size="small"
                  @click="viewResult(row.submission_id)"
                >
                  查看成绩报告
                </el-button>
                <el-button
                  v-if="row.task_id"
                  size="small"
                  @click="viewTask(row.task_id)"
                >
                  查看提交详情
                </el-button>
              </footer>
            </article>
          </el-timeline-item>
        </el-timeline>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onActivated, reactive } from 'vue'
import { useRouter } from 'vue-router'
import {
  Search,
  Document,
  CircleCheck,
  TrendCharts,
  Trophy,
  Warning,
} from '@element-plus/icons-vue'
import { getMyArchive } from '../../api/user'
import { getAllTasks } from '../../api/task'
import { useUserStore } from '../../stores/user'
import { formatDateTime } from '../../utils/format'
import {
  computeArchiveSummary,
  filterArchiveRows,
  enrichArchiveRow,
} from '../../utils/studentArchiveDisplay'
import { usePageCacheStore } from '../../stores/pageCache'
import { useDelayedSkeleton } from '../../utils/useDelayedLoading'

const router = useRouter()
const userStore = useUserStore()
const pageCache = usePageCacheStore()
const CACHE_KEY = 'student:archive'
const cached = pageCache.get(CACHE_KEY)
const loading = ref(!cached?.items?.length)
const refreshing = ref(false)
const items = ref(cached?.items ?? [])
const showSkeleton = useDelayedSkeleton(computed(() => loading.value && !items.value.length))
const taskOptions = ref(cached?.taskOptions ?? [])
const filterTaskId = ref(null)
const keyword = ref('')
const statusFilter = ref('')
const tierFilter = ref('')
const expandedKeys = reactive(new Set())

const summary = computed(() => computeArchiveSummary(items.value))

const statCards = computed(() => [
  {
    key: 'total',
    label: '累计实训',
    value: summary.value.total,
    hint: '提交记录',
    icon: Document,
    tone: 'blue',
  },
  {
    key: 'reviewed',
    label: '已复核',
    value: summary.value.reviewed,
    hint: '教师已确认',
    icon: CircleCheck,
    tone: 'green',
  },
  {
    key: 'avg',
    label: '平均分',
    value: summary.value.avgScore,
    hint: '综合得分均值',
    icon: TrendCharts,
    tone: 'teal',
  },
  {
    key: 'max',
    label: '最高分',
    value: summary.value.maxScore,
    hint: '历史最佳',
    icon: Trophy,
    tone: 'indigo',
  },
  {
    key: 'weak',
    label: '薄弱点',
    value: summary.value.weakPointCount || summary.value.needImproveCount || 0,
    hint: '待加强能力项',
    icon: Warning,
    tone: 'orange',
  },
])

const displayRows = computed(() =>
  filterArchiveRows(items.value, {
    keyword: keyword.value,
    status: statusFilter.value,
    tier: tierFilter.value,
  }).map(enrichArchiveRow)
)

function expandKey(row, section) {
  return `${row.submission_id}:${section}`
}

function isExpanded(row, section) {
  return expandedKeys.has(expandKey(row, section))
}

function toggleExpand(row, section) {
  const key = expandKey(row, section)
  if (expandedKeys.has(key)) expandedKeys.delete(key)
  else expandedKeys.add(key)
}

function scoreClass(row) {
  const tone = row.scoreTier?.tone
  return tone && tone !== 'muted' ? `score-text--${tone}` : ''
}

function taskOptionLabel(task) {
  const tag = task.teaching_class_id ? '教学班' : '行政班'
  return `${task.title} · ${tag}`
}

async function loadTaskOptions() {
  try {
    const res = await getAllTasks()
    if (res.success) taskOptions.value = res.data || []
    else taskOptions.value = []
  } catch (_) {
    taskOptions.value = []
  }
}

async function loadArchive({ background = false } = {}) {
  const hasData = items.value.length > 0
  if (background && hasData) refreshing.value = true
  else if (!hasData) loading.value = true
  else refreshing.value = true
  try {
    const params = {}
    if (filterTaskId.value) params.taskId = filterTaskId.value
    const res = await getMyArchive(params)
    if (res.success) items.value = res.data || []
    else if (!hasData) items.value = []
    pageCache.set(CACHE_KEY, { items: items.value, taskOptions: taskOptions.value })
  } catch (_) {
    if (!hasData) items.value = []
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

function viewResult(submissionId) {
  router.push(`/student/results/${submissionId}`)
}

function viewTask(taskId) {
  router.push(`/student/tasks/${taskId}`)
}

function goTasks() {
  router.push('/student/tasks')
}

onMounted(async () => {
  await userStore.fetchUserInfo()
  await Promise.all([
    loadTaskOptions(),
    loadArchive({ background: pageCache.has(CACHE_KEY) }),
  ])
})

onActivated(() => {
  loadArchive({ background: true })
})
</script>

<style scoped>
.growth-archive {
  max-width: 980px;
  margin: -20px -24px -36px;
  padding: 20px 24px 36px;
  min-height: calc(100vh - 120px);
  background: #eef2f7;
  box-sizing: border-box;
}

.archive-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}

.archive-title {
  margin: 0 0 8px;
  font-size: 24px;
  font-weight: 700;
  color: #0f172a;
  letter-spacing: -0.02em;
}

.archive-subtitle {
  margin: 0;
  max-width: 40rem;
  font-size: 14px;
  line-height: 1.65;
  color: #64748b;
}

.archive-alias {
  margin: 6px 0 0;
  font-size: 12px;
  color: #94a3b8;
}

.archive-hint {
  margin: 4px 0 0;
  font-size: 12px;
  color: #94a3b8;
  padding: 8px 12px;
  background: #fff;
  border: 1px solid #e8edf3;
  border-radius: 8px;
  white-space: nowrap;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
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

.metric-card__icon {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}

.metric-card__icon--blue { background: #eff6ff; color: #1677ff; }
.metric-card__icon--green { background: #f0fdf4; color: #16a34a; }
.metric-card__icon--teal { background: #f0fdfa; color: #0d9488; }
.metric-card__icon--orange { background: #fff7ed; color: #ea580c; }
.metric-card__icon--indigo { background: #eef2ff; color: #4f46e5; }

.metric-card__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.metric-card__value {
  font-size: 24px;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
}

.metric-card__label {
  font-size: 13px;
  font-weight: 600;
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
  margin-bottom: 16px;
}

.filter-panel {
  padding: 14px 16px;
}

.filter-form :deep(.el-form-item) {
  margin-bottom: 8px;
  margin-right: 16px;
}

.filter-form :deep(.el-form-item__label) {
  font-weight: 600;
  color: #475569;
}

.archive-skeleton {
  padding: 16px;
  background: #fff;
  border-radius: 12px;
  border: 1px solid #e8edf3;
}

.empty-panel {
  padding: 32px 20px;
}

.empty-title {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 600;
  color: #0f172a;
}

.empty-desc {
  margin: 0 auto;
  max-width: 28rem;
  font-size: 14px;
  line-height: 1.6;
  color: #64748b;
}

.timeline-panel {
  background: #fff;
  border: 1px solid #e8edf3;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
  padding: 16px 20px 8px;
}

.timeline-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  padding-bottom: 12px;
  border-bottom: 1px solid #eef2f7;
}

.timeline-panel__title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.timeline-panel__meta {
  font-size: 12px;
  color: #94a3b8;
}

.growth-timeline {
  padding-left: 4px;
}

.growth-timeline :deep(.el-timeline-item__node) {
  background: #1677ff;
  border-color: #1677ff;
}

.growth-timeline :deep(.el-timeline-item__tail) {
  border-left-color: #cbd5e1;
}

.timeline-node {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.timeline-node__time {
  font-size: 13px;
  font-weight: 600;
  color: #475569;
  font-variant-numeric: tabular-nums;
}

.timeline-node__badge {
  font-size: 11px;
  font-weight: 600;
  color: #1677ff;
  background: #eff6ff;
  padding: 2px 8px;
  border-radius: 999px;
}

.record-card {
  position: relative;
  background: #fff;
  border: 1px solid #e8edf3;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
  padding: 16px 16px 14px 20px;
  margin-bottom: 4px;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.record-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 12px;
  bottom: 12px;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: #94a3b8;
}

.record-card--excellent::before { background: #16a34a; }
.record-card--good::before { background: #1677ff; }
.record-card--fair::before { background: #d97706; }
.record-card--poor::before { background: #dc2626; }

.record-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.08);
}

.record-card--latest {
  border-color: #bfdbfe;
  background: #fafcff;
}

.record-card__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}

.record-card__head-main {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.record-card__title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.4;
}

.record-card__score-badge {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  flex-shrink: 0;
}

.record-card__score {
  font-size: 22px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: #0f172a;
}

.score-text--excellent,
.record-card__score.score-text--excellent { color: #16a34a; }
.score-text--good,
.record-card__score.score-text--good { color: #1677ff; }
.score-text--fair,
.record-card__score.score-text--fair { color: #d97706; }
.score-text--poor,
.record-card__score.score-text--poor { color: #dc2626; }

.score-tier {
  border: none !important;
  font-size: 11px;
  padding: 0 6px;
  height: 20px;
}

.score-tier--excellent { background: #f0fdf4; color: #16a34a; }
.score-tier--good { background: #eff6ff; color: #1677ff; }
.score-tier--fair { background: #fffbeb; color: #d97706; }
.score-tier--poor { background: #fef2f2; color: #dc2626; }

.record-meta {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px 16px;
  margin: 0 0 14px;
  padding: 12px 14px;
  background: #f8fafc;
  border-radius: 8px;
}

.record-meta__item {
  margin: 0;
}

.record-meta__item dt {
  margin: 0 0 2px;
  font-size: 11px;
  color: #94a3b8;
  font-weight: 500;
}

.record-meta__item dd {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: #334155;
}

.record-block {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed #e8edf3;
}

.record-block__title {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 700;
  color: #334155;
}

.record-block--teacher .record-block__title { color: #1e3a5f; }
.record-block--ai .record-block__title { color: #0d9488; }
.record-block--weak .record-block__title { color: #b45309; }
.record-block--improve .record-block__title { color: #64748b; }

.record-block__text {
  margin: 0;
  font-size: 14px;
  line-height: 1.65;
  color: #475569;
  white-space: pre-wrap;
  word-break: break-word;
}

.record-block__text--clamp {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.record-block__text--improve + .record-block__text--improve {
  margin-top: 8px;
}

.record-block__toggle {
  margin-top: 6px;
  padding: 0;
  border: none;
  background: none;
  font-size: 12px;
  font-weight: 600;
  color: #1677ff;
  cursor: pointer;
}

.record-block__toggle:hover {
  text-decoration: underline;
}

.weak-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.weak-tag {
  max-width: 100%;
}

.record-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid #eef2f7;
}

@media (max-width: 768px) {
  .archive-hint {
    white-space: normal;
    width: 100%;
  }

  .record-card__head {
    flex-direction: column;
  }

  .record-card__score-badge {
    align-items: flex-start;
  }

  .metric-grid {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
