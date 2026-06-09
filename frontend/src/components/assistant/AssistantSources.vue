<template>
  <div v-if="sources?.length" class="sources">
    <h4 class="sources__title">参考资料</h4>
    <div v-for="(src, idx) in sources" :key="idx" class="source-card">
      <div class="source-card__head">
        <span class="source-card__title">{{ src.title || '未命名文档' }}</span>
        <el-tag size="small" effect="plain" class="source-card__cat">{{ categoryLabel(src.category) }}</el-tag>
      </div>
      <p class="source-card__snippet">{{ src.snippet || '—' }}</p>
      <span v-if="src.score != null" class="source-card__score">相似度 {{ formatScore(src.score) }}</span>
    </div>
  </div>
  <p v-else-if="mode === 'general_advice'" class="sources-fallback">
    未检索到直接相关的教师知识库内容，以下为通用学习建议，具体以教师要求为准。
  </p>
  <p v-else-if="mode === 'need_teacher_confirm'" class="sources-fallback sources-fallback--confirm">
    涉及评分细则或标准答案，请以教师发布的任务要求与评分标准为准，以下回答仅供参考。
  </p>
</template>

<script setup>
import { categoryLabel } from '../../utils/assistantDisplay'

defineProps({
  sources: { type: Array, default: () => [] },
  mode: { type: String, default: '' },
})

function formatScore(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return `${(n * 100).toFixed(1)}%`
}
</script>

<style scoped>
.sources__title {
  margin: 10px 0 8px;
  font-size: 12px;
  font-weight: 700;
  color: #475569;
}

.source-card {
  padding: 10px 12px;
  margin-bottom: 8px;
  border-radius: 10px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
}

.source-card__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.source-card__title {
  font-size: 13px;
  font-weight: 600;
  color: #0f172a;
}

.source-card__cat {
  border: none !important;
  background: #e2e8f0 !important;
  color: #475569 !important;
}

.source-card__snippet {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: #64748b;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.source-card__score {
  display: inline-block;
  margin-top: 6px;
  font-size: 11px;
  color: #94a3b8;
}

.sources-fallback {
  margin: 10px 0 0;
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.55;
  color: #64748b;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 10px;
}

.sources-fallback--confirm {
  background: #eff6ff;
  border-color: #bfdbfe;
  color: #1e40af;
}
</style>
