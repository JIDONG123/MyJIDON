<template>
  <div class="op-ai-review">
    <div class="op-ai-review__head">
      <span class="op-ai-review__title">AI 代码规范参考分</span>
      <el-button
        type="primary"
        plain
        size="small"
        :loading="reviewing"
        :disabled="!canRequest"
        @click="$emit('request')"
      >
        AI 点评
      </el-button>
    </div>

    <p v-if="hint" class="op-ai-review__hint">{{ hint }}</p>

    <el-skeleton v-if="reviewing" animated :rows="4" />

    <template v-else-if="review">
      <div class="op-ai-review__score-row">
        <div class="op-ai-review__score">{{ review.styleScore ?? '—' }}</div>
        <div class="op-ai-review__score-meta">
          <el-tag size="small" type="info" effect="plain">练习参考</el-tag>
          <span class="op-ai-review__disclaimer">不计入正式成绩报告</span>
        </div>
      </div>

      <div v-if="review.review" class="op-ai-review__sections">
        <section v-if="review.review.strengths?.length">
          <h4>代码优点</h4>
          <ul>
            <li v-for="(item, i) in review.review.strengths" :key="'s' + i">{{ item }}</li>
          </ul>
        </section>
        <section v-if="review.review.issues?.length">
          <h4>存在问题</h4>
          <ul class="list-warn">
            <li v-for="(item, i) in review.review.issues" :key="'i' + i">{{ item }}</li>
          </ul>
        </section>
        <section v-if="review.review.suggestions?.length">
          <h4>修改建议</h4>
          <ul>
            <li v-for="(item, i) in review.review.suggestions" :key="'g' + i">{{ item }}</li>
          </ul>
        </section>
        <section v-if="review.review.knowledgeTips?.length">
          <h4>知识点提示</h4>
          <ul class="list-tip">
            <li v-for="(item, i) in review.review.knowledgeTips" :key="'k' + i">{{ item }}</li>
          </ul>
        </section>
      </div>
    </template>

    <div v-else class="op-ai-review__empty">
      <p>运行代码后可点击「AI 点评」获取代码规范参考分与改进建议。</p>
    </div>
  </div>
</template>

<script setup>
defineProps({
  review: { type: Object, default: null },
  reviewing: { type: Boolean, default: false },
  canRequest: { type: Boolean, default: false },
  hint: { type: String, default: '' },
})

defineEmits(['request'])
</script>

<style scoped>
.op-ai-review {
  margin-top: 12px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(15, 23, 42, 0.06);
  padding: 14px 16px;
  flex-shrink: 0;
}

.op-ai-review__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}

.op-ai-review__title {
  font-size: 13px;
  font-weight: 700;
  color: var(--sg-text);
}

.op-ai-review__hint {
  margin: 0 0 10px;
  font-size: 12px;
  color: var(--sg-text-placeholder);
  line-height: 1.5;
}

.op-ai-review__score-row {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--sg-border);
}

.op-ai-review__score {
  font-size: 36px;
  font-weight: 800;
  line-height: 1;
  color: var(--sg-primary);
  font-variant-numeric: tabular-nums;
}

.op-ai-review__score-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.op-ai-review__disclaimer {
  font-size: 11px;
  color: var(--sg-text-placeholder);
}

.op-ai-review__sections section {
  margin-bottom: 12px;
}

.op-ai-review__sections h4 {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 700;
  color: var(--sg-text-secondary);
}

.op-ai-review__sections ul {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.55;
  color: var(--sg-text);
}

.op-ai-review__sections li + li {
  margin-top: 4px;
}

.list-warn li {
  color: #b45309;
}

.list-tip li {
  color: #0369a1;
}

.op-ai-review__empty {
  padding: 8px 0 4px;
  font-size: 12px;
  color: var(--sg-text-placeholder);
  line-height: 1.55;
}

.op-ai-review__empty p {
  margin: 0;
}
</style>
