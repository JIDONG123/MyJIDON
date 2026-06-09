<template>
  <div class="page-grading-queue">
    <header class="page-head">
      <div class="page-head-row">
        <div>
          <h1 class="page-title">成果批改</h1>
          <p class="page-desc">集中查看学生提交、AI 批改与教师复核入口，支撑实训评价主线</p>
        </div>
      </div>
    </header>

    <el-card class="filter-card" shadow="never">
      <el-form :inline="true" class="filter-form">
        <el-form-item label="批改状态">
          <el-select v-model="filters.status" style="width: 140px" @change="loadData">
            <el-option label="全部" value="all" />
            <el-option label="待批改/待复核" value="pending" />
            <el-option label="已复核" value="graded" />
          </el-select>
        </el-form-item>
        <el-form-item label="任务">
          <el-select v-model="filters.taskId" clearable filterable placeholder="全部任务" style="width: 220px" @change="loadData">
            <el-option v-for="t in tasks" :key="t.id" :label="t.title" :value="t.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="教学班">
          <el-select
            v-model="filters.teachingClassId"
            clearable
            filterable
            placeholder="全部教学班"
            style="width: 200px"
            @change="loadData"
          >
            <el-option v-for="tc in teachingClasses" :key="tc.id" :label="tc.class_name" :value="tc.id" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="loadData">刷新</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-skeleton v-if="loading" animated :rows="8" class="sk-main" />

    <el-card v-else class="panel-card" shadow="never">
      <template #header>
        <div class="panel-header">
          <span class="panel-title">提交列表</span>
          <span class="panel-sub">共 {{ rows.length }} 条</span>
        </div>
      </template>

      <el-empty v-if="!rows.length" description="暂无提交记录" :image-size="100" />

      <el-table v-else :data="rows" border stripe class="data-table">
        <el-table-column prop="student_name" label="学生" width="100" show-overflow-tooltip />
        <el-table-column prop="task_title" label="实训任务" min-width="160" show-overflow-tooltip />
        <el-table-column label="归属" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">
            <el-tag v-if="row.teaching_class_id" size="small" type="primary">教学班</el-tag>
            <el-tag v-else size="small">行政班</el-tag>
            {{ row.audience_label }}
          </template>
        </el-table-column>
        <el-table-column prop="course_name" label="课程" min-width="120" show-overflow-tooltip />
        <el-table-column prop="file_name" label="文件" min-width="160" show-overflow-tooltip />
        <el-table-column label="提交时间" width="170">
          <template #default="{ row }">{{ formatDateTime(row.submitted_at) }}</template>
        </el-table-column>
        <el-table-column label="AI分" width="80" align="center">
          <template #default="{ row }">{{ row.total_score ?? '—' }}</template>
        </el-table-column>
        <el-table-column label="综合分" width="80" align="center">
          <template #default="{ row }">{{ row.final_score ?? row.human_score ?? '—' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="gradingStatusType(row.grading_status)" size="small">
              {{ gradingStatusText(row.grading_status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="240" align="right" fixed="right">
          <template #default="{ row }">
            <div class="table-row-actions">
              <el-button type="primary" size="small" plain :icon="EditPen" @click="goGrade(row)">批改</el-button>
              <el-button type="primary" size="small" plain :icon="Document" @click="goTaskSubmissions(row.task_id)">任务提交</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getTeacherGradingWorkbench } from '../../api/submission'
import { getAllTasks } from '../../api/task'
import { listMyTeachingClasses } from '../../api/teachingClass'
import { formatDateTime } from '../../utils/format'
import { gradingStatusType, gradingStatusText } from '../../utils/gradingStatusDisplay'
import { EditPen, Document } from '@element-plus/icons-vue'
import { useRtOnDomains } from '../../composables/useRtOnDomains'

const router = useRouter()
const loading = ref(true)
const rows = ref([])
const tasks = ref([])
const teachingClasses = ref([])

const filters = reactive({
  status: 'all',
  taskId: null,
  teachingClassId: null,
})

const loadMeta = async () => {
  const [tRes, tcRes] = await Promise.all([getAllTasks(), listMyTeachingClasses()])
  if (tRes.success) tasks.value = tRes.data
  if (tcRes.success) teachingClasses.value = tcRes.data
}

const loadData = async () => {
  loading.value = true
  try {
    const params = { status: filters.status }
    if (filters.taskId) params.taskId = filters.taskId
    if (filters.teachingClassId) params.teachingClassId = filters.teachingClassId
    const res = await getTeacherGradingWorkbench(params)
    if (res.success) rows.value = res.data
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

const goGrade = (row) => {
  const id = typeof row === 'object' ? row.submission_id : row
  const className = typeof row === 'object' ? row.audience_label : null
  router.push({
    path: `/teacher/grading/${id}`,
    query: className ? { className: String(className) } : {},
  })
}
const goTaskSubmissions = (taskId) => router.push(`/teacher/submissions/${taskId}`)

onMounted(async () => {
  await loadMeta()
  await loadData()
})

useRtOnDomains(['submissions', 'grading'], () => loadData())
</script>

<style scoped>
.page-grading-queue {
  max-width: 1400px;
}
.page-head {
  margin-bottom: 16px;
}
.page-head-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.page-title {
  margin: 0 0 6px;
  font-size: 22px;
  font-weight: 600;
}
.page-desc {
  margin: 0;
  font-size: 14px;
  color: var(--sg-text-secondary);
}
.filter-card {
  margin-bottom: 16px;
  border-radius: var(--sg-radius-lg);
}
.filter-form {
  margin-bottom: 0;
}
.panel-card {
  border-radius: var(--sg-radius-lg);
}
.panel-header {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.panel-title {
  font-weight: 600;
}
.panel-sub {
  font-size: 12px;
  color: var(--sg-text-placeholder);
}
</style>
