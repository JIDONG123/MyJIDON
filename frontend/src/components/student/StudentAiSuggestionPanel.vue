<template>
  <el-collapse v-if="items.length" class="panel ai-suggest-panel">
    <el-collapse-item title="AI 辅助评分建议（供参考）" name="ai">
      <p class="ai-suggest-note">
        以下为 AI 对主观题的建议得分与说明，仅供参考，最终以教师批改为准。
      </p>
      <div class="ai-suggest-list">
        <article
          v-for="(item, idx) in items"
          :key="item.id || `ai-${idx}`"
          class="ai-suggest-card"
        >
          <header class="ai-suggest-card__head">
            <span v-if="item.questionNo != null" class="ai-suggest-card__no">
              第 {{ item.questionNo }} 题
            </span>
            <span v-else class="ai-suggest-card__no">评分说明</span>
            <el-tag
              v-if="item.suggestedScore != null"
              size="small"
              type="info"
              effect="plain"
            >
              建议 {{ item.suggestedScoreText }}
            </el-tag>
          </header>
          <p class="ai-suggest-card__body">{{ item.rationale }}</p>
          <ul v-if="item.keyPoints.length" class="ai-suggest-card__points">
            <li v-for="(pt, pi) in item.keyPoints" :key="pi">{{ pt }}</li>
          </ul>
        </article>
      </div>
    </el-collapse-item>
  </el-collapse>
</template>

<script setup>
defineProps({
  items: { type: Array, default: () => [] },
})
</script>

<style scoped>
.ai-suggest-panel {
  padding: 0 18px;
}

.ai-suggest-panel :deep(.el-collapse-item__header) {
  font-weight: 600;
  color: #475569;
}

.ai-suggest-note {
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.6;
  color: #64748b;
}

.ai-suggest-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ai-suggest-card {
  padding: 12px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #f8fafc;
}

.ai-suggest-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}

.ai-suggest-card__no {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
}

.ai-suggest-card__body {
  margin: 0;
  font-size: 13px;
  line-height: 1.65;
  color: #475569;
  white-space: pre-wrap;
}

.ai-suggest-card__points {
  margin: 10px 0 0;
  padding-left: 18px;
  font-size: 12px;
  line-height: 1.55;
  color: #64748b;
}

.ai-suggest-card__points li + li {
  margin-top: 4px;
}
</style>
