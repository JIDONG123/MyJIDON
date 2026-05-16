<template>
  <div class="sim-page">
    <header class="head">
      <el-button plain type="primary" @click="goBack">返回提交列表</el-button>
      <h1>查重对比</h1>
    </header>
    <el-skeleton v-if="loading" :rows="6" animated />
    <template v-else-if="data">
      <el-alert type="info" show-icon :closable="false" class="mb">
        当前提交最高相似度：<strong>{{ fmtPct(data.current.max_similarity) }}</strong> · 等级：{{
          levelText(data.current.similarity_level)
        }}
      </el-alert>
      <el-row :gutter="16">
        <el-col :xs="24" :lg="12">
          <el-card shadow="never">
            <template #header>
              <span>当前：{{ data.current.student_name }}（#{{ data.current.id }}）</span>
            </template>
            <p class="meta">{{ data.current.file_name || '无附件名' }}</p>
            <pre class="body">{{ data.current.contentPreview || '（无正文）' }}</pre>
          </el-card>
        </el-col>
        <el-col v-for="(c, idx) in data.compares" :key="c.id" :xs="24" :lg="12">
          <el-card shadow="never" class="other-card">
            <template #header>
              <span>对比 {{ idx + 1 }}：{{ c.student_name }}（#{{ c.id }}）· 约 {{ c.ratio }}%</span>
            </template>
            <p class="meta">{{ c.file_name || '无附件名' }}</p>
            <p v-if="c.snippet" class="snippet">{{ c.snippet }}</p>
            <pre class="body">{{ c.contentPreview || '（无正文）' }}</pre>
          </el-card>
        </el-col>
      </el-row>
      <el-empty v-if="!data.compares.length" description="暂无达到预警阈值的对比项（或尚未重新提交触发查重）" />
    </template>
  </div>
</template>

<script setup>
import { onMounted, ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getSimilarityCompare } from '../../api/submission'
import { ElMessage } from 'element-plus'

const route = useRoute()
const router = useRouter()
const loading = ref(true)
const data = ref(null)

const basePath = computed(() => (route.path.startsWith('/admin') ? '/admin' : '/teacher'))

const goBack = () => {
  router.push(`${basePath.value}/submissions/${route.params.taskId}`)
}

const fmtPct = (v) => {
  if (v == null || v === '') return '—'
  return `${Number(v).toFixed(1)}%`
}

const levelText = (lv) => {
  const m = { none: '无', low: '低', warn: '预警', high: '疑似抄袭' }
  return m[lv] || lv || '—'
}

onMounted(async () => {
  try {
    const res = await getSimilarityCompare(route.params.submissionId)
    if (res.success) data.value = res.data
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || e?.message || '加载失败')
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.sim-page {
  padding: 16px 20px 32px;
  max-width: 1400px;
}
.head {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}
.head h1 {
  margin: 0;
  font-size: 20px;
  color: var(--sg-text);
}
.mb {
  margin-bottom: 16px;
}
.meta {
  font-size: 12px;
  color: var(--sg-text-secondary);
  margin: 0 0 8px;
}
.snippet {
  font-size: 13px;
  color: #b45309;
  margin: 0 0 8px;
}
.body {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  line-height: 1.5;
  max-height: 420px;
  overflow: auto;
  background: var(--sg-bg-page, #f8fafc);
  padding: 12px;
  border-radius: 8px;
  border: 1px solid var(--sg-border);
}
.other-card {
  margin-bottom: 16px;
}
</style>
