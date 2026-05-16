<template>
  <div class="page-task-list">
    <header class="page-head">
      <div class="page-head-row">
        <div>
          <h1 class="page-title">任务管理</h1>
          <p class="page-desc">支撑校企协同：可按场景标记任务并维护教学与企业双侧标准</p>
        </div>
        <el-button type="primary" @click="goCreate">发布任务</el-button>
      </div>
    </header>

    <el-skeleton v-if="loading" animated :rows="6" class="sk-main" />

    <el-card v-else class="panel-card" shadow="never">
      <template #header>
        <div class="panel-header">
          <div>
            <span class="panel-title">任务列表</span>
            <span class="panel-sub">共 {{ tasks.length }} 个</span>
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

      <el-empty v-if="!tasks.length" description="暂无任务" :image-size="120">
        <template #image>
          <div class="empty-illus">
            <el-icon><FolderOpened /></el-icon>
          </div>
        </template>
        <el-button type="primary" @click="goCreate">发布任务</el-button>
      </el-empty>

      <el-table
        v-else
        :data="tasks"
        border
        :size="tableSize"
        stripe
        class="data-table"
        style="width: 100%"
      >
        <el-table-column prop="title" label="任务标题" min-width="160" show-overflow-tooltip />
        <el-table-column label="场景" width="130" align="center">
          <template #default="{ row }">
            <el-tag size="small" type="info">{{ scenarioLabel(row.scenario_type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="class_name" label="所属班级" width="120" />
        <el-table-column label="综合分权重" width="120" align="center">
          <template #default="scope">
            <el-tag v-if="hasTaskWeights(scope.row)" type="info" size="small">任务自定义</el-tag>
            <el-tag v-else type="success" size="small">跟随系统</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="截止时间" width="180">
          <template #default="{ row }">{{ formatDateTime(row.deadline) }}</template>
        </el-table-column>
        <el-table-column prop="max_score" label="满分" width="80" />
        <el-table-column prop="creator_name" label="创建者" width="100" />
        <el-table-column label="创建时间" width="180">
          <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right" align="right">
          <template #default="scope">
            <el-button type="primary" link @click="goEdit(scope.row.id)">编辑</el-button>
            <el-button type="primary" link @click="viewSubmissions(scope.row.id)">查看提交</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { FolderOpened } from '@element-plus/icons-vue'
import { getAllTasks } from '../../api/task'
import { useTableDensity } from '../../composables/useTableDensity'
import { formatDateTime } from '../../utils/format'
import { useRtOnDomains } from '../../composables/useRtOnDomains'

const router = useRouter()
const { mode, tableSize, labelMap } = useTableDensity()

function scenarioLabel(type) {
  const m = {
    teaching: '教学',
    enterprise_collab: '校企',
    mixed: '综合',
  }
  return m[type] || '综合'
}

const tasks = ref([])
const loading = ref(true)

const hasTaskWeights = (row) =>
  row.score_ai_weight != null &&
  row.score_human_weight != null &&
  row.score_ai_weight !== '' &&
  row.score_human_weight !== ''

const loadTasks = async () => {
  try {
    const response = await getAllTasks()
    if (response.success) {
      tasks.value = response.data
    }
  } catch (error) {
    console.error('获取任务列表失败:', error)
  } finally {
    loading.value = false
  }
}

const goCreate = () => {
  router.push('/admin/tasks/create')
}

const goEdit = (id) => {
  router.push(`/admin/tasks/${id}/edit`)
}

const viewSubmissions = (taskId) => {
  router.push(`/admin/submissions/${taskId}`)
}

onMounted(() => {
  loadTasks()
})

useRtOnDomains(['tasks', 'task_templates', 'submissions', 'grading'], () => {
  loadTasks()
})
</script>

<style scoped>
.page-task-list {
  max-width: 1400px;
}

.page-head {
  margin-bottom: 20px;
}

.page-head-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
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
