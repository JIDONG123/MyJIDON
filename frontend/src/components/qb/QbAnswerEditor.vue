<template>
  <div class="qb-answer-editor" :class="{ 'qb-answer-editor--exam': optionStyle === 'exam' }">
    <!-- 单选题 -->
    <template v-if="question.type === 'single'">
      <div v-if="displayOpts.length" class="opt-list">
        <el-radio-group
          :model-value="singleNormalized"
          :disabled="disabled"
          class="opt-radio-group"
          @update:model-value="emit('update:modelValue', $event)"
        >
          <el-radio v-for="o in displayOpts" :key="o.key" :value="String(o.key).trim().toUpperCase()" class="opt-line">
            <span class="opt-key">{{ o.key }}.</span>
            <span class="opt-text">{{ o.label }}</span>
          </el-radio>
        </el-radio-group>
      </div>
      <el-alert v-else type="warning" show-icon :closable="false" title="本题缺少选项配置，请用文字作答（填写选项字母）。" />
      <el-input
        v-if="!displayOpts.length"
        :model-value="modelValue"
        :disabled="disabled"
        placeholder="请输入选项字母，如 A"
        class="mt10"
        @update:model-value="emit('update:modelValue', $event)"
      />
    </template>

    <!-- 多选题 -->
    <template v-else-if="question.type === 'multi'">
      <div v-if="displayOpts.length" class="opt-list">
        <el-checkbox-group v-model="multiKeys" :disabled="disabled" class="opt-check-group" @change="onMultiChange">
          <el-checkbox v-for="o in displayOpts" :key="o.key" :value="String(o.key).trim().toUpperCase()" class="opt-line">
            <span class="opt-key">{{ o.key }}.</span>
            <span class="opt-text">{{ o.label }}</span>
          </el-checkbox>
        </el-checkbox-group>
        <p class="field-hint">可选择多项；提交时系统将按字母汇总。</p>
      </div>
      <el-alert v-else type="warning" show-icon :closable="false" title="本题缺少选项配置，请用半角逗号分隔选项字母，如 A,C,D" />
      <el-input
        v-if="!displayOpts.length"
        :model-value="modelValue"
        :disabled="disabled"
        placeholder="例：A,C,D"
        class="mt10"
        @update:model-value="emit('update:modelValue', $event)"
      />
    </template>

    <!-- 判断题 -->
    <template v-else-if="question.type === 'judge'">
      <el-radio-group
        :model-value="judgeNormalized"
        :disabled="disabled"
        class="opt-radio-group judge-group"
        @update:model-value="emit('update:modelValue', $event)"
      >
        <el-radio value="对" size="large">正确</el-radio>
        <el-radio value="错" size="large">错误</el-radio>
      </el-radio-group>
    </template>

    <!-- 填空 -->
    <template v-else-if="question.type === 'fill'">
      <el-input
        :model-value="modelValue"
        :disabled="disabled"
        placeholder="请填写答案"
        clearable
        @update:model-value="emit('update:modelValue', $event)"
      />
    </template>

    <!-- 简答 -->
    <template v-else-if="question.type === 'short'">
      <el-input
        :model-value="modelValue"
        :disabled="disabled"
        type="textarea"
        :rows="shortRows"
        placeholder="请作答（支持多段文字）"
        @update:model-value="emit('update:modelValue', $event)"
      />
      <p v-if="charCountVisible" class="char-count">{{ charLen }} 字</p>
    </template>

    <!-- 编程 -->
    <template v-else-if="question.type === 'code'">
      <el-input
        :model-value="modelValue"
        :disabled="disabled"
        type="textarea"
        :rows="codeRows"
        placeholder="请粘贴代码或作答说明（具体评分以教师为准）"
        class="code-area"
        spellcheck="false"
        @update:model-value="emit('update:modelValue', $event)"
      />
      <p v-if="charCountVisible" class="char-count">{{ charLen }} 字</p>
    </template>

    <template v-else>
      <el-input
        :model-value="modelValue"
        :disabled="disabled"
        type="textarea"
        :rows="fallbackRows"
        placeholder="请作答"
        @update:model-value="emit('update:modelValue', $event)"
      />
      <p v-if="charCountVisible" class="char-count">{{ charLen }} 字</p>
    </template>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, computed } from 'vue'

