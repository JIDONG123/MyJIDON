<template>
  <div class="exam-center">
    <header class="center-head">
      <div class="center-head__main">
        <h1 class="center-title">在线考试</h1>
        <p class="center-subtitle">
          在规定时间内进入考试，考试过程中将启用全屏作答与切屏检测，请认真阅读考试规则。
        </p>
        <div class="rule-tags">
          <el-tag size="small" effect="plain" type="danger">正式考试</el-tag>
          <el-tag size="small" effect="plain" type="primary">全屏作答</el-tag>
          <el-tag size="small" effect="plain" type="warning">切屏检测</el-tag>
          <el-tag size="small" effect="plain">成绩公布后可查看</el-tag>
        </div>
      </div>
    </header>

    <el-skeleton v-if="loading" animated :rows="10" class="list-skeleton" />

    <template v-else>
      <section v-if="rows.length" class="metric-grid">
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

      <div v-if="rows.length" class="panel filter-panel">
        <el-form inline class="filter-form" @submit.prevent>
          <el-form-item label="搜索">
            <el-input
              v-model="keyword"
              clearable
              placeholder="考试名称"
              style="width: 220px"
              :prefix-icon="Search"
            />
          </el-form-item>
          <el-form-item label="阶段">
            <el-select v-model="phaseFilter" clearable placeholder="全部" style="width: 132px">
              <el-option label="全部" value="" />
              <el-option label="进行中" value="active" />
              <el-option label="未开始" value="upcoming" />
              <el-option label="已结束" value="ended" />
            </el-select>
          </el-form-item>
        </el-form>
      </div>

      <div v-if="!rows.length" class="panel empty-panel">
        <el-empty :image-size="96">
          <template #description>
            <h3 class="empty-title">暂无在线考试</h3>
            <p class="empty-desc">老师发布正式考试后，你可以在这里进入考试或查看成绩。</p>
          </template>
        </el-empty>
      </div>

      <div v-else-if="!displayCards.length" class="panel empty-panel">
        <el-empty description="没有匹配的考试，请调整筛选条件" :image-size="80" />
      </div>

      <div v-else class="exam-grid">
        <article
          v-for="item in displayCards"
          :key="item.id"
          class="exam-card"
          :class="{ 'exam-card--disabled': item.displayAction.disabled }"
          tabindex="0"
          @click="onCardClick(item)"
          @keyup.enter="onCardClick(item)"
        >
          <div class="exam-card__head">
            <h3 class="exam-card__title" :title="item.title">{{ item.title || '未命名考试' }}</h3>
            <el-tag size="small" :type="item.displayPhase.tagType" effect="plain">
              {{ item.displayPhase.label }}
            </el-tag>
          </div>

          <div class="exam-card__meta">
            <div class="meta-row">
              <span class="meta-label">开始时间</span>
              <span class="meta-value">{{ formatDateTime(item.start_at) || '—' }}</span>
            </div>
            <div class="meta-row">
              <span class="meta-label">结束时间</span>
              <span class="meta-value">{{ formatDateTime(item.end_at) || '—' }}</span>
            </div>
          </div>

          <div class="exam-card__access">
            <span class="access-chip" :class="item.displayAccess.enterable ? 'access-chip--ok' : ''">
              {{ item.displayAccess.enterLabel }}
            </span>
            <span
              class="access-chip"
              :class="item.displayAccess.scoreReadable ? 'access-chip--score' : ''"
            >
              {{ item.displayAccess.scoreLabel }}
            </span>
          </div>

          <div class="exam-card__foot">
            <el-button
              :type="item.displayAction.buttonType"
              :plain="!!item.displayAction.plain"
              :disabled="item.displayAction.disabled"
              @click.stop="onCardClick(item)"
            >
              {{ item.displayAction.label }}
            </el-button>
          </div>
        </article>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Search, Collection, VideoPlay, Clock, CircleClose } from '@element-plus/icons-vue'
import { listStudentExams } from '../../api/qb'
import { formatDateTime } from '../../utils/format'
import { useRtOnDomains } from '../../composables/useRtOnDomains'
import {
  computeExamSummary,
  filterExamRows,
  enrichExamRow,
} from '../../utils/studentQbExamDisplay'

const router = useRouter()
const loading = ref(false)
const rows = ref([])
const keyword = ref('')
const phaseFilter = ref('')

const summary = computed(() => computeExamSummary(rows.value))

