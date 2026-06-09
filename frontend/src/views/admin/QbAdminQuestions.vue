<template>
  <div class="tw-page admin-qb-page">
    <header class="tw-head">
      <div class="tw-head__left">
        <div>
          <h1 class="tw-title">题库监管</h1>
          <p class="tw-subtitle">
            监管全平台教师题库建设、题目质量、题型分布与组卷使用情况。
          </p>
          <p class="tw-sub">管理员在此查看全平台题库，关注题目质量、教师建设情况与使用记录，不作为日常录题入口。</p>
        </div>
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

      <section v-if="qualityAlerts.length" class="quality-strip">
        <div class="quality-strip__label">
          <el-icon><Warning /></el-icon>
          题库质量提醒
        </div>
        <div class="quality-strip__items">
          <button
            v-for="item in qualityAlerts"
            :key="item.key"
            type="button"
            class="quality-chip"
            :class="{ 'quality-chip--static': item.count === '--' }"
            @click="item.count !== '--' && applyQualityFilter(item.key)"
          >
            <span>{{ item.label }}</span>
            <span class="quality-chip__count">{{ item.count }}</span>
          </button>
        </div>
        <el-button v-if="activeQualityFilter" link type="primary" @click="clearQualityFilter">清除</el-button>
      </section>

      <section class="tw-panel tw-filter-bar">
        <div class="filter-toolbar">
          <el-input
            v-model="filterQ"
            placeholder="搜索题干 / 课程标签 / 教师姓名"
            clearable
            class="filter-toolbar__search"
            @keyup.enter="applySearch"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
          <el-select
            v-model="filterTeacherId"
            clearable
            filterable
            placeholder="教师"
            class="filter-toolbar__select filter-toolbar__select--wide"
          >
            <el-option
              v-for="t in teacherOptions"
              :key="t.id"
              :label="`${t.real_name || t.username} (${t.username})`"
              :value="t.id"
            />
          </el-select>
          <el-select v-model="filterCourse" clearable filterable placeholder="课程" class="filter-toolbar__select">
            <el-option v-for="c in courseOptions" :key="c" :label="c" :value="c" />
          </el-select>
          <el-select v-model="filterType" clearable placeholder="题型" class="filter-toolbar__select">
            <el-option v-for="t in typeOpts" :key="t.v" :label="t.l" :value="t.v" />
          </el-select>
          <el-select v-model="filterDifficulty" clearable placeholder="难度" class="filter-toolbar__select">
            <el-option label="易" value="easy" />
            <el-option label="中" value="medium" />
            <el-option label="难" value="hard" />
          </el-select>
          <el-select v-model="filterRefStatus" clearable placeholder="引用状态" class="filter-toolbar__select">
            <el-option label="已引用" value="used" />
            <el-option label="未引用" value="unused" />
          </el-select>
          <el-select v-model="filterQuality" clearable placeholder="质量状态" class="filter-toolbar__select">
            <el-option label="正常" value="正常" />
            <el-option label="缺少答案" value="缺少答案" />
            <el-option label="缺少解析" value="缺少解析" />
            <el-option label="答案待核查" value="答案待核查" />
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
          <el-button type="primary" plain @click="applySearch">查询</el-button>
          <el-button v-if="hasActiveFilters" plain @click="resetFilters">重置</el-button>
        </div>
      </section>

      <section class="tw-panel">
        <div class="tw-panel__header">
          <h2 class="tw-panel__title">全平台题目列表</h2>
          <span class="tw-panel__meta">共 {{ displayTotal }} 题</span>
        </div>

        <div v-if="!loading && displayTotal === 0" class="tw-panel__body tw-empty-panel">
          <el-empty description="没有符合筛选条件的题目" :image-size="88" />
          <el-button v-if="hasActiveFilters" plain @click="resetFilters">清除筛选</el-button>
        </div>

        <div v-else class="tw-panel__body tw-panel__body--flush">
          <el-skeleton v-if="showSkeleton" animated :rows="8" />
          <template v-else>
            <el-table :data="pagedRows" class="qb-table" style="width: 100%">
              <el-table-column label="题目信息" min-width="220" show-overflow-tooltip>
                <template #default="{ row }">
                  <div class="info-cell">
                    <span class="info-cell__title">{{ qbStemSummary(row.stem) }}</span>
                    <span class="info-cell__sub">#{{ row.id }} · {{ row.course_label || '未标注课程' }}</span>
                  </div>
                </template>
              </el-table-column>

              <el-table-column label="归属信息" min-width="160" show-overflow-tooltip>
                <template #default="{ row }">
                  <div class="owner-cell">
                    <span class="owner-cell__name">{{ row.teacher_name || '—' }}</span>
                    <span class="owner-cell__sub">{{ row.teacher_username || '—' }}</span>
                    <span class="owner-cell__course">{{ row.course_label || '—' }}</span>
                  </div>
                </template>
              </el-table-column>

              <el-table-column label="题型 / 难度" width="130">
                <template #default="{ row }">
                  <div class="tag-stack">
                    <el-tag size="small" effect="light" type="primary">{{ qbTypeLabel(row.type) }}</el-tag>
                    <el-tag size="small" effect="light" :type="qbDifficultyTagType(row.difficulty)">
                      {{ qbDifficultyLabel(row.difficulty) }}
                    </el-tag>
                  </div>
                </template>
              </el-table-column>

              <el-table-column label="分值" width="72" align="right">
                <template #default="{ row }">{{ row.default_score ?? '—' }}</template>
              </el-table-column>

              <el-table-column label="质量状态" width="108">
                <template #default="{ row }">
                  <el-tag size="small" effect="light" :type="qbQualityMeta(row).type">
                    {{ qbQualityMeta(row).text }}
                  </el-tag>
                </template>
              </el-table-column>

              <el-table-column label="使用情况" min-width="140">
                <template #default="{ row }">
                  <div class="usage-cell">
                    <span>{{ usageLabel(row) }}</span>
                    <span v-if="row.last_used_at" class="usage-cell__sub">
                      最近 {{ formatDateTime(row.last_used_at) }}
                    </span>
                  </div>
                </template>
              </el-table-column>

              <el-table-column label="创建时间" width="168">
                <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
              </el-table-column>

              <el-table-column label="操作" min-width="240" align="right" fixed="right">
                <template #default="{ row }">
                  <div class="table-row-actions">
                    <el-button type="primary" size="small" plain @click="openDetail(row)">查看详情</el-button>
                    <el-button size="small" plain @click="openUsage(row)">使用记录</el-button>
                  </div>
                </template>
              </el-table-column>
            </el-table>

            <div class="pager-wrap">
              <el-pagination
                v-model:current-page="page"
                :page-size="pageSize"
                :total="displayTotal"
                layout="total, prev, pager, next"
                background
                @current-change="onPageChange"
              />
            </div>
          </template>
        </div>
      </section>

    <QbAdminDetailDrawer v-model:visible="drawerVisible" :question-id="drawerQuestionId" />

    <el-dialog v-model="usageDlg" title="题目使用记录" width="560px" destroy-on-close>
      <p v-if="usageQuestionTitle" class="usage-dialog__title">{{ usageQuestionTitle }}</p>
      <el-table v-loading="usageLoading" :data="usageRows" size="small" border>
        <el-table-column label="类型" width="100">
          <template #default="{ row }">{{ refTypeLabel(row.ref_type) }}</template>
        </el-table-column>
        <el-table-column prop="ref_title" label="标题" min-width="160" show-overflow-tooltip />
        <el-table-column label="时间" width="168">
          <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onActivated } from 'vue'
