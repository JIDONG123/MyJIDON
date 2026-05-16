<template>
  <div class="page-qb">
    <header class="page-head">
      <h1 class="page-title">习题练习</h1>
      <p class="page-desc">完成教师发布的随堂练习；客观题提交后自动判分，简答/编程题待教师批改。</p>
    </header>
    <el-card shadow="never" class="panel-card">
      <el-table v-loading="loading" :data="rows" border stripe>
        <el-table-column prop="title" label="练习" min-width="160" />
        <el-table-column label="截止" width="178">
          <template #default="{ row }">{{ formatDateTime(row.deadline_at) }}</template>
        </el-table-column>
        <el-table-column label="我的状态" width="120" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="studentPracticeStatusTagType(row)">{{ studentPracticeStatusLabel(row) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="total_score" label="得分" width="80" />
        <el-table-column label="操作" width="200" align="right">
          <template #default="{ row }">
            <el-button
              v-if="row.student_take_state === 'review'"
              type="primary"
              size="small"
              @click="goTake(row)"
            >
              查看
            </el-button>
            <el-button v-else-if="row.student_take_state === 'closed'" type="info" size="small" disabled>已截止</el-button>
            <el-button v-else type="primary" size="small" @click="goTake(row)">进入作答</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useRtOnDomains } from '../../composables/useRtOnDomains'
import { listStudentPractices } from '../../api/qb'
import { qbAttemptStatusLabel, qbAttemptStatusTagType } from '../../utils/qbLabels'
import { formatDateTime } from '../../utils/format'

const router = useRouter()
const loading = ref(false)
const rows = ref([])

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

function studentPracticeStatusLabel(row) {
  if (row.student_take_state === 'closed') return '已截止'
  return qbAttemptStatusLabel(row.my_status)
}

function studentPracticeStatusTagType(row) {
  if (row.student_take_state === 'closed') return 'danger'
  return qbAttemptStatusTagType(row.my_status)
}

useRtOnDomains(['qb_practices', 'scores'], () => load())

onMounted(load)
</script>

<style scoped>
.page-qb {
  max-width: 1100px;
}
.page-head {
  margin-bottom: 16px;
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
.panel-card {
  border-radius: var(--sg-radius-lg);
  border: 1px solid var(--sg-border);
}
</style>
