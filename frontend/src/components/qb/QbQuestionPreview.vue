<template>
  <div class="qb-preview">
    <section class="qb-preview__section">
      <h4 class="qb-preview__title">题目信息</h4>
      <div class="qb-preview__meta">
        <el-tag size="small" effect="light" type="primary">{{ qbTypeLabel(question.type) }}</el-tag>
        <el-tag size="small" effect="light" :type="qbDifficultyTagType(question.difficulty)">
          {{ qbDifficultyLabel(question.difficulty) }}
        </el-tag>
        <span class="qb-preview__score">{{ question.default_score ?? '—' }} 分</span>
        <span v-if="question.course_label" class="qb-preview__course">{{ question.course_label }}</span>
      </div>
    </section>

    <section class="qb-preview__section">
      <h4 class="qb-preview__title">题干</h4>
      <div class="qb-preview__stem">{{ question.stem || '—' }}</div>
    </section>

    <section v-if="options.length" class="qb-preview__section">
      <h4 class="qb-preview__title">选项</h4>
      <ul class="qb-preview__options">
        <li v-for="opt in options" :key="opt.key">
          <strong>{{ opt.key }}.</strong> {{ opt.label }}
        </li>
      </ul>
    </section>

    <section class="qb-preview__section">
      <h4 class="qb-preview__title">参考答案</h4>
      <div class="qb-preview__block">{{ referenceDisplay }}</div>
    </section>

    <section class="qb-preview__section">
      <h4 class="qb-preview__title">解析 / 评分要点</h4>
      <div class="qb-preview__block">{{ explainDisplay }}</div>
    </section>

    <section v-if="question.type === 'code'" class="qb-preview__section">
      <h4 class="qb-preview__title">编程题配置</h4>
      <dl class="qb-preview__dl">
        <div class="qb-preview__dl-row">
          <dt>语言 / 说明</dt>
          <dd>{{ codeHint || '—' }}</dd>
        </div>
        <div class="qb-preview__dl-row">
          <dt>输入样例</dt>
          <dd>{{ codeInput || '—' }}</dd>
        </div>
        <div class="qb-preview__dl-row">
          <dt>输出样例</dt>
          <dd>{{ codeOutput || '—' }}</dd>
        </div>
        <div class="qb-preview__dl-row">
          <dt>测试用例</dt>
          <dd>{{ codeCases || '—' }}</dd>
        </div>
        <div class="qb-preview__dl-row">
          <dt>参考代码</dt>
          <dd><pre v-if="question.reference_answer" class="qb-preview__code">{{ question.reference_answer }}</pre><span v-else>—</span></dd>
        </div>
      </dl>
    </section>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { qbTypeLabel, qbDifficultyLabel, qbDifficultyTagType, parseJsonLoose } from '../../utils/qbLabels'

const props = defineProps({
  question: { type: Object, default: () => ({}) },
})

const options = computed(() => {
  const opts = parseJsonLoose(props.question?.options_json)
  return Array.isArray(opts) ? opts : []
})

const answerJson = computed(() => parseJsonLoose(props.question?.answer_json) || {})

const referenceDisplay = computed(() => {
  const t = props.question?.type
  const ref = String(props.question?.reference_answer || '').trim()
  const ans = answerJson.value
  if (t === 'judge') return ans.correct === false ? '错误' : '正确'
  if (t === 'single' || t === 'multi') {
    const c = ans.correct
    return Array.isArray(c) ? c.join('、') : c != null ? String(c) : ref || '—'
  }
  if (t === 'fill') return ans.correct != null ? String(ans.correct) : ref || '—'
  return ref || '—'
})

const explainDisplay = computed(() => {
  const ref = String(props.question?.reference_answer || '').trim()
  const t = props.question?.type
  if (t === 'short' || t === 'code') return ref || '—'
  return ref || '—'
})

const codeHint = computed(() => {
  const ans = answerJson.value
  return ans.hint || ans.note || ans.language || ''
})

const codeInput = computed(() => answerJson.value.input || answerJson.value.sampleInput || '')
const codeOutput = computed(() => answerJson.value.output || answerJson.value.sampleOutput || '')
const codeCases = computed(() => {
  const cases = answerJson.value.cases || answerJson.value.testCases
  if (!cases) return ''
  return typeof cases === 'string' ? cases : JSON.stringify(cases, null, 2)
})
</script>

<style scoped>
.qb-preview__section {
  margin-bottom: 20px;
}

.qb-preview__title {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 600;
  color: #475569;
}

.qb-preview__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.qb-preview__score,
.qb-preview__course {
  font-size: 13px;
  color: #64748b;
}

.qb-preview__stem,
.qb-preview__block {
  padding: 12px 14px;
  background: #f8fafc;
  border: 1px solid #eef2f7;
  border-radius: 8px;
  font-size: 14px;
  line-height: 1.65;
  color: #1e293b;
  white-space: pre-wrap;
  word-break: break-word;
}

.qb-preview__options {
  margin: 0;
  padding-left: 0;
  list-style: none;
}

.qb-preview__options li {
  padding: 8px 12px;
  margin-bottom: 6px;
  background: #f8fafc;
  border-radius: 8px;
  font-size: 14px;
}

.qb-preview__dl-row {
  display: grid;
  grid-template-columns: 96px 1fr;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid #f1f5f9;
  font-size: 13px;
}

.qb-preview__dl-row dt {
  color: #64748b;
}

.qb-preview__dl-row dd {
  margin: 0;
  color: #1e293b;
  white-space: pre-wrap;
  word-break: break-word;
}

.qb-preview__code {
  margin: 0;
  padding: 10px;
  background: #0f172a;
  color: #e2e8f0;
  border-radius: 8px;
  font-size: 12px;
  overflow-x: auto;
}
</style>
