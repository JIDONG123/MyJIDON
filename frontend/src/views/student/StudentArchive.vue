<template>
  <div class="page-archive">
    <header class="page-head">
      <h1 class="page-title">个人实训电子档案</h1>
      <p class="page-desc">按时间汇总您的提交、批改状态与薄弱知识点分析；仅本人可见。</p>
    </header>

    <el-card shadow="never" class="filter-card">
      <span class="filter-label">按任务筛选</span>
      <el-select
        v-model="filterTaskId"
        clearable
        placeholder="全部任务"
        style="width: 280px"
        @change="loadArchive"
      >
        <el-option
          v-for="t in taskOptions"
          :key="t.id"
          :label="t.title"
          :value="t.id"
        />
      </el-select>
    </el-card>

    <el-skeleton v-if="loading" animated :rows="6" />

    <el-empty v-else-if="!items.length" description="暂无提交记录" />

    <el-timeline v-else class="timeline">
      <el-timeline-item
        v-for="row in items"
        :key="row.submission_id"
        :timestamp="formatDateTime(row.submitted_at)"
        placement="top"
        type="primary"
      >
        <el-card shadow="never" class="tl-card">
          <div class="tl-head">
            <h3 class="tl-title">{{ row.task_title }}</h3>
            <el-tag size="small" effect="plain">{{ statusText(row) }}</el-tag>
          </div>
          <div class="tl-meta">
            <span>截止时间：{{ formatDateTime(row.deadline) }}</span>
            <span v-if="scoreDisplay(row) !== null">得分：{{ scoreDisplay(row) }}</span>
          </div>
          <div v-if="row.human_comment" class="tl-block">
            <span class="lbl">教师评语</span>
            <p>{{ row.human_comment }}</p>
          </div>
          <div v-else-if="row.ai_comment" class="tl-block">
            <span class="lbl">AI 评语</span>
            <p>{{ row.ai_comment }}</p>
          </div>
          <div v-if="row.weak_points?.length" class="tl-block weak">
            <span class="lbl">薄弱知识点 / 待加强</span>
            <ul>
              <li v-for="(w, i) in row.weak_points" :key="i">
                <strong>{{ w.label }}</strong>
                <span>{{ w.detail }}</span>
              </li>
            </ul>
          </div>
        </el-card>
      </el-timeline-item>
    </el-timeline>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { getMyArchive } from '../../api/user'
import { getTasksByClass } from '../../api/task'
import { useUserStore } from '../../stores/user'
import { formatDateTime } from '../../utils/format'

const userStore = useUserStore()
const loading = ref(true)
const items = ref([])
const taskOptions = ref([])
const filterTaskId = ref(null)

function statusText(row) {
  const s = row.grade_status
  if (!s) return '待批改'
  if (s === 'pending') return '待批改'
  if (s === 'ai_grading') return 'AI 批改中'
  if (s === 'ai_failed') return '批改失败'
  if (s === 'ai_graded') return 'AI 已批改'
  if (s === 'human_graded') return '教师已复核'
  return String(s)
}

function scoreDisplay(row) {
  if (row.final_score != null) return row.final_score
  if (row.total_score != null) return row.total_score
  return null
}

async function loadTaskOptions() {
  const cid = userStore.user?.classId
  if (!cid) {
    taskOptions.value = []
    return
  }
  try {
    const res = await getTasksByClass(Number(cid))
    if (res.success) taskOptions.value = res.data || []
  } catch (_) {
    taskOptions.value = []
  }
}

async function loadArchive() {
  loading.value = true
  try {
    const params = {}
    if (filterTaskId.value) params.taskId = filterTaskId.value
    const res = await getMyArchive(params)
    if (res.success) items.value = res.data || []
  } catch (_) {
    items.value = []
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await userStore.fetchUserInfo()
  await loadTaskOptions()
  await loadArchive()
})
</script>

<style scoped>
.page-archive {
  max-width: 960px;
  margin: 0 auto;
}

.page-head {
  margin-bottom: 20px;
}

.page-title {
  margin: 0 0 8px;
  font-size: 22px;
  font-weight: 700;
  color: var(--sg-text);
}

.page-desc {
  margin: 0;
  font-size: 14px;
  color: var(--sg-text-secondary);
}

.filter-card {
  margin-bottom: 20px;
  border-radius: 12px;
}

.filter-label {
  margin-right: 12px;
  font-size: 14px;
  color: var(--sg-text-secondary);
}

.timeline {
  padding-left: 4px;
}

.tl-card {
  border-radius: 12px;
  margin-bottom: 4px;
}

.tl-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 8px;
}

.tl-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.tl-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  font-size: 13px;
  color: var(--sg-text-secondary);
  margin-bottom: 12px;
}

.tl-block {
  margin-top: 10px;
  font-size: 14px;
  color: var(--sg-text);
  line-height: 1.55;
}

.tl-block .lbl {
  display: block;
  font-size: 12px;
  color: var(--sg-text-secondary);
  margin-bottom: 6px;
}

.tl-block p {
  margin: 0;
}

.tl-block.weak ul {
  margin: 0;
  padding-left: 18px;
}

.tl-block.weak li {
  margin-bottom: 8px;
}

.tl-block.weak strong {
  display: block;
  font-size: 12px;
  margin-bottom: 2px;
  color: var(--sg-text-secondary);
}
</style>
