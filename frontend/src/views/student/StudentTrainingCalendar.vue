<template>
  <div class="calendar-center">
    <header class="center-head">
      <div>
        <h1 class="center-title">实训日历</h1>
        <p class="center-subtitle">
          查看已加入教学班的实训安排与关联任务，按周掌握上课时间、地点与练习要求。
        </p>
      </div>
    </header>

    <CalendarSummaryCards :rows="displayRows" :week-no="weekNo" />

    <div class="info-banner" role="note">
      <el-icon class="info-banner__icon"><InfoFilled /></el-icon>
      <p class="info-banner__text">
        课表视图按星期与节次展示实训安排；点击课表格子可查看详情并跳转关联任务或实训中心。
      </p>
    </div>

    <div class="panel filter-panel">
      <el-form inline class="filter-form">
        <el-form-item label="教学班">
          <el-select
            v-model="teachingClassId"
            filterable
            clearable
            placeholder="全部教学班"
            style="width: 240px"
            @change="load"
          >
            <el-option
              v-for="tc in teachingClasses"
              :key="tc.id"
              :label="[tc.class_name, tc.course_name].filter(Boolean).join(' · ')"
              :value="tc.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="周次">
          <el-input-number v-model="weekNo" :min="0" :max="20" placeholder="全部" @change="load" />
        </el-form-item>
        <el-form-item>
          <el-button @click="goCurrentWeek">本周</el-button>
        </el-form-item>
        <el-form-item label="视图">
          <el-radio-group v-model="viewMode" size="default">
            <el-radio-button value="grid">课表视图</el-radio-button>
            <el-radio-button value="list">列表视图</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item>
          <el-checkbox v-model="onlyWithTask">仅看有关联任务</el-checkbox>
        </el-form-item>
      </el-form>
    </div>

    <div v-if="loading" class="panel loading-panel">
      <el-skeleton animated :rows="10" />
    </div>

    <div v-else-if="!displayRows.length" class="panel empty-panel">
      <el-empty :image-size="96">
        <template #description>
          <h3 class="empty-title">本周暂无实训安排</h3>
          <p class="empty-desc">
            当前筛选条件下暂无课程安排，你可以切换教学班或周次查看其他周的实训日程。
          </p>
        </template>
        <div class="empty-actions">
          <el-button type="primary" plain @click="goCurrentWeek">返回本周</el-button>
          <el-button @click="showAllClasses">查看全部教学班</el-button>
        </div>
      </el-empty>
    </div>

    <template v-else>
      <div v-if="viewMode === 'grid'" class="panel grid-panel">
        <div class="panel__header">
          <h2 class="panel__title">周课表</h2>
          <span class="panel__meta">{{ weekLabel }} · 共 {{ displayRows.length }} 条安排</span>
        </div>
        <div class="panel__body">
          <WeekScheduleGrid
            :rows="displayRows"
            :show-week-on-cards="weekNo <= 0"
            @select="openDetail"
          />
        </div>
      </div>

      <div v-if="viewMode === 'list'" class="panel list-panel">
        <div class="panel__header">
          <h2 class="panel__title">实训安排列表</h2>
        </div>
        <div class="panel__body panel__body--table">
          <el-table :data="displayRows" stripe class="detail-table">
            <el-table-column label="星期" width="88">
              <template #default="{ row }">{{ weekdayLabel(row.weekday) }}</template>
            </el-table-column>
            <el-table-column label="节次" width="100">
              <template #default="{ row }">{{ periodLabel(row) }}</template>
            </el-table-column>
            <el-table-column prop="title" label="实训安排" min-width="140" show-overflow-tooltip />
            <el-table-column prop="teaching_class_name" label="教学班" min-width="140" show-overflow-tooltip />
            <el-table-column prop="location" label="地点" width="120" show-overflow-tooltip />
            <el-table-column label="关联任务" min-width="140" show-overflow-tooltip>
              <template #default="{ row }">
                <span v-if="row.task_title">{{ row.task_title }}</span>
                <span v-else class="text-muted">未关联</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" min-width="200" align="right" fixed="right">
              <template #default="{ row }">
                <el-button v-if="row.task_id" link type="primary" @click="goTask(row.task_id)">
                  查看任务
                </el-button>
                <el-button link type="primary" @click="goTasks">实训中心</el-button>
                <el-button link @click="openDetail(row)">详情</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>

      <div v-if="viewMode === 'grid'" class="panel list-panel list-panel--aux">
        <div class="panel__header">
          <h2 class="panel__title">安排明细</h2>
          <span class="panel__meta">辅助列表，便于快速跳转</span>
        </div>
        <div class="panel__body panel__body--table">
          <el-table :data="displayRows" stripe class="detail-table" size="small">
            <el-table-column v-if="weekNo <= 0" prop="week_no" label="周次" width="70" />
            <el-table-column label="星期" width="80">
              <template #default="{ row }">{{ weekdayLabel(row.weekday) }}</template>
            </el-table-column>
            <el-table-column label="节次" width="96">
              <template #default="{ row }">{{ periodLabel(row) }}</template>
            </el-table-column>
            <el-table-column prop="title" label="实训安排" min-width="120" show-overflow-tooltip />
            <el-table-column prop="teaching_class_name" label="教学班" min-width="120" show-overflow-tooltip />
            <el-table-column prop="location" label="地点" width="100" show-overflow-tooltip />
            <el-table-column prop="task_title" label="关联任务" min-width="120" show-overflow-tooltip />
            <el-table-column label="操作" width="180" align="right" fixed="right">
              <template #default="{ row }">
                <el-button v-if="row.task_id" link type="primary" size="small" @click="goTask(row.task_id)">
                  查看任务
                </el-button>
                <el-button link type="primary" size="small" @click="openDetail(row)">详情</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>
    </template>

    <el-drawer v-model="drawerVisible" title="实训安排详情" size="400px" destroy-on-close>
      <template v-if="selectedRow">
        <dl class="detail-dl">
          <div><dt>教学班</dt><dd>{{ selectedRow.teaching_class_name || '—' }}</dd></div>
          <div><dt>周次</dt><dd>第 {{ selectedRow.week_no ?? '—' }} 周</dd></div>
          <div><dt>星期</dt><dd>{{ weekdayLabel(selectedRow.weekday) }}</dd></div>
          <div><dt>节次</dt><dd>{{ periodLabel(selectedRow) }}</dd></div>
          <div><dt>安排</dt><dd>{{ selectedRow.title || '—' }}</dd></div>
          <div><dt>地点</dt><dd>{{ selectedRow.location || '—' }}</dd></div>
          <div><dt>关联任务</dt><dd>{{ selectedRow.task_title || '未关联' }}</dd></div>
        </dl>
        <div class="drawer-actions">
          <el-button v-if="selectedRow.task_id" type="primary" @click="goTask(selectedRow.task_id)">
            去任务
          </el-button>
          <el-button type="primary" plain @click="goTasks">实训中心</el-button>
          <el-button plain @click="goOnlinePractice">在线实训</el-button>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { InfoFilled } from '@element-plus/icons-vue'