import { Search, Warning, List, User, Reading, Cpu, Calendar, Link } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { listAdminQuestions, getAdminQuestionUsage } from '../../api/qb'
import { getTeacherUsers } from '../../api/user'
import { qbDifficultyLabel, qbDifficultyTagType, qbTypeLabel } from '../../utils/qbLabels'
import {
  qbStemSummary,
  qbQualityMeta,
  qbQualityAlerts,
  isWithinDays,
} from '../../utils/qbQuestionQuality'
import { formatDateTime } from '../../utils/format'
import QbAdminDetailDrawer from '../../components/admin/QbAdminDetailDrawer.vue'
import { usePageCacheStore } from '../../stores/pageCache'
import { useDelayedSkeleton } from '../../utils/useDelayedLoading'

const pageCache = usePageCacheStore()
const PAGE_CACHE_KEY = 'admin:qb-questions'
const cached = pageCache.get(PAGE_CACHE_KEY)

const rows = ref(cached?.rows ?? [])
const statRows = ref(cached?.statRows ?? [])
const total = ref(cached?.total ?? 0)
const page = ref(1)
const pageSize = ref(20)
const loading = ref(false)
const refreshing = ref(false)
const showSkeleton = useDelayedSkeleton(computed(() => loading.value && !rows.value.length))
const teacherOptions = ref(cached?.teacherOptions ?? [])

const typeOpts = [
  { v: 'single', l: '单选' },
  { v: 'multi', l: '多选' },
  { v: 'judge', l: '判断' },
  { v: 'fill', l: '填空' },
  { v: 'short', l: '简答' },
  { v: 'code', l: '编程' },
]

const filterTeacherId = ref(null)
const filterType = ref('')
const filterQ = ref('')
const filterCourse = ref('')
const filterDifficulty = ref('')
const filterRefStatus = ref('')
const filterQuality = ref('')
const filterCreatedRange = ref(null)
const activeQualityFilter = ref('')

