<template>
  <div v-if="deep" class="lc-deep">
    <h4 class="lc-deep-title">LangChain 深度解析</h4>
    <p v-if="deep.engine" class="lc-deep-meta">{{ deep.engine }}</p>
    <div v-if="chainLine" class="lc-deep-steps">
      <el-tag v-for="s in deep.chainSteps || []" :key="s.step" size="small" :type="s.ok ? 'success' : 'info'" class="lc-tag">
        {{ s.step }}. {{ s.label }}
      </el-tag>
    </div>
    <p v-if="deep.parseSummary" class="lc-block">
      <span class="lc-label">解析摘要</span>
      {{ deep.parseSummary }}
    </p>
    <div v-if="(deep.knowledgePoints || []).length" class="lc-block">
      <span class="lc-label">知识点 / 课标锚点</span>
      <ul>
        <li v-for="(k, i) in deep.knowledgePoints" :key="i">{{ k }}</li>
      </ul>
    </div>
    <div v-if="(deep.errorSummary || []).length" class="lc-block">
      <span class="lc-label">错误与定位</span>
      <ul>
        <li v-for="(e, i) in deep.errorSummary" :key="i">
          <template v-if="typeof e === 'object'">
            <strong>{{ e.where || '位置' }}</strong> — {{ e.detail || '' }}
          </template>
          <template v-else>{{ e }}</template>
        </li>
      </ul>
    </div>
    <div v-if="(deep.weaknesses || []).length" class="lc-block">
      <span class="lc-label">薄弱项</span>
      <ul>
        <li v-for="(w, i) in deep.weaknesses" :key="i">{{ w }}</li>
      </ul>
    </div>
    <div v-if="(deep.suspiciousPatterns || []).length" class="lc-block lc-warn">
      <span class="lc-label">安全校验</span>
      <ul>
        <li v-for="(s, i) in deep.suspiciousPatterns" :key="i">{{ s }}</li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  verificationResult: { type: Object, default: null },
})

const deep = computed(() => props.verificationResult?.langchainDeep || null)

const chainLine = computed(() => (deep.value?.chainSteps || []).length > 0)
</script>

<style scoped>
.lc-deep {
  margin-top: 16px;
  padding: 14px 16px;
  border-radius: var(--sg-radius-md, 8px);
  background: linear-gradient(135deg, #f6f9ff 0%, #f0f7ff 100%);
  border: 1px solid var(--sg-border, #e4e7ed);
}
.lc-deep-title {
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--sg-text, #303133);
}
.lc-deep-meta {
  margin: 0 0 10px;
  font-size: 12px;
  color: var(--sg-text-secondary, #606266);
}
.lc-deep-steps {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}
.lc-tag {
  margin: 0;
}
.lc-block {
  margin: 10px 0 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--sg-text, #303133);
}
.lc-label {
  display: block;
  font-weight: 600;
  margin-bottom: 4px;
  color: var(--sg-text-secondary, #606266);
  font-size: 12px;
}
.lc-block ul {
  margin: 4px 0 0;
  padding-left: 1.2em;
}
.lc-warn {
  border-left: 3px solid #e6a23c;
  padding-left: 10px;
}
</style>
