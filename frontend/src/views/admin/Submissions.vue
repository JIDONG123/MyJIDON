<template>
  <div class="page-submissions">
    <header class="page-head">
      <div class="page-head-row">
        <el-button type="primary" plain @click="goBack">返回</el-button>
        <div class="page-head-main">
          <h1 class="page-title">{{ taskTitle || '提交列表' }}</h1>
          <p class="page-desc">管理端查看该任务全部提交，支持批量 AI 批改</p>
        </div>
        <el-button type="success" @click="batchGrade">批量AI批改</el-button>
        <el-button plain @click="goGradingJobs">批改任务</el-button>
      </div>
    </header>

    <el-skeleton v-if="loading" animated :rows="6" class="sk-main" />

    <el-card v-if="overview && !loading" class="panel-card overview-card" shadow="never">
      <template #header>
        <div class="overview-head">
          <span class="panel-title">提交概况</span>
          <span class="panel-sub">截止时间：{{ formatDateTime(overview.deadline) }}</span>
        </div>
      </template>
      <el-row :gutter="20">
        <el-col :xs="24" :md="12">
          <h4 class="ov-heading">未提交（{{ overview.unsubmitted?.length ?? 0 }}）</h4>
          <p class="ov-text">{{ unsubNames }}</p>
        </el-col>
        <el-col :xs="24" :md="12">
          <h4 class="ov-heading">超时提交（{{ overview.lateSubmitters?.length ?? 0 }}）</h4>
          <p class="ov-text">{{ lateNames }}</p>
        </el-col>
      </el-row>
    </el-card>

    <el-card v-if="!loading" class="panel-card" shadow="never">
      <template #header>
        <div class="panel-header">
          <div>
            <span class="panel-title">提交记录</span>
            <span class="panel-sub">共 {{ submissions.length }} 条</span>
          </div>
          <div class="toolbar">
            <span class="toolbar-label">表格密度</span>
            <el-radio-group v-model="mode" size="small">
              <el-radio-button value="default">{{ labelMap.default }}</el-radio-button>
              <el-radio-button value="compact">{{ labelMap.compact }}</el-radio-button>
              <el-radio-button value="comfortable">{{ labelMap.comfortable }}</el-radio-button>
            </el-radio-group>
          </div>
        </div>
      </template>

      <el-empty v-if="!submissions.length" description="暂无学生提交" :image-size="120">
        <template #image>
          <div class="empty-illus">
            <el-icon>
              <Upload />
            </el-icon>
          </div>
        </template>
      </el-empty>

      <el-table v-else :data="submissions" border :size="tableSize" stripe class="data-table" style="width: 100%">
        <el-table-column prop="student_name" label="学生姓名" min-width="100" show-overflow-tooltip />
        <el-table-column prop="class_name" label="班级" min-width="120" show-overflow-tooltip />
        <el-table-column prop="file_name" label="提交文件" min-width="220" show-overflow-tooltip />
        <el-table-column label="提交时间" min-width="170" show-overflow-tooltip>
          <template #default="{ row }">
            {{ formatDateTime(row.submitted_at) }}
          </template>
        </el-table-column>
        <el-table-column prop="is_revised" label="是否修改">
          <template #default="scope">
            <el-tag :type="scope.row.is_revised ? 'warning' : 'success'">
              {{ scope.row.is_revised ? '是' : '否' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="total_score" label="AI分" width="90" />
        <el-table-column label="综合分" width="100">
          <template #default="scope">
            {{ scope.row.final_score ?? scope.row.human_score ?? scope.row.total_score ?? '—' }}
          </template>
        </el-table-column>
        <el-table-column label="查重" width="120">
          <template #default="scope">
            <span v-if="scope.row.max_similarity != null">{{ Number(scope.row.max_similarity).toFixed(1) }}%</span>
            <span v-else>—</span>
            <el-tag v-if="scope.row.similarity_level === 'high'" type="danger" size="small" class="sim-tag">疑</el-tag>
            <el-tag v-else-if="scope.row.similarity_level === 'warn'" type="warning" size="small"
              class="sim-tag">警</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态">
          <template #default="scope">
            <el-tag :type="getStatusType(scope.row.status)">
              {{ getStatusText(scope.row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="260" align="right" fixed="right">
          <template #default="scope">
            <el-button link type="primary" @click="viewGrading(scope.row.id)">查看批改</el-button>
            <el-button v-if="scope.row.max_similarity != null && Number(scope.row.max_similarity) > 0" link
              type="warning" @click="openCompare(scope.row.id)">
              查重对比
            </el-button>
            <el-button link type="primary" @click="gradeSubmission(scope.row.id)">AI批改</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Upload } from '@element-plus/icons-vue'
import { getSubmissionsByTask } from '../../api/submission'
import { aiGradeSubmission, batchAiGrade } from '../../api/grading'
import { getTaskById, getTaskSubmissionOverview } from '../../api/task'
import { formatDateTime } from '../../utils/format'
import { applyGradingJobResponse, gradingJobErrorMessage } from '../../utils/gradingJobSubmit'
import { useTableDensity } from '../../composables/useTableDensity'
import { useRtOnDomains } from '../../composables/useRtOnDomains'
import { ElMessage } from 'element-plus'

const route = useRoute()
const router = useRouter()
const { mode, tableSize, labelMap } = useTableDensity()

const submissions = ref([])
const taskTitle = ref('')
const loading = ref(true)
const overview = ref(null)

const unsubNames = computed(() => {
  const arr = overview.value?.unsubmitted || []
  if (!arr.length) return '—'
  return arr.map((x) => x.real_name || x.username).join('、')
})

const lateNames = computed(() => {
  const arr = overview.value?.lateSubmitters || []
  if (!arr.length) return '—'
  return arr.map((x) => `${x.real_name}（${formatDateTime(x.submitted_at)}）`).join('；')
})

const loadSubmissions = async () => {
  try {
    const response = await getSubmissionsByTask(route.params.taskId)
    if (response.success) {
      submissions.value = response.data
    }
  } catch (error) {
    console.error('获取提交列表失败:', error)
  } finally {
    loading.value = false
  }
}

const loadTaskInfo = async () => {
  try {
    const response = await getTaskById(route.params.taskId)
    if (response.success) {
      taskTitle.value = response.data.title
    }
  } catch (error) {
    console.error('获取任务信息失败:', error)
  }
}

const loadOverview = async () => {
  try {
    const res = await getTaskSubmissionOverview(route.params.taskId)
    if (res.success) overview.value = res.data
    else overview.value = null
  } catch (_) {
    overview.value = null
  }
}

const getStatusType = (status) => {
  if (status == null || status === '') return 'warning'
  const types = {
    pending: 'warning',
    ai_grading: 'warning',
    ai_failed: 'danger',
    ai_graded: 'warning',
    human_graded: 'success',
  }
  return types[status] || 'info'
}

const getStatusText = (status) => {
  if (status == null || status === '') return '待批改'
  const texts = {
    pending: '待批改',
    ai_grading: 'AI批改中',
    ai_failed: '批改失败',
    ai_graded: 'AI已批改',
    human_graded: '人工已复核',
  }
  return texts[status] || status
}

const goBack = () => {
  router.push('/admin/tasks')
}

const viewGrading = (submissionId) => {
  router.push(`/admin/grading/${submissionId}`)
}

const openCompare = (submissionId) => {
  router.push(`/admin/submissions/${route.params.taskId}/similarity/${submissionId}`)
}

const goGradingJobs = () => {
  router.push('/admin/grading-jobs')
}

const gradeSubmission = async (submissionId) => {
  try {
    const response = await aiGradeSubmission(submissionId)
    if (applyGradingJobResponse(response, { submissionId, taskId: route.params.taskId })) {
      await loadSubmissions()
      await loadOverview()
    }
  } catch (error) {
    ElMessage.error(gradingJobErrorMessage(error))
    console.error(error)
  }
}

const batchGrade = async () => {
  try {
    const response = await batchAiGrade(route.params.taskId)
    if (applyGradingJobResponse(response, { taskId: route.params.taskId })) {
      await loadSubmissions()
      await loadOverview()
    }
  } catch (error) {
    ElMessage.error(gradingJobErrorMessage(error))
    console.error(error)
  }
}

onMounted(async () => {
  loading.value = true
  await loadTaskInfo()
  await loadSubmissions()
  await loadOverview()
})

async function refreshListAndOverview() {
  await loadSubmissions()
  await loadOverview()
}

useRtOnDomains(['submissions', 'grading', 'grading_job'], (payload) => {
  if (payload?.domain === 'grading_job') {
    const tid = payload.taskId
    if (tid != null && String(tid) !== String(route.params.taskId)) return
    if (!['item_done', 'job_finished', 'job_cancelled'].includes(payload.action)) return
  }
  void refreshListAndOverview()
})
</script>

<style scoped>
.page-submissions {
  max-width: 1400px;
}

.page-head {
  margin-bottom: 20px;
}

.page-head-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 16px;
  justify-content: space-between;
}

.page-head-main {
  flex: 1;
  min-width: 200px;
}

.page-title {
  margin: 0 0 6px;
  font-size: 22px;
  font-weight: 600;
  color: var(--sg-text);
}

.page-desc {
  margin: 0;
  font-size: 14px;
  color: var(--sg-text-secondary);
}

.sk-main {
  padding: 12px 0;
}

.overview-card {
  margin-bottom: 16px;
}

.overview-head {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ov-heading {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--sg-text);
}

.ov-text {
  margin: 0;
  font-size: 13px;
  color: var(--sg-text-secondary);
  line-height: 1.55;
  word-break: break-all;
}

.panel-card {
  border-radius: var(--sg-radius-lg);
  border: 1px solid var(--sg-border);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
}

.panel-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--sg-text);
  margin-right: 8px;
}

.panel-sub {
  font-size: 12px;
  color: var(--sg-text-placeholder);
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.toolbar-label {
  font-size: 12px;
  color: var(--sg-text-secondary);
}

.data-table {
  border-radius: var(--sg-radius-md);
}

.empty-illus {
  width: 120px;
  height: 120px;
  margin: 0 auto;
  border-radius: 50%;
  background: linear-gradient(145deg, #f0f5ff 0%, #e6f4ff 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 48px;
  color: var(--sg-primary);
}
</style>
