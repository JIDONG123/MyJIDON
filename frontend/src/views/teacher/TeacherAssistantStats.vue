<template>
  <div class="page-stats">
    <header class="page-head">
      <h1 class="page-title">学生助手统计</h1>
      <p class="page-desc">聚合本班学生向 AI 助手提问的内容（相同问题合并计数），便于了解共性疑惑。</p>
    </header>

    <el-card shadow="never" class="card">
      <el-table v-loading="loading" :data="rows" stripe empty-text="暂无数据">
        <el-table-column type="index" label="#" width="56" />
        <el-table-column prop="text" label="问题内容（节选）" min-width="320" show-overflow-tooltip />
        <el-table-column prop="count" label="次数" width="100" align="center" sortable />
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { getAssistantTeacherStats } from '../../api/analytics'
import { ElMessage } from 'element-plus'

const loading = ref(true)
const rows = ref([])

onMounted(async () => {
  try {
    const res = await getAssistantTeacherStats()
    if (res.success) rows.value = res.data?.topQuestions || []
    else ElMessage.error(res.message || '加载失败')
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '加载失败')
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.page-stats {
  max-width: 960px;
}
.page-head {
  margin-bottom: 16px;
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
.card {
  border-radius: var(--sg-radius-lg);
}
</style>
