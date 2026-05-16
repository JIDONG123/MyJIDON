<template>
  <div class="ent-page">
    <p class="hint">以下为管理员为您授权的班级及实训任务，仅可查看与批改关联作业。</p>
    <el-skeleton v-if="loading" :rows="4" animated />
    <el-empty v-else-if="!classes.length" description="暂无授权班级" />
    <div v-else class="class-stack">
      <el-card v-for="c in classes" :key="c.id" class="class-card" shadow="hover">
        <template #header>
          <div class="card-head">
            <span>{{ c.class_name }}</span>
            <el-tag size="small" type="info">{{ c.major || '—' }} · {{ c.grade || '—' }}</el-tag>
          </div>
        </template>
        <el-table v-loading="tasksLoading[c.id]" :data="tasksByClass[c.id] || []" size="small" stripe>
          <el-table-column prop="title" label="任务" min-width="160" />
          <el-table-column label="截止" width="180">
            <template #default="{ row }">{{ formatDateTime(row.deadline) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="140" fixed="right">
            <template #default="{ row }">
              <el-button type="primary" link @click="goSubmissions(row.id)">作业列表</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </div>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getAllClasses } from '../../api/class'
import { getTasksByClass } from '../../api/task'
import { ElMessage } from 'element-plus'
import { formatDateTime } from '../../utils/format'

const router = useRouter()
const loading = ref(true)
const classes = ref([])
const tasksByClass = reactive({})
const tasksLoading = reactive({})

const load = async () => {
  loading.value = true
  try {
    const res = await getAllClasses()
    if (res.success) {
      classes.value = res.data || []
      for (const c of classes.value) {
        tasksLoading[c.id] = true
        getTasksByClass(c.id)
          .then((r) => {
            tasksByClass[c.id] = r.success ? r.data || [] : []
          })
          .catch(() => {
            tasksByClass[c.id] = []
          })
          .finally(() => {
            tasksLoading[c.id] = false
          })
      }
    }
  } catch (e) {
    ElMessage.error(e?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

const goSubmissions = (taskId) => {
  router.push(`/enterprise/submissions/${taskId}`)
}

onMounted(load)
</script>

<style scoped>
.ent-page {
  max-width: 960px;
}
.hint {
  color: var(--sg-text-secondary);
  font-size: 13px;
  margin: 0 0 16px;
}
.class-stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
</style>
