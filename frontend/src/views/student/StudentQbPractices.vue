<template>
  <div class="practice-center">
    <header class="center-head">
      <div class="center-head__main">
        <h1 class="center-title">习题练习</h1>
        <p class="center-subtitle">
          完成教师发布的课堂练习与课后测评，客观题自动评分，主观题由教师批改。
        </p>
      </div>
      <p class="center-hint">练习成绩用于过程性学习反馈，正式考试请前往「在线考试」</p>
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
              placeholder="练习名称"
              style="width: 220px"
              :prefix-icon="Search"
            />
          </el-form-item>
          <el-form-item label="状态">
            <el-select v-model="statusFilter" clearable placeholder="全部" style="width: 132px">
              <el-option label="全部" value="" />
              <el-option label="待完成" value="pending" />
              <el-option label="已提交" value="submitted" />
              <el-option label="已批改" value="graded" />
              <el-option label="已截止" value="closed" />
            </el-select>
          </el-form-item>
          <el-form-item label="排序">
            <el-select v-model="sortBy" style="width: 132px">
              <el-option label="截止时间" value="deadline" />
              <el-option label="得分" value="score" />
              <el-option label="发布时间" value="published" />
            </el-select>
          </el-form-item>
        </el-form>
      </div>

      <div v-if="!rows.length" class="panel empty-panel">
        <el-empty :image-size="96">
          <template #description>
            <h3 class="empty-title">暂无习题练习</h3>
            <p class="empty-desc">
              老师发布课堂练习或课后测评后，你可以在这里完成作答并查看得分。
            </p>
          </template>
          <el-button type="primary" plain @click="goTasks">去实训中心</el-button>
        </el-empty>
      </div>

      <div v-else-if="!displayCards.length" class="panel empty-panel">
        <el-empty description="没有匹配的练习，请调整筛选条件" :image-size="80" />
      </div>

      <div v-else class="practice-grid">
        <article
          v-for="item in displayCards"
          :key="item.id"
          class="practice-card"
          :class="{ 'practice-card--disabled': item.displayAction.disabled }"
          tabindex="0"
          @click="onCardClick(item)"
          @keyup.enter="onCardClick(item)"
        >
          <div class="practice-card__head">
            <h3 class="practice-card__title" :title="item.title">{{ item.title || '未命名练习' }}</h3>
            <el-tag size="small" :type="item.displayStatus.tagType" effect="plain">
              {{ item.displayStatus.label }}
            </el-tag>
          </div>

          <div class="practice-card__meta">
            <div class="meta-row">
              <span class="meta-label">截止时间</span>
              <span class="meta-value">{{ formatDateTime(item.deadline_at) || '—' }}</span>
            </div>
            <div class="meta-row">
              <span class="meta-label">题目数量</span>
              <span class="meta-value">{{ item.questionCountText }}</span>
            </div>
          </div>

          <div class="practice-card__score">
            <span class="score-label">得分</span>
            <div class="score-line">
              <span class="score-value">{{ item.displayScore }}</span>
              <el-tag
                v-if="item.scoreTier"
                size="small"
                :type="item.scoreTier.tagType"
                effect="plain"
                class="score-tier"
              >
                {{ item.scoreTier.label }}
              </el-tag>
            </div>
          </div>

          <div class="practice-card__foot">
            <el-button
              :type="item.displayAction.buttonType"
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
import {
  Search,
  Collection,
  Clock,
  Upload,
  CircleCheck,
  TrendCharts,
} from '@element-plus/icons-vue'
import { useRtOnDomains } from '../../composables/useRtOnDomains'
import { listStudentPractices } from '../../api/qb'
import { formatDateTime } from '../../utils/format'
import {
  computePracticeSummary,
  filterPracticeRows,
  sortPracticeRows,
  enrichPracticeRow,
} from '../../utils/studentQbPracticeDisplay'

const router = useRouter()
const loading = ref(false)
const rows = ref([])
const keyword = ref('')
const statusFilter = ref('')
const sortBy = ref('deadline')

const summary = computed(() => computePracticeSummary(rows.value))