const drawerVisible = ref(false)
const drawerQuestionId = ref(null)
const usageDlg = ref(false)
const usageLoading = ref(false)
const usageRows = ref([])
const usageQuestionTitle = ref('')

const courseOptions = computed(() => {
  const set = new Set(statRows.value.map((r) => r.course_label).filter(Boolean))
  return [...set].sort()
})

const qualityAlerts = computed(() => qbQualityAlerts(statRows.value || []))

const overviewCards = computed(() => {
  const snap = statRows.value
  const teachers = new Set(snap.map((r) => r.teacher_id).filter(Boolean))
  const courses = new Set(snap.map((r) => r.course_label).filter(Boolean))
  const codeCount = snap.filter((r) => r.type === 'code').length
  const recent7 = snap.filter((r) => isWithinDays(r.created_at, 7)).length
  const referenced = snap.filter((r) => (Number(r.usage_count) || 0) > 0).length
  const snapLimited = statRows.value.length < total.value

  return [
    { key: 'total', label: '题目总数', value: total.value || snap.length, icon: List, tone: 'slate' },
    {
      key: 'teachers',
      label: '教师数',
      value: snapLimited && !teachers.size ? '--' : teachers.size || '--',
      icon: User,
      tone: 'blue',
    },
    {
      key: 'courses',
      label: '课程数',
      value: snapLimited && !courses.size ? '--' : courses.size || '--',
      icon: Reading,
      tone: 'indigo',
    },
    { key: 'code', label: '编程题数量', value: codeCount, icon: Cpu, tone: 'teal' },
    { key: 'recent', label: '近 7 日新增', value: recent7, icon: Calendar, tone: 'orange' },
    {
      key: 'ref',
      label: '被组卷引用题数',
      value: snapLimited && total.value > snap.length ? '--' : referenced,
      icon: Link,
      tone: 'violet',
    },
  ]
})

const needsClientFilter = computed(
  () =>
    !!filterCourse.value ||
    !!filterDifficulty.value ||
    !!filterRefStatus.value ||
    !!filterQuality.value ||
    !!filterCreatedRange.value?.length ||
    !!activeQualityFilter.value
)

const filteredRows = computed(() => {
  let list = needsClientFilter.value ? [...(statRows.value || [])] : [...(rows.value || [])]

  if (filterCourse.value) {
    list = list.filter((r) => r.course_label === filterCourse.value)
  }
  if (filterDifficulty.value) {
    list = list.filter((r) => r.difficulty === filterDifficulty.value)
  }
  if (filterRefStatus.value === 'used') {
    list = list.filter((r) => (Number(r.usage_count) || 0) > 0)
  } else if (filterRefStatus.value === 'unused') {
    list = list.filter((r) => (Number(r.usage_count) || 0) <= 0)
  }
  if (filterQuality.value) {
    list = list.filter((r) => qbQualityMeta(r).text === filterQuality.value)
  }
  if (filterCreatedRange.value?.length === 2) {
    const [start, end] = filterCreatedRange.value
    const s = new Date(`${start}T00:00:00`).getTime()
    const e = new Date(`${end}T23:59:59`).getTime()
    list = list.filter((r) => {
      const t = new Date(r.created_at).getTime()
      return Number.isFinite(t) && t >= s && t <= e
    })
  }
  if (activeQualityFilter.value === 'missing_answer') {
    list = list.filter((r) => qbQualityMeta(r).text === '缺少答案')
  } else if (activeQualityFilter.value === 'missing_explain') {
    list = list.filter((r) => qbQualityMeta(r).text === '缺少解析')
  } else if (activeQualityFilter.value === 'unused') {
    list = list.filter((r) => (Number(r.usage_count) || 0) === 0)
  } else if (activeQualityFilter.value === 'high_ref') {
    list = list.filter((r) => (Number(r.usage_count) || 0) >= 5)
  }

  return list
})

const displayTotal = computed(() => (needsClientFilter.value ? filteredRows.value.length : total.value))
const pagedRows = computed(() => {
  if (needsClientFilter.value) {
    const start = (page.value - 1) * pageSize.value
    return filteredRows.value.slice(start, start + pageSize.value)
  }
  return filteredRows.value
})

const hasActiveFilters = computed(
  () =>
    !!filterQ.value.trim() ||
    filterTeacherId.value ||
    filterType.value ||
    filterCourse.value ||
    filterDifficulty.value ||
    filterRefStatus.value ||
    filterQuality.value ||
    filterCreatedRange.value?.length ||
    activeQualityFilter.value
)

function usageLabel(row) {
  const n = Number(row.usage_count) || 0
  return n > 0 ? `${n} 次引用` : '未引用'
}

