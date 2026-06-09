<template>
  <div class="tw-page ent-submissions">
    <header class="tw-head">
      <div class="tw-head__left">
        <el-button plain @click="$router.push('/enterprise/home')">返回工作台</el-button>
        <div>
          <h1 class="tw-title">企业评价列表</h1>
          <p class="tw-subtitle">
            查看本任务学生提交、AI 批改结果与教师复核结果，并完成企业侧评分。
          </p>
        </div>
      </div>
    </header>

    <el-skeleton v-if="loading" animated :rows="8" />

    <template v-else>
      <section v-if="task" class="task-summary tw-panel">
        <div class="task-summary__grid">
          <div class="task-summary__item">
            <span class="task-summary__label">任务名称</span>
            <strong class="task-summary__value">{{ task.title }}</strong>
          </div>
          <div class="task-summary__item">
            <span class="task-summary__label">班级 / 教学班</span>
            <strong class="task-summary__value">{{ scopeLabel }}</strong>
          </div>
          <div class="task-summary__item">
            <span class="task-summary__label">提交人数</span>
            <strong class="task-summary__value">{{ rows.length }}</strong>
          </div>
          <div class="task-summary__item">
            <span class="task-summary__label">待企业评价</span>
            <strong class="task-summary__value task-summary__value--warn">{{ listStats.pending }}</strong>
          </div>
          <div class="task-summary__item">
            <span class="task-summary__label">已企业评价</span>
            <strong class="task-summary__value task-summary__value--ok">{{ listStats.done }}</strong>
          </div>
          <div class="task-summary__item">
            <span class="task-summary__label">截止时间</span>
            <strong class="task-summary__value">{{ formatDateTime(task.deadline) }}</strong>
          </div>
        </div>
      </section>

      <section class="tw-panel tw-filter-bar">
        <div class="filter-toolbar">
          <el-select v-model="filterReview" placeholder="评价状态" clearable class="filter-item">
            <el-option label="全部" value="" />
            <el-option label="待评价" value="pending" />
            <el-option label="已评价" value="done" />
          </el-select>
          <el-select v-model="filterSimilarity" placeholder="查重状态" clearable class="filter-item">
            <el-option label="全部" value="" />
            <el-option label="正常" value="normal" />
            <el-option label="预警" value="warn" />
          </el-select>
          <el-input
            v-model="keyword"
            placeholder="搜索学生姓名 / 学号"
            clearable
            class="filter-item filter-item--search"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
        </div>
      </section>

      <section class="tw-panel">
        <div class="tw-panel__header">
          <h2 class="tw-panel__title">学生提交列表</h2>
          <span class="tw-panel__meta">共 {{ filteredRows.length }} 条</span>
        </div>
        <div class="tw-panel__body tw-panel__body--flush">
          <el-table :data="filteredRows" stripe class="ent-table">
            <el-table-column prop="student_name" label="学生" width="110" />
            <el-table-column label="学号" width="120">
              <template #default="{ row }">{{ studentNoDisplay(row) }}</template>
            </el-table-column>
            <el-table-column label="提交时间" width="168">
              <template #default="{ row }">{{ formatDateTime(row.submitted_at) }}</template>
            </el-table-column>
            <el-table-column label="提交文件" min-width="140" show-overflow-tooltip>
              <template #default="{ row }">{{ row.file_name || '—' }}</template>
            </el-table-column>
            <el-table-column label="查重状态" width="96">
              <template #default="{ row }">
                <el-tag size="small" :type="similarityFilterMeta(row.similarity_level).type">
                  {{ similarityFilterMeta(row.similarity_level).text }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="AI 分" width="80" align="center">
              <template #default="{ row }">{{ displayScore(row.total_score) }}</template>
            </el-table-column>
            <el-table-column label="教师分" width="80" align="center">
              <template #default="{ row }">{{ displayScore(row.human_score) }}</template>
            </el-table-column>
            <el-table-column label="当前综合分" width="100" align="center">
              <template #default="{ row }">{{ displayScore(row.final_score) }}</template>
            </el-table-column>
            <el-table-column label="企业评价状态" width="120">
              <template #default="{ row }">
                <el-tag size="small" :type="enterpriseReviewMeta(row).type">
                  {{ enterpriseReviewMeta(row).text }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="120" fixed="right">
              <template #default="{ row }">
                <el-button type="primary" link @click="goReview(row.id)">查看并评价</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getSubmissionsByTask } from '../../api/submission'
import { getTaskById } from '../../api/task'
import { ElMessage } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import { formatDateTime } from '../../utils/format'
import {
  countSubmissionEnterpriseStats,
  displayScore,
  enterpriseReviewMeta,
  filterEnterpriseRows,
  similarityFilterMeta,
  studentNoDisplay,
  taskScopeLabel,
} from '../../utils/enterpriseWorkbench'

const route = useRoute()
const router = useRouter()
const loading = ref(true)
const rows = ref([])
const task = ref(null)
const filterReview = ref('')
const filterSimilarity = ref('')
const keyword = ref('')

const scopeLabel = computed(() => taskScopeLabel(task.value))
const listStats = computed(() => countSubmissionEnterpriseStats(rows.value))
const filteredRows = computed(() =>
  filterEnterpriseRows(rows.value, {
    reviewStatus: filterReview.value,
    similarityStatus: filterSimilarity.value,
    keyword: keyword.value,
  })
)

const goReview = (submissionId) => {
  router.push(`/enterprise/grading/${submissionId}`)
}

onMounted(async () => {
  const taskId = route.params.taskId
  loading.value = true
  try {
    const [taskRes, subRes] = await Promise.all([
      getTaskById(taskId),
      getSubmissionsByTask(taskId),
    ])
    if (taskRes.success) task.value = taskRes.data
    if (subRes.success) rows.value = subRes.data || []
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || e?.message || '加载失败')
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.ent-submissions {
  background: #eef2f7;
}
.tw-head__left {
  align-items: flex-start;
}
.task-summary {
  padding: 18px 20px;
  margin-bottom: 16px;
}
.task-summary__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px 24px;
}
.task-summary__label {
  display: block;
  font-size: 12px;
  color: #64748b;
  margin-bottom: 4px;
}
.task-summary__value {
  font-size: 15px;
  color: #0f172a;
}
.task-summary__value--warn {
  color: #ea580c;
}
.task-summary__value--ok {
  color: #0d9488;
}
.filter-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.filter-item {
  width: 160px;
}
.filter-item--search {
  width: 220px;
}
.ent-table :deep(.el-table__header th) {
  background: #f8fafc;
}
</style>