const statCards = computed(() => {
  const s = summary.value
  return [
    {
      key: 'total',
      label: '全部练习',
      value: s.total,
      hint: '已发布练习',
      icon: Collection,
      tone: 'blue',
    },
    {
      key: 'pending',
      label: '待完成',
      value: s.pending,
      hint: '待作答或进行中',
      icon: Clock,
      tone: 'orange',
    },
    {
      key: 'submitted',
      label: '已提交',
      value: s.submitted,
      hint: '等待教师批改',
      icon: Upload,
      tone: 'teal',
    },
    {
      key: 'graded',
      label: '已批改',
      value: s.graded,
      hint: '可查看结果',
      icon: CircleCheck,
      tone: 'green',
    },
    {
      key: 'avg',
      label: '平均得分',
      value: s.avg,
      hint: '已公布分数均值',
      icon: TrendCharts,
      tone: 'indigo',
    },
  ]
})

const displayCards = computed(() => {
  const filtered = filterPracticeRows(rows.value, {
    keyword: keyword.value,
    status: statusFilter.value,
  })
  const sorted = sortPracticeRows(filtered, sortBy.value)
  return sorted.map(enrichPracticeRow)
})

const load = async () => {
  loading.value = true
  try {
    const res = await listStudentPractices()
    if (res.success) rows.value = res.data || []
  } finally {
    loading.value = false
  }
}

const goTake = (row) => {
  router.push(`/student/qbank/practices/${row.id}/take`)
}

const onCardClick = (item) => {
  if (item.displayAction.disabled) return
  goTake(item)
}

const goTasks = () => {
  router.push('/student/tasks')
}

useRtOnDomains(['qb_practices', 'scores'], () => load())

onMounted(load)
</script>

<style scoped>
.practice-center {
  min-height: 100%;
  padding-bottom: 24px;
  background: #eef2f7;
  margin: -16px -20px;
  padding: 16px 20px 24px;
}

.center-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px 20px;
  margin-bottom: 18px;
}

.center-title {
  margin: 0 0 8px;
  font-size: 24px;
  font-weight: 700;
  color: #0f172a;
  letter-spacing: -0.02em;
}

.center-subtitle {
  margin: 0;
  max-width: 42rem;
  font-size: 14px;
  line-height: 1.65;
  color: #64748b;
}

.center-hint {
  margin: 4px 0 0;
  flex-shrink: 0;
  max-width: 16rem;
  font-size: 12px;
  line-height: 1.55;
  color: #94a3b8;
  text-align: right;
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
.metric-card__icon--orange {
  background: #fff7ed;
  color: #ea580c;
}
.metric-card__icon--teal {
  background: #f0fdfa;
  color: #0d9488;
}
.metric-card__icon--green {
  background: #f0fdf4;
  color: #16a34a;
}
.metric-card__icon--indigo {
  background: #eef2ff;
  color: #4f46e5;
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

.practice-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.practice-card {
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

.practice-card:hover:not(.practice-card--disabled),
.practice-card:focus-visible:not(.practice-card--disabled) {
  border-color: #1677ff;
  box-shadow: 0 8px 24px rgba(22, 119, 255, 0.1);
  transform: translateY(-2px);
  outline: none;
}

.practice-card--disabled {
  cursor: default;
  opacity: 0.88;
}

.practice-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}

.practice-card__title {
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

.practice-card__meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
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

.practice-card__score {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  margin-bottom: 14px;
  background: #f8fafc;
  border-radius: 10px;
  border: 1px solid #f1f5f9;
}

.score-label {
  font-size: 12px;
  color: #94a3b8;
  font-weight: 600;
}

.score-line {
  display: flex;
  align-items: center;
  gap: 8px;
}

.score-value {
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
  font-variant-numeric: tabular-nums;
}

.score-tier {
  flex-shrink: 0;
}

.practice-card__foot {
  display: flex;
  justify-content: flex-end;
  padding-top: 4px;
  border-top: 1px solid #f1f5f9;
  margin-top: auto;
}

.practice-card__foot .el-button {
  border-radius: 10px;
  font-weight: 600;
}

@media (max-width: 768px) {
  .center-hint {
    text-align: left;
    max-width: none;
  }

  .practice-grid {
    grid-template-columns: 1fr;
  }
}
</style>
