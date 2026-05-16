<template>
  <div class="page-submissions">
    <header class="page-head">
      <el-button type="primary" plain @click="$router.push('/enterprise/home')">返回</el-button>
      <h1 class="page-title">作业提交</h1>
      <p class="page-desc">查看本任务学生提交、查重提示与成绩；企业侧评分在批改页填写。</p>
    </header>
    <el-skeleton v-if="loading" :rows="6" animated />
    <el-card v-else shadow="never">
      <el-table :data="rows" stripe size="small">
        <el-table-column prop="student_name" label="学生" width="120" />
        <el-table-column label="提交时间" width="180">
          <template #default="{ row }">{{ formatDateTime(row.submitted_at) }}</template>
        </el-table-column>
        <el-table-column prop="max_similarity" label="相似度%" width="100">
          <template #default="{ row }">
            <span v-if="row.max_similarity != null">{{ Number(row.max_similarity).toFixed(1) }}</span>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column prop="similarity_level" label="查重" width="90">
          <template #default="{ row }">
            <el-tag v-if="row.similarity_level === 'high'" type="danger" size="small">高</el-tag>
            <el-tag v-else-if="row.similarity_level === 'warn'" type="warning" size="small">预警</el-tag>
            <el-tag v-else type="info" size="small">正常</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="final_score" label="综合分" width="90" />
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="$router.push(`/enterprise/grading/${row.id}`)">批改</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { getSubmissionsByTask } from '../../api/submission'
import { ElMessage } from 'element-plus'
import { formatDateTime } from '../../utils/format'

const route = useRoute()
const loading = ref(true)
const rows = ref([])

onMounted(async () => {
  const taskId = route.params.taskId
  try {
    const res = await getSubmissionsByTask(taskId)
    if (res.success) rows.value = res.data || []
  } catch (e) {
    ElMessage.error(e?.message || '加载失败')
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.page-head {
  margin-bottom: 16px;
}
.page-title {
  margin: 12px 0 4px;
  font-size: 20px;
}
.page-desc {
  margin: 0;
  color: var(--sg-text-secondary);
  font-size: 13px;
}
</style>
