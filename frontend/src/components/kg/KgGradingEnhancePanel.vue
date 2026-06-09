<template>
  <el-card v-if="submissionId" class="kg-enhance-card" shadow="never">
    <template #header>
      <span class="kg-enhance-title">知识图谱批改增强（只读参考）</span>
    </template>
    <div v-if="loading" class="kg-enhance-loading">加载图谱关联…</div>
    <template v-else-if="ctx">
      <p class="kg-task">{{ ctx.taskTitle }}</p>
      <div v-if="ctx.prerequisites?.length" class="block">
        <h4>前置知识点</h4>
        <ul>
          <li v-for="(p, i) in ctx.prerequisites" :key="i">{{ p.from }} → {{ p.to }}</li>
        </ul>
      </div>
      <div v-if="ctx.relatedExercises?.length" class="block">
        <h4>同类习题推荐</h4>
        <el-tag v-for="ex in ctx.relatedExercises" :key="ex.id" class="tag" size="small">{{ ex.name }}</el-tag>
      </div>
      <div v-if="ctx.knowledgeGaps?.length" class="block">
        <h4>知识漏洞提示</h4>
        <ul>
          <li v-for="(g, i) in ctx.knowledgeGaps" :key="i">{{ g }}</li>
        </ul>
      </div>
      <p v-if="ctx.note" class="note">{{ ctx.note }}</p>
    </template>
    <p v-else class="muted">暂无图谱增强数据（可先构建课程知识图谱）</p>
  </el-card>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import { getKgGradingContext } from '../../api/kg'

const props = defineProps({
  submissionId: { type: [String, Number], required: true },
})

const loading = ref(false)
const ctx = ref(null)

async function load() {
  if (!props.submissionId) return
  loading.value = true
  try {
    const res = await getKgGradingContext(props.submissionId)
    ctx.value = res.success ? res.data : null
  } catch {
    ctx.value = null
  } finally {
    loading.value = false
  }
}

watch(() => props.submissionId, load)
onMounted(load)
</script>

<style scoped>
.kg-enhance-card {
  margin-top: 16px;
  border-radius: 12px;
  border: 1px solid #e8eef5;
}
.kg-enhance-title {
  font-weight: 600;
  font-size: 14px;
}
.kg-enhance-loading {
  color: #64748b;
  font-size: 13px;
}
.kg-task {
  margin: 0 0 12px;
  font-weight: 500;
}
.block {
  margin-bottom: 12px;
}
.block h4 {
  margin: 0 0 6px;
  font-size: 13px;
  color: #334155;
}
.block ul {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.6;
}
.tag {
  margin: 0 6px 6px 0;
}
.note,
.muted {
  font-size: 12px;
  color: #94a3b8;
  margin: 0;
}
</style>