import { listTeachingClasses } from '../../api/teachingClass'
import { listCalendar } from '../../api/schedule'
import { weekdayLabel, periodLabel } from '../../utils/trainingCalendarDisplay'
import CalendarSummaryCards from '../../components/student/schedule/CalendarSummaryCards.vue'
import WeekScheduleGrid from '../../components/student/schedule/WeekScheduleGrid.vue'

const router = useRouter()
const teachingClasses = ref([])
const teachingClassId = ref(null)
const weekNo = ref(0)
const rows = ref([])
const loading = ref(false)
const viewMode = ref('grid')
const onlyWithTask = ref(false)
const drawerVisible = ref(false)
const selectedRow = ref(null)

const displayRows = computed(() => {
  let list = rows.value
  if (onlyWithTask.value) {
    list = list.filter((r) => r.task_id)
  }
  return list
})

const weekLabel = computed(() => {
  if (weekNo.value > 0) return `第 ${weekNo.value} 周`
  return '全部周次'
})

async function loadMeta() {
  const res = await listTeachingClasses()
  if (res.success) teachingClasses.value = res.data || []
}

async function load() {
  loading.value = true
  try {
    const params = {}
    if (teachingClassId.value) params.teachingClassId = teachingClassId.value
    if (weekNo.value > 0) params.weekNo = weekNo.value
    const res = await listCalendar(params)
    rows.value = res.success ? res.data || [] : []
  } finally {
    loading.value = false
  }
}

function goCurrentWeek() {
  weekNo.value = 1
  load()
}

function showAllClasses() {
  teachingClassId.value = null
  load()
}

function openDetail(row) {
  selectedRow.value = row
  drawerVisible.value = true
}

function goTask(taskId) {
  drawerVisible.value = false
  router.push(`/student/tasks/${taskId}`)
}

function goTasks() {
  drawerVisible.value = false
  router.push('/student/tasks')
}

function goOnlinePractice() {
  drawerVisible.value = false
  router.push('/student/online-practice')
}

onMounted(async () => {
  await loadMeta()
  await load()
})
</script>

<style scoped>
.calendar-center {
  max-width: 1360px;
  margin: -20px -24px -36px;
  padding: 20px 24px 36px;
  min-height: calc(100vh - 120px);
  background: #f3f6fa;
  box-sizing: border-box;
}

.center-head {
  margin-bottom: 20px;
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
  max-width: 44rem;
  font-size: 14px;
  line-height: 1.65;
  color: #64748b;
}

.info-banner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 14px 16px;
  margin-bottom: 16px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 12px;
}

.info-banner__icon {
  flex-shrink: 0;
  margin-top: 2px;
  font-size: 18px;
  color: #1677ff;
}

.info-banner__text {
  margin: 0;
  font-size: 13px;
  line-height: 1.65;
  color: #334155;
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

.panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 20px 14px;
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
  font-size: 12px;
  color: #94a3b8;
}

.panel__body {
  padding: 16px 20px 20px;
}

.panel__body--table {
  padding: 0;
}

.loading-panel {
  padding: 20px;
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
  margin: 0;
  max-width: 28rem;
  font-size: 14px;
  line-height: 1.6;
  color: #64748b;
}

.empty-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
  margin-top: 8px;
}

.list-panel--aux {
  margin-top: 0;
}

.detail-table :deep(.el-table__header th) {
  background: #f8fafc !important;
  color: #475569;
  font-weight: 600;
}

.text-muted {
  color: #94a3b8;
}

.detail-dl {
  margin: 0 0 24px;
  display: grid;
  gap: 14px;
}

.detail-dl dt {
  font-size: 12px;
  color: #94a3b8;
  margin-bottom: 4px;
}

.detail-dl dd {
  margin: 0;
  font-size: 14px;
  color: #0f172a;
  line-height: 1.5;
}

.drawer-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
</style>
