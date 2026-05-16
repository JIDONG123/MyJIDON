<template>
  <div class="page-submissions">
    <header class="page-head">
      <h1 class="page-title">我的提交</h1>
      <p class="page-desc">历次作业提交与批改状态，可跳转查看详细成绩报告</p>
    </header>

    <el-skeleton v-if="loading" animated :rows="6" class="sk-main" />

    <el-card v-else class="panel-card" shadow="never">
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

      <el-empty v-if="!submissions.length" description="暂无提交记录，请在任务详情中上传成果" :image-size="120">
        <template #image>
          <div class="empty-illus empty-illus--student">
            <el-icon><Document /></el-icon>
          </div>
        </template>
        <el-button type="primary" @click="$router.push('/student/tasks')">去看任务</el-button>
      </el-empty>

      <el-table
        v-else
        :data="submissions"
        :size="tableSize"
        stripe
        class="data-table"
        style="width: 100%"
      >
        <el-table-column prop="title" label="任务名称" min-width="160" show-overflow-tooltip />
        <el-table-column prop="file_name" label="提交文件" min-width="200" show-overflow-tooltip />
        <el-table-column label="提交时间" min-width="170" show-overflow-tooltip>
          <template #default="{ row }">
            {{ formatDateTime(row.submitted_at) }}
          </template>
        </el-table-column>
        <el-table-column prop="is_revised" label="是否修改">
          <template #default="scope">
            <el-tag :type="scope.row.is_revised ? 'warning' : 'success'" effect="plain" size="small">
              {{ scope.row.is_revised ? '是' : '否' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态">
          <template #default="scope">
            <el-tag :type="gradingStatusType(scope.row.status)" effect="plain" size="small">
              {{ gradingStatusText(scope.row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="total_score" label="AI评分" min-width="96" align="right" />
        <el-table-column prop="human_score" label="最终评分" min-width="96" align="right" />
        <el-table-column label="操作" width="108" align="center" fixed="right">
          <template #default="scope">
            <el-button class="action-link" link type="primary" @click="viewResult(scope.row.id)">
              查看结果
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Document } from '@element-plus/icons-vue'
import { getStudentSubmissions } from '../../api/submission'
import { formatDateTime } from '../../utils/format'
import { gradingStatusType, gradingStatusText } from '../../utils/gradingStatusDisplay'
import { useTableDensity } from '../../composables/useTableDensity'
import { useRtOnDomains } from '../../composables/useRtOnDomains'

const router = useRouter()
const { mode, tableSize, labelMap } = useTableDensity()

const submissions = ref([])
const loading = ref(true)

const loadSubmissions = async () => {
  loading.value = true
  try {
    const response = await getStudentSubmissions()
    if (response.success) {
      submissions.value = response.data
    }
  } catch (error) {
    console.error('获取提交列表失败:', error)
  } finally {
    loading.value = false
  }
}

const viewResult = (submissionId) => {
  router.push(`/student/results/${submissionId}`)
}

onMounted(() => {
  loadSubmissions()
})

useRtOnDomains(['submissions', 'grading', 'tasks'], () => {
  loadSubmissions()
})
</script>

<style scoped>
.page-submissions {
  max-width: 1400px;
}

.page-head {
  margin-bottom: 20px;
}

.page-title {
  margin: 0 0 8px;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
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

.panel-card {
  border-radius: var(--sg-radius-lg);
  border: 1px solid var(--sg-border);
}

.panel-card :deep(.el-card__body) {
  padding-top: 12px !important;
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

.toolbar :deep(.el-radio-button__inner) {
  padding: 6px 12px;
  font-size: 12px;
  border-radius: var(--sg-radius-sm) !important;
  box-shadow: none !important;
}

.toolbar :deep(.el-radio-button:first-child .el-radio-button__inner) {
  border-radius: var(--sg-radius-sm) 0 0 var(--sg-radius-sm) !important;
}

.toolbar :deep(.el-radio-button:last-child .el-radio-button__inner) {
  border-radius: 0 var(--sg-radius-sm) var(--sg-radius-sm) 0 !important;
}

.data-table {
  border-radius: var(--sg-radius-md);
}

.action-link {
  font-weight: 500;
  padding: 4px 2px !important;
}

.action-link:hover {
  text-decoration: underline;
  text-underline-offset: 3px;
}

.empty-illus {
  width: 120px;
  height: 120px;
  margin: 0 auto;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 48px;
}

.empty-illus--student {
  background: linear-gradient(145deg, #ecfdf5 0%, #d1fae5 100%);
  color: #059669;
}

.empty-illus :deep(svg) {
  color: inherit;
}
</style>
