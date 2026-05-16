<template>
  <div class="page-task-list">
    <header class="page-head">
      <div class="page-head-row">
        <div>
          <h1 class="page-title">任务管理</h1>
          <p class="page-desc">发布与维护实训任务，查看提交与批改入口</p>
        </div>
        <el-button type="primary" @click="goCreateTask">发布任务</el-button>
      </div>
    </header>

    <el-alert
      v-if="filterClassId"
      class="filter-banner"
      type="info"
      show-icon
      :closable="false"
    >
      <template #title>
        当前仅显示所选班级的任务（班级 ID {{ filterClassId }}）
        <el-button type="primary" link @click="clearClassFilter">查看全部任务</el-button>
      </template>
    </el-alert>

    <el-skeleton v-if="loading" animated :rows="6" class="sk-main" />

    <el-card v-else class="panel-card" shadow="never">
      <template #header>
        <div class="panel-header">
          <div>
            <span class="panel-title">任务列表</span>
            <span class="panel-sub">共 {{ displayedTasks.length }} 个</span>
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

      <el-empty
        v-if="!displayedTasks.length"
        :description="filterClassId ? '该班级下暂无任务，可发布新任务' : '暂无任务，点击右上角发布新任务'"
        :image-size="120"
      >
        <template #image>
          <div class="empty-illus">
            <el-icon><FolderOpened /></el-icon>
          </div>
        </template>
        <el-button type="primary" @click="goCreateTask">发布任务</el-button>
      </el-empty>

      <el-table
        v-else
        :data="displayedTasks"
        border
        :size="tableSize"
        stripe
        class="data-table"
        style="width: 100%"
      >
        <el-table-column prop="title" label="任务标题" min-width="160" show-overflow-tooltip />
        <el-table-column label="场景" width="100" align="center">
          <template #default="{ row }">
            <el-tag size="small" type="info">{{ scenarioLabel(row.scenario_type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="class_name" label="所属班级" min-width="120" show-overflow-tooltip />
        <el-table-column label="截止时间" width="180">
          <template #default="{ row }">{{ formatDateTime(row.deadline) }}</template>
        </el-table-column>
        <el-table-column label="完成进度" width="130" align="center">
          <template #default="{ row }">
            {{ Number(row.submittedStudentCount) || 0 }} / {{ Number(row.classStudentCount) || 0 }}
          </template>
        </el-table-column>
        <el-table-column prop="max_score" label="满分" width="90" align="center" />
        <el-table-column label="创建时间" width="180">
          <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="240" align="right" fixed="right">
          <template #default="scope">
            <el-button link type="primary" @click="editTask(scope.row.id)">编辑</el-button>
            <el-button link type="primary" @click="viewSubmissions(scope.row.id)">查看提交</el-button>
            <el-button link type="danger" @click="deleteTask(scope.row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { FolderOpened } from '@element-plus/icons-vue'
import { getAllTasks, deleteTask as apiDeleteTask } from '../../api/task'
import { useTableDensity } from '../../composables/useTableDensity'
import { formatDateTime } from '../../utils/format'
import { ElMessage } from 'element-plus'
import { useRtOnDomains } from '../../composables/useRtOnDomains'

const router = useRouter()
const route = useRoute()
const { mode, tableSize, labelMap } = useTableDensity()

const tasks = ref([])
const loading = ref(true)

const filterClassId = computed(() => route.query.classId || '')

const displayedTasks = computed(() => {
  const cid = filterClassId.value
  if (!cid) return tasks.value
  return tasks.value.filter((t) => String(t.class_id) === String(cid))
})

const goCreateTask = () => {
  const cid = filterClassId.value
  if (cid) {
    router.push({ path: '/teacher/tasks/create', query: { classId: String(cid) } })
  } else {
    router.push('/teacher/tasks/create')
  }
}

const clearClassFilter = () => {
  router.replace({ path: '/teacher/tasks', query: {} })
}

function scenarioLabel(type) {
  const m = { teaching: '教学', enterprise_collab: '校企', mixed: '综合' }
  return m[type] || '综合'
}

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

const editTask = (id) => {
  router.push(`/teacher/tasks/${id}/edit`)
}

const viewSubmissions = (id) => {
  router.push(`/teacher/submissions/${id}`)
}

const deleteTask = async (id) => {
  if (!confirm('确定要删除这个任务吗？')) return

  try {
    await apiDeleteTask(id)
    ElMessage.success('删除成功')
    loadTasks()
  } catch (error) {
    ElMessage.error('删除失败')
    console.error(error)
  }
}

onMounted(() => {
  loadTasks()
})

useRtOnDomains(['tasks', 'task_templates', 'submissions', 'grading', 'similarity'], () => {
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

.filter-banner {
  margin-bottom: 16px;
  border-radius: var(--sg-radius-lg);
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
