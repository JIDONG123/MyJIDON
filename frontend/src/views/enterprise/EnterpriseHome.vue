<template>
  <div class="tw-page ent-home">
    <header class="tw-head">
      <div class="tw-head__left">
        <div>
          <h1 class="tw-title">企业评价工作台</h1>
          <p class="tw-subtitle">
            查看已授权班级、教学班与实训任务，仅评价授权范围内的学生提交。
          </p>
        </div>
      </div>
    </header>

    <el-skeleton v-if="loading" animated :rows="8" />

    <template v-else>
      <section class="tw-metric-grid">
        <div v-for="card in metricCards" :key="card.key" class="tw-metric-card">
          <div class="tw-metric-card__icon" :class="`tw-metric-card__icon--${card.tone}`">
            <el-icon><component :is="card.icon" /></el-icon>
          </div>
          <div class="tw-metric-card__body">
            <span class="tw-metric-card__label">{{ card.label }}</span>
            <span class="tw-metric-card__value" :class="{ 'tw-metric-card__value--text': card.textValue }">{{ card.value }}</span>
            <span v-if="card.hint" class="tw-metric-card__hint">{{ card.hint }}</span>
          </div>
        </div>
      </section>

      <el-empty v-if="!groups.length" description="暂无授权班级或教学班" />

      <template v-else>
        <section class="tw-panel">
          <div class="tw-panel__header">
            <h2 class="tw-panel__title">授权范围一览</h2>
            <span class="tw-panel__meta">共 {{ groups.length }} 个授权范围</span>
          </div>
          <div class="tw-panel__body tw-panel__body--flush">
            <el-table :data="tableRows" stripe class="ent-scope-table">
              <el-table-column label="班级 / 教学班" min-width="160">
                <template #default="{ row }">{{ row.title }}</template>
              </el-table-column>
              <el-table-column label="类型" width="100">
                <template #default="{ row }">
                  <el-tag size="small" :type="row.kind === 'teaching' ? 'primary' : 'info'">
                    {{ row.kind === 'teaching' ? '教学班' : '行政班' }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="课程 / 项目" min-width="160">
                <template #default="{ row }">{{ row.subtitle || '—' }}</template>
              </el-table-column>
              <el-table-column prop="taskCount" label="任务数" width="88" align="center" />
              <el-table-column prop="pendingCount" label="待评价" width="88" align="center">
                <template #default="{ row }">
                  <el-tag v-if="row.pendingCount > 0" type="warning" size="small">{{ row.pendingCount }}</el-tag>
                  <span v-else>0</span>
                </template>
              </el-table-column>
              <el-table-column prop="doneCount" label="已评价" width="88" align="center">
                <template #default="{ row }">
                  <el-tag v-if="row.doneCount > 0" type="success" size="small">{{ row.doneCount }}</el-tag>
                  <span v-else>0</span>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="120" fixed="right">
                <template #default="{ row }">
                  <el-button type="primary" link @click="scrollToScope(row.key)">查看任务</el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </section>

        <section class="scope-cards">
          <article
            v-for="g in groups"
            :key="g.key"
            :id="`scope-${g.key}`"
            class="tw-entity-card scope-card"
          >
            <div class="tw-entity-card__top">
              <div>
                <h3 class="tw-entity-card__title">{{ g.title }}</h3>
                <p v-if="g.subtitle" class="tw-entity-card__code">{{ g.subtitle }}</p>
              </div>
              <el-tag size="small" :type="g.kind === 'teaching' ? 'primary' : 'info'">
                {{ g.kind === 'teaching' ? '教学班' : '行政班' }}
              </el-tag>
            </div>

            <div class="tw-entity-card__stats">
              <span>任务数 <strong>{{ g.taskCount }}</strong></span>
              <span>待评价 <strong>{{ g.pendingCount }}</strong></span>
              <span>已评价 <strong>{{ g.doneCount }}</strong></span>
            </div>

            <el-table :data="g.tasks" size="small" stripe class="scope-task-table">
              <el-table-column prop="title" label="任务名称" min-width="160" />
              <el-table-column label="截止" width="168">
                <template #default="{ row }">{{ formatDateTime(row.deadline) }}</template>
              </el-table-column>
              <el-table-column label="待评价" width="80" align="center">
                <template #default="{ row }">{{ row._stats?.pending ?? 0 }}</template>
              </el-table-column>
              <el-table-column label="已评价" width="80" align="center">
                <template #default="{ row }">{{ row._stats?.done ?? 0 }}</template>
              </el-table-column>
              <el-table-column label="操作" width="120" fixed="right">
                <template #default="{ row }">
                  <el-button type="primary" link @click="goSubmissions(row.id)">查看任务</el-button>
                </template>
              </el-table-column>
            </el-table>
          </article>
        </section>
      </template>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getAllTasks } from '../../api/task'
