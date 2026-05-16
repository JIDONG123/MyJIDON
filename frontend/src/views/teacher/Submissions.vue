<template>
  <div class="page-submissions">
    <header class="page-head">
      <div class="page-head-row">
        <el-button type="primary" plain @click="goBack">返回</el-button>
        <div class="page-head-main">
          <h1 class="page-title">{{ taskTitle || '提交列表' }}</h1>
          <p class="page-desc">查看该任务下学生提交、分数与批改状态，可单条或批量发起 AI 批改</p>
        </div>
        <div class="head-actions">
          <el-button @click="dlXlsx" :disabled="!taskClassId">导出成绩 Excel</el-button>
          <el-button plain @click="dlZip" :disabled="!taskClassId">打包作业 ZIP</el-button>
          <el-button type="success" @click="batchGrade">批量AI批改</el-button>
        </div>
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
import { aiGradeSubmission, batchAiGrade, waitForAiGradingComplete, getBatchGradingProgress } from '../../api/grading'
import { getTaskById, getTaskSubmissionOverview } from '../../api/task'
import { downloadScoresExcel, downloadSubmissionsZip } from '../../api/export'
import { formatDateTime } from '../../utils/format'
import { withGradingLoading } from '../../utils/gradingLoading'
import { useTableDensity } from '../../composables/useTableDensity'
import { ElMessage } from 'element-plus'
import { useRtOnDomains } from '../../composables/useRtOnDomains'

const route = useRoute()
const router = useRouter()
const { mode, tableSize, labelMap } = useTableDensity()

const submissions = ref([])
const taskTitle = ref('')
const loading = ref(true)
const taskClassId = ref(null)
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

async function loadSubmissions() {
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
      taskClassId.value = response.data.class_id
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

const dlXlsx = async () => {
  try {
    await downloadScoresExcel(taskClassId.value, route.params.taskId)
    ElMessage.success('已开始下载')
  } catch (e) {
    ElMessage.error(e?.message || '导出失败')
  }
}

const dlZip = async () => {
  try {
    await downloadSubmissionsZip(taskClassId.value, route.params.taskId)
    ElMessage.success('已开始下载')
  } catch (e) {
    ElMessage.error(e?.message || '打包失败')
  }
}

const getStatusType = (status) => {
  const types = {
    pending: 'info',
    ai_grading: 'warning',
    ai_failed: 'danger',
    ai_graded: 'warning',
    human_graded: 'success',
  }
  return types[status] || 'info'
}

const getStatusText = (status) => {
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
  router.push('/teacher/tasks')
}

const viewGrading = (submissionId) => {
  router.push(`/teacher/grading/${submissionId}`)
}

const openCompare = (submissionId) => {
  router.push(`/teacher/submissions/${route.params.taskId}/similarity/${submissionId}`)
}

const pollBatchProgress = async (batchId) => {
  const maxRounds = 200
  for (let i = 0; i < maxRounds; i += 1) {
    const pr = await getBatchGradingProgress(batchId)
    if (!pr.success) {
      break
    }
    await loadSubmissions()
    await loadOverview()
    const g = Number(pr.data?.grading ?? 0)
    if (g <= 0) {
      const done = Number(pr.data?.done ?? 0)
      const failed = Number(pr.data?.failed ?? 0)
      ElMessage.success(`批量批改已结束：完成 ${done}，失败 ${failed}`)
      return
    }
    await new Promise((r) => setTimeout(r, 2500))
  }
  ElMessage.warning('批量批改进度查询结束，请刷新页面确认结果')
}

const gradeSubmission = async (submissionId) => {
  try {
    const response = await withGradingLoading(
      false,
      async () => {
        const response = await aiGradeSubmission(submissionId)
        if (!response.success) return response
        if (response.data?.async) {
          ElMessage.success('已提交 AI 批改，后台处理中…')
          await loadSubmissions()
          await loadOverview()
          const wait = await waitForAiGradingComplete(submissionId)
          await loadSubmissions()
          await loadOverview()
          if (wait.failed) {
            ElMessage.error(wait.data?.ai_comment || 'AI 批改失败')
            return response
          }
          if (wait.ok && !wait.timeout) {
            ElMessage.success('AI批改完成')
          } else if (wait.timeout) {
            ElMessage.warning('等待超时，请稍后刷新列表')
          }
        } else {
          ElMessage.success('AI批改完成')
          await loadSubmissions()
          await loadOverview()
        }
        return response
      },
      true
    )
    if (!response || !response.success) return
  } catch (error) {
    const msg =
      error?.response?.data?.message ||
      error?.response?.data?.error ||
      error?.message ||
      '批改失败'
    ElMessage.error(msg)
    console.error(error)
  }
}

const batchGrade = async () => {
  try {
    const response = await withGradingLoading(
      true,
      async () => {
        const response = await batchAiGrade(route.params.taskId)
        if (!response.success) return response
        ElMessage.success(response.message || '已提交批量批改')
        await loadSubmissions()
        await loadOverview()
        const batchId = response.data?.batchId
        if (response.data?.async && batchId) {
          await pollBatchProgress(batchId)
        }
        return response
      },
      true
    )
    if (!response || !response.success) return
  } catch (error) {
    const msg =
      error?.response?.data?.message ||
      error?.response?.data?.error ||
      error?.message ||
      '批量批改失败'
    ElMessage.error(msg)
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

useRtOnDomains(['submissions', 'grading', 'tasks', 'similarity'], () => {
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

.head-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
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