function refTypeLabel(t) {
  if (t === 'practice') return '习题练习'
  if (t === 'exam') return '在线考试'
  return t || '—'
}

function buildServerParams() {
  const params = { page: page.value, pageSize: pageSize.value }
  if (filterQ.value.trim()) params.q = filterQ.value.trim()
  if (filterType.value) params.type = filterType.value
  if (filterTeacherId.value) params.teacherId = filterTeacherId.value
  return params
}

async function loadStatSnapshot() {
  try {
    const params = { page: 1, pageSize: Math.min(Math.max(total.value, 20), 500) }
    if (filterTeacherId.value) params.teacherId = filterTeacherId.value
    if (filterType.value) params.type = filterType.value
    if (filterQ.value.trim()) params.q = filterQ.value.trim()
    const res = await listAdminQuestions(params)
    if (res.success) statRows.value = res.data || []
  } catch {
    statRows.value = rows.value
  }
}

async function load({ background = false } = {}) {
  const hasRows = rows.value.length > 0
  if (background && hasRows) refreshing.value = true
  else if (!hasRows) loading.value = true
  else refreshing.value = true
  try {
    if (needsClientFilter.value) {
      await loadStatSnapshot()
      rows.value = statRows.value
    } else {
      const res = await listAdminQuestions(buildServerParams())
      if (res.success) {
        rows.value = res.data || []
        total.value = res.total || 0
      }
      await loadStatSnapshot()
    }
    pageCache.set(PAGE_CACHE_KEY, {
      rows: rows.value,
      statRows: statRows.value,
      total: total.value,
      teacherOptions: teacherOptions.value,
    })
  } catch (e) {
    if (!hasRows) ElMessage.error(e?.response?.data?.message || '加载失败')
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

function applySearch() {
  page.value = 1
  load()
}

function onPageChange(p) {
  page.value = p
  if (!needsClientFilter.value) load()
}

function resetFilters() {
  filterTeacherId.value = null
  filterType.value = ''
  filterQ.value = ''
  filterCourse.value = ''
  filterDifficulty.value = ''
  filterRefStatus.value = ''
  filterQuality.value = ''
  filterCreatedRange.value = null
  activeQualityFilter.value = ''
  page.value = 1
  load()
}

function clearQualityFilter() {
  activeQualityFilter.value = ''
  page.value = 1
  load()
}

function applyQualityFilter(key) {
  activeQualityFilter.value = key
  page.value = 1
  load()
}

function openDetail(row) {
  drawerQuestionId.value = row.id
  drawerVisible.value = true
}

async function openUsage(row) {
  usageQuestionTitle.value = qbStemSummary(row.stem, 80)
  usageDlg.value = true
  usageLoading.value = true
  usageRows.value = []
  try {
    const res = await getAdminQuestionUsage(row.id)
    if (res.success) usageRows.value = res.data || []
  } catch {
    ElMessage.error('加载使用记录失败')
  } finally {
    usageLoading.value = false
  }
}

onMounted(async () => {
  const [_, teachersRes] = await Promise.all([
    load({ background: pageCache.has(PAGE_CACHE_KEY) }),
    getTeacherUsers({ page: 1, pageSize: 500 }),
  ])
  if (teachersRes.success) teacherOptions.value = teachersRes.data || []
})

onActivated(() => {
  load({ background: true })
})
</script>

<style scoped>
.admin-qb-page {
  max-width: 1400px;
}

.quality-strip {
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

.quality-strip__label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #b45309;
}

.quality-strip__items {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  flex: 1;
}

.quality-chip {
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
}

.quality-chip--static {
  cursor: default;
  opacity: 0.85;
}

.quality-chip__count {
  font-weight: 700;
}

.tw-filter-bar {
  padding: 16px 18px;
}

.filter-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.filter-toolbar__search {
  width: min(100%, 280px);
}

.filter-toolbar__select {
  width: 132px;
}

.filter-toolbar__select--wide {
  width: 180px;
}

.filter-toolbar__daterange {
  width: 260px;
}

.info-cell__title {
  display: block;
  font-weight: 600;
  color: #0f172a;
}

.info-cell__sub {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: #94a3b8;
}

.owner-cell__name {
  display: block;
  font-size: 13px;
  color: #334155;
}

.owner-cell__sub,
.owner-cell__course {
  display: block;
  font-size: 12px;
  color: #94a3b8;
}

.tag-stack {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
}

.usage-cell__sub {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  color: #94a3b8;
}

.pager-wrap {
  padding: 16px 18px;
  display: flex;
  justify-content: flex-end;
}

.usage-dialog__title {
  margin: 0 0 12px;
  font-size: 13px;
  color: #64748b;
}
</style>