const statCards = computed(() => {
  const s = summary.value
  return [
    {
      key: 'total',
      label: '全部考试',
      value: s.total,
      hint: '已发布考试',
      icon: Collection,
      tone: 'blue',
    },
    {
      key: 'active',
      label: '进行中',
      value: s.active,
      hint: '可进入作答',
      icon: VideoPlay,
      tone: 'green',
    },
    {
      key: 'upcoming',
      label: '未开始',
      value: s.upcoming,
      hint: '等待开考',
      icon: Clock,
      tone: 'indigo',
    },
    {
      key: 'ended',
      label: '已结束',
      value: s.ended,
      hint: '考试已截止',
      icon: CircleClose,
      tone: 'gray',
    },
  ]
})

const displayCards = computed(() => {
  const filtered = filterExamRows(rows.value, {
    keyword: keyword.value,
    phase: phaseFilter.value,
  })
  return filtered.map(enrichExamRow)
})

const load = async () => {
  loading.value = true
  try {
    const res = await listStudentExams()
    if (res.success) rows.value = res.data || []
  } finally {
    loading.value = false
  }
}

const goTake = (row) => {
  router.push(`/student/qbank/exams/${row.id}/take`)
}

const onCardClick = (item) => {
  if (item.displayAction.disabled || !item.displayAction.route) return
  goTake(item)
}

useRtOnDomains(['qb_exams', 'scores'], () => load())

onMounted(load)
</script>

<style scoped>
.exam-center {
  min-height: 100%;
  padding-bottom: 24px;
  background: #eef2f7;
  margin: -16px -20px;
  padding: 16px 20px 24px;
}

.center-head {
  margin-bottom: 18px;
}

.center-title {
  margin: 0 0 8px;
  font-size: 24px;
  font-weight: 700;
  color: #0f172a;
}

.center-subtitle {
  margin: 0 0 12px;
  max-width: 42rem;
  font-size: 14px;
  line-height: 1.65;
  color: #64748b;
}

.rule-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
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
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  flex-shrink: 0;
  font-size: 20px;
}

.metric-card__icon--blue {
  background: #eff6ff;
  color: #1677ff;
}
.metric-card__icon--green {
  background: #f0fdf4;
  color: #16a34a;
}
.metric-card__icon--indigo {
  background: #eef2ff;
  color: #4f46e5;
}
.metric-card__icon--gray {
  background: #f8fafc;
  color: #64748b;
}

.metric-card__body {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.metric-card__value {
  font-size: 24px;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.2;
}

.metric-card__label {
  margin-top: 2px;
  font-size: 13px;
  font-weight: 600;
  color: #334155;
}

.metric-card__hint {
  margin-top: 2px;
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
  margin-bottom: 0;
  margin-right: 16px;
}

.filter-form :deep(.el-form-item__label) {
  font-weight: 600;
  color: #475569;
}

.list-skeleton {
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

.exam-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.exam-card {
  display: flex;
  flex-direction: column;
  background: #fff;
  border: 1px solid #e8edf3;
  border-radius: 12px;
  padding: 18px 18px 16px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
  cursor: pointer;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}

.exam-card:hover:not(.exam-card--disabled),
.exam-card:focus-visible:not(.exam-card--disabled) {
  border-color: #1677ff;
  box-shadow: 0 8px 24px rgba(22, 119, 255, 0.1);
  transform: translateY(-2px);
  outline: none;
}

.exam-card--disabled {
  cursor: default;
  opacity: 0.9;
}

.exam-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}

.exam-card__title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.4;
  flex: 1;
  min-width: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.exam-card__meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
}

.meta-label {
  color: #94a3b8;
  flex-shrink: 0;
}

.meta-value {
  color: #475569;
  font-weight: 600;
  text-align: right;
}

.exam-card__access {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}

.access-chip {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.access-chip--ok {
  color: #16a34a;
  background: #f0fdf4;
  border-color: #bbf7d0;
}

.access-chip--score {
  color: #1677ff;
  background: #eff6ff;
  border-color: #bfdbfe;
}

.exam-card__foot {
  display: flex;
  justify-content: flex-end;
  padding-top: 4px;
  border-top: 1px solid #f1f5f9;
  margin-top: auto;
}

.exam-card__foot .el-button {
  border-radius: 10px;
  font-weight: 600;
}

@media (max-width: 640px) {
  .exam-grid {
    grid-template-columns: 1fr;
  }
}
</style>