import { getSubmissionsByTask } from '../../api/submission'
import { ElMessage } from 'element-plus'
import { formatDateTime } from '../../utils/format'
import { aggregateHomeStats, buildScopeGroups } from '../../utils/enterpriseWorkbench'
import { OfficeBuilding, Document, Clock, CircleCheck, Timer } from '@element-plus/icons-vue'

const router = useRouter()
const loading = ref(true)
const tasks = ref([])
const submissionMap = ref({})

const homeStats = computed(() => aggregateHomeStats(tasks.value, submissionMap.value))
const groups = computed(() => buildScopeGroups(tasks.value, submissionMap.value))
const tableRows = computed(() => groups.value)

const metricCards = computed(() => [
  {
    key: 'scope',
    label: '授权班级',
    value: homeStats.value.scopeCount,
    hint: '行政班与教学班合计',
    icon: OfficeBuilding,
    tone: 'blue',
  },
  {
    key: 'tasks',
    label: '授权任务',
    value: homeStats.value.taskCount,
    hint: '授权范围内实训任务',
    icon: Document,
    tone: 'indigo',
  },
  {
    key: 'pending',
    label: '待企业评价',
    value: homeStats.value.pending,
    hint: '尚未填写企业评分',
    icon: Clock,
    tone: 'orange',
  },
  {
    key: 'done',
    label: '已企业评价',
    value: homeStats.value.done,
    hint: '已完成企业侧评分',
    icon: CircleCheck,
    tone: 'teal',
  },
  {
    key: 'last',
    label: '最近评价时间',
    value: homeStats.value.lastReviewText,
    hint: '最近一次企业评分',
    icon: Timer,
    tone: 'slate',
    textValue: true,
  },
])

const load = async () => {
  loading.value = true
  try {
    const res = await getAllTasks()
    if (!res.success) return
    tasks.value = (res.data || []).sort(
      (a, b) => new Date(a.deadline || 0) - new Date(b.deadline || 0)
    )
    const ids = tasks.value.map((t) => t.id)
    const pairs = await Promise.all(
      ids.map(async (id) => {
        try {
          const r = await getSubmissionsByTask(id)
          return [id, r.success ? r.data || [] : []]
        } catch {
          return [id, []]
        }
      })
    )
    submissionMap.value = Object.fromEntries(pairs)
  } catch (e) {
    ElMessage.error(e?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

const goSubmissions = (taskId) => {
  router.push(`/enterprise/submissions/${taskId}`)
}

const scrollToScope = (key) => {
  const el = document.getElementById(`scope-${key}`)
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

onMounted(load)
</script>

<style scoped>
.ent-home {
  background: #eef2f7;
}
.tw-metric-card__hint {
  font-size: 12px;
  color: #94a3b8;
  margin-top: 2px;
}
:deep(.tw-metric-card__value--text) {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.35;
}
.scope-cards {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.scope-card {
  scroll-margin-top: 88px;
}
.scope-task-table {
  width: 100%;
}
.ent-scope-table :deep(.el-table__header th) {
  background: #f8fafc;
}
</style>