const props = defineProps({
  question: { type: Object, required: true },
  modelValue: { type: String, default: '' },
  /** 是否打乱选项顺序（仅客观选项题） */
  shuffleOptions: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  /** 答题工作台紧凑模式：缩小主观/代码题高度，便于一屏内展示 */
  dense: { type: Boolean, default: false },
  /** 在主观类输入下方显示字数 */
  charCountVisible: { type: Boolean, default: false },
  /** default | exam — 考试模式选项整行可点样式 */
  optionStyle: { type: String, default: 'default' },
})

const emit = defineEmits(['update:modelValue'])

const shortRows = computed(() => (props.dense ? 5 : 8))
const codeRows = computed(() => (props.dense ? 9 : 14))
const fallbackRows = computed(() => (props.dense ? 3 : 4))

const charLen = computed(() => String(props.modelValue || '').length)

const displayOpts = ref([])

function shuffleOptions(arr) {
  const a = [...arr]
  if (a.length < 2) return a
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function buildDisplayOpts() {
  const raw = props.question?.options_json
  const list = Array.isArray(raw) ? raw.filter((x) => x && String(x.key ?? '').trim() && String(x.label ?? '').trim()) : []
  displayOpts.value = props.shuffleOptions ? shuffleOptions(list) : list
}

onMounted(buildDisplayOpts)
watch(
  () => [props.question?.question_id, props.question?.pq_id, props.question?.eq_id, props.shuffleOptions],
  () => buildDisplayOpts()
)

const singleNormalized = computed(() => String(props.modelValue || '').trim().toUpperCase())

const multiKeys = ref([])
watch(
  () => props.modelValue,
  (v) => {
    const s = String(v || '').trim()
    multiKeys.value = s
      ? [...new Set(s.split(/[,，;；\s]+/).map((x) => String(x).trim().toUpperCase()).filter(Boolean))]
      : []
  },
  { immediate: true }
)

function onMultiChange() {
  const sorted = [...new Set(multiKeys.value.map((x) => String(x).trim().toUpperCase()))].filter(Boolean).sort()
  emit('update:modelValue', sorted.join(','))
}

const judgeNormalized = computed(() => {
  const s = String(props.modelValue || '').trim()
  if (s === '对' || s === '错') return s
  if (/^(true|1|yes|t)$/i.test(s)) return '对'
  if (/^(false|0|no|f)$/i.test(s)) return '错'
  return undefined
})
</script>

<style scoped>
.qb-answer-editor {
  width: 100%;
}
.opt-list {
  width: 100%;
}
.opt-radio-group,
.opt-check-group {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  width: 100%;
}
.opt-line {
  margin: 0;
  padding: 10px 12px;
  border-radius: var(--sg-radius-md, 8px);
  border: 1px solid var(--sg-border, #e4e7ed);
  background: var(--sg-bg-subtle, #fafafa);
  height: auto !important;
  align-items: flex-start;
  white-space: normal;
}
.opt-line :deep(.el-radio__label),
.opt-line :deep(.el-checkbox__label) {
  white-space: normal;
  line-height: 1.5;
}
.opt-key {
  font-weight: 600;
  margin-right: 6px;
  color: var(--el-color-primary);
}
.opt-text {
  color: var(--sg-text);
}
.judge-group {
  flex-direction: row;
  gap: 16px;
}
.field-hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--sg-text-secondary);
}
.mt10 {
  margin-top: 10px;
}
.code-area :deep(textarea) {
  font-family: ui-monospace, 'Cascadia Code', 'Microsoft YaHei Mono', Consolas, monospace;
  font-size: 13px;
  line-height: 1.45;
}

.char-count {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--sg-text-secondary);
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.qb-answer-editor--exam .opt-line {
  background: #fff;
  border: 1px solid #e2e8f0;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
}

.qb-answer-editor--exam .opt-line:hover {
  border-color: #93c5fd;
  box-shadow: 0 0 0 1px rgba(22, 119, 255, 0.08);
}

.qb-answer-editor--exam :deep(.el-radio.opt-line.is-checked),
.qb-answer-editor--exam :deep(.el-checkbox.opt-line.is-checked) {
  border-color: #1677ff;
  background: #eff6ff;
  box-shadow: 0 0 0 1px rgba(22, 119, 255, 0.12);
}

.qb-answer-editor--exam .judge-group :deep(.el-radio) {
  margin-right: 0;
  padding: 10px 16px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  background: #fff;
}
</style>
