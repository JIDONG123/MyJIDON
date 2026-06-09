<template>
  <div class="step-checklist-panel" :class="{ 'step-checklist-panel--compact': variant === 'correction' }">
    <!-- 智能核查总览 -->
    <section v-if="showSummary" class="summary-card" :class="{ 'summary-card--inline': variant === 'summary' }">
      <h3 v-if="variant !== 'summary'" class="section-title">智能核查总览</h3>
      <div class="summary-grid">
        <div class="summary-item">
          <span class="summary-label">任务步骤总数</span>
          <span class="summary-value">{{ summary.totalSteps ?? '—' }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">AI 确认完成</span>
          <span class="summary-value summary-value--success">{{ summary.aiDoneCount ?? '—' }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">证据不足</span>
          <span class="summary-value summary-value--warn">{{ summary.uncertainCount ?? '—' }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">教师已修正</span>
          <span class="summary-value summary-value--primary">{{ summary.teacherCorrectedCount ?? '—' }}</span>
        </div>
        <div class="summary-item summary-item--wide">
          <span class="summary-label">步骤完成度</span>
          <span class="summary-value">
            {{ summary.completionRatio }}
            <span v-if="summary.completionPercent != null" class="summary-percent">（{{ summary.completionPercent }}%）</span>
          </span>
        </div>
        <div v-if="stepScoreDisplay" class="summary-item summary-item--wide">
          <span class="summary-label">{{ stepScoreDisplay.label }}</span>
          <span class="summary-value summary-value--plain">{{ stepScoreDisplay.scoreText }}</span>
          <p class="summary-hint">{{ stepScoreDisplay.hint }}</p>
        </div>
      </div>
    </section>

    <el-skeleton v-if="taskLoading && showCorrection" :rows="5" animated />

    <template v-else-if="showCorrection">
      <!-- 步骤核查对照 -->
      <section v-if="stepRows.length" class="steps-section">
        <div v-if="variant !== 'correction'" class="steps-head">
          <h3 class="section-title">步骤核查对照</h3>
          <p class="section-desc">逐项核对 AI 判断，必要时修正并填写说明后保存。</p>
        </div>
        <div class="step-cards" :class="{ 'step-cards--scroll': variant === 'correction' }">
          <article v-for="row in stepRows" :key="row.id" class="step-row-card">
            <header class="step-row-head">
              <span class="step-index">步骤 {{ row.id }}</span>
              <el-tag v-if="row.required" size="small" type="danger" effect="plain">必做</el-tag>
              <el-tag v-else size="small" type="info" effect="plain">选做</el-tag>
              <el-tag
                size="small"
                :type="row.aiJudgment.tagType"
                effect="light"
                class="ai-tag"
              >
                AI：{{ row.aiJudgment.label }}
              </el-tag>
            </header>
            <p class="step-requirement">{{ row.title }}</p>
            <p class="step-basis">
              <span class="basis-label">AI 判断依据</span>
              {{ row.aiJudgment.basis }}
            </p>
            <div class="teacher-confirm">
              <span class="confirm-label">教师确认</span>
              <el-radio-group v-model="row.teacherChoice" size="small">
                <el-radio value="inherit">沿用 AI</el-radio>
                <el-radio value="done">修正为已完成</el-radio>
                <el-radio value="notdone">修正为未完成</el-radio>
              </el-radio-group>
            </div>
            <el-input
              v-if="row.teacherChoice !== 'inherit'"
              v-model="row.stepNote"
              type="textarea"
              :rows="2"
              maxlength="200"
              show-word-limit
              placeholder="修正说明（建议填写）"
              class="step-note-input"
            />
          </article>
        </div>
      </section>

      <el-alert
        v-else-if="showCorrection && verificationResult?.stepCompleteness"
        type="info"
        show-icon
        :closable="false"
        title="本任务未配置步骤核查清单"
        description="以下为 AI 根据提交内容推断的步骤覆盖情况；可在任务编辑中添加步骤清单以便逐项认定。"
        class="no-checklist-alert"
      />

      <!-- 无清单时的覆盖/缺失摘要 -->
      <section
        v-if="showCorrection && !stepRows.length && verificationResult?.stepCompleteness"
        class="fallback-steps"
      >
        <div class="fallback-row">
          <span class="fallback-key">已覆盖</span>
          <div class="fallback-tags">
            <el-tag
              v-for="(s, i) in coveredList"
              :key="'c' + i"
              size="small"
              type="success"
              effect="plain"
            >{{ s }}</el-tag>
            <span v-if="!coveredList.length" class="empty-text">—</span>
          </div>
        </div>
        <div class="fallback-row">
          <span class="fallback-key">待补充</span>
          <div class="fallback-tags">
            <el-tag
              v-for="(s, i) in missingList"
              :key="'m' + i"
              size="small"
              type="danger"
              effect="plain"
            >{{ s }}</el-tag>
            <span v-if="!missingList.length" class="empty-text">—</span>
          </div>
        </div>
        <div v-if="!stepRows.length" class="score-override-row">
          <span class="fallback-key">步骤得分修正（可选）</span>
          <el-input-number
            v-model="stepScoreOverride"
            :min="0"
            :max="100"
            :step="1"
            placeholder="不填则不修改"
            controls-position="right"
          />
          <span class="unit">分（0–100）</span>
        </div>
      </section>

      <!-- 逻辑问题备注 -->
      <el-collapse v-if="showCorrection && logicBlocks.length" class="extra-collapse">
        <el-collapse-item title="逻辑与问题 · 教师备注（可选）" name="logic">
          <div v-for="(blk, i) in logicBlocks" :key="i" class="logic-row">
            <p class="logic-title">{{ blk.title }}</p>
            <p class="logic-detail">{{ blk.detail }}</p>
            <el-input v-model="logicNotes[i]" type="textarea" :rows="2" placeholder="教师补充说明" />
          </div>
        </el-collapse-item>
      </el-collapse>

      <div v-if="showCorrection && variant !== 'summary'" class="panel-actions">
        <el-button type="primary" :loading="saving" @click="save">保存核查修正</el-button>
        <el-button :disabled="saving || !hadSavedBefore" @click="clearOverride">清除修正</el-button>
      </div>
      <p v-if="showCorrection && variant !== 'summary'" class="fine-print">修正结果写入「教师核查修正」字段，不改变 AI 原始核查文本。</p>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { getTaskById } from '../api/task'
import { patchGradingVerification } from '../api/grading'
import {
  parseStepChecklist,
  resolveAiStepJudgment,
  applyStepOverridesToRows,
  computeVerificationSummary,
  formatStepScoreDisplay,
} from '../utils/verificationStepUtils'
import { ElMessage, ElMessageBox } from 'element-plus'

const props = defineProps({
  submissionId: { type: [String, Number], required: true },
  taskId: { type: Number, default: null },
  verificationResult: { type: Object, default: null },
  initialOverride: { type: Object, default: null },
  /** full | summary | correction */
  variant: { type: String, default: 'full' },
})

const emit = defineEmits(['saved'])

const taskLoading = ref(false)
const stepRows = ref([])
const logicNotes = ref([])
const stepScoreOverride = ref(null)
const saving = ref(false)

const logicBlocks = computed(() => {
  const issues = props.verificationResult?.logicIssues
  return Array.isArray(issues) ? issues : []
})

const coveredList = computed(() => {
  const arr = props.verificationResult?.stepCompleteness?.covered
  return Array.isArray(arr) ? arr.filter(Boolean) : []
})

const missingList = computed(() => {
  const arr = props.verificationResult?.stepCompleteness?.missing
  return Array.isArray(arr) ? arr.filter(Boolean) : []
})

const summary = computed(() => computeVerificationSummary(stepRows.value, props.verificationResult))

const stepScoreDisplay = computed(() => formatStepScoreDisplay(props.verificationResult, summary.value))

const showSummary = computed(() => props.variant === 'full' || props.variant === 'summary')
const showCorrection = computed(() => props.variant === 'full' || props.variant === 'correction')

const hadSavedBefore = computed(() => {
  const o = props.initialOverride
  return o && typeof o === 'object' && Object.keys(o).length > 0
})

function buildRowsFromChecklist(parsed, override) {
  let rows = parsed.map((p) => {
    const aiJudgment = resolveAiStepJudgment(p, props.verificationResult)
    return {
      ...p,
      aiJudgment,
      teacherChoice: 'inherit',
      stepNote: '',
    }
  })
  return applyStepOverridesToRows(rows, override)
}

function initLogicNotes() {
  const n = logicBlocks.value.length
  const vo = props.initialOverride?.logicIssueNotes
  const existing = Array.isArray(vo) ? vo : []
  logicNotes.value = Array.from({ length: n }, (_, i) => {
    const found = existing.find((x) => Number(x.index) === i)
    return found?.note ? String(found.note) : ''
  })
}

function buildPayload() {
  const payload = {}

  const overrides = stepRows.value
    .filter((r) => r.teacherChoice === 'done' || r.teacherChoice === 'notdone')
    .map((r) => ({ stepId: r.id, passed: r.teacherChoice === 'done' }))
  if (overrides.length) payload.stepOverrides = overrides

  const stepNotes = stepRows.value
    .filter((r) => r.teacherChoice !== 'inherit' && String(r.stepNote || '').trim())
    .map((r) => ({ stepId: r.id, note: String(r.stepNote).trim() }))
  if (stepNotes.length) payload.stepNotes = stepNotes

  const issueNotes = logicNotes.value
    .map((note, index) => ({ index, note: String(note || '').trim() }))
    .filter((x) => x.note)
  if (issueNotes.length) payload.logicIssueNotes = issueNotes

  if (!stepRows.value.length && stepScoreOverride.value != null && stepScoreOverride.value !== '') {
    const n = Number(stepScoreOverride.value)
    if (!Number.isNaN(n)) payload.stepCompletenessScoreOverride = Math.min(100, Math.max(0, n))
  }

  return payload
}

async function loadTask() {
  if (!props.taskId) {
    stepRows.value = []
    return
  }
  taskLoading.value = true
  try {
    const res = await getTaskById(props.taskId)
    if (res.success && res.data) {
      const parsed = parseStepChecklist(res.data.step_checklist)
      stepRows.value = buildRowsFromChecklist(parsed, props.initialOverride)
    } else {
      stepRows.value = []
    }
  } finally {
    taskLoading.value = false
  }
}

function syncFromInitial() {
  if (props.initialOverride?.stepCompletenessScoreOverride != null) {
    stepScoreOverride.value = Number(props.initialOverride.stepCompletenessScoreOverride)
  } else {
    stepScoreOverride.value = null
  }
  initLogicNotes()
}

watch(() => props.taskId, loadTask, { immediate: true })

watch(
  () => [props.initialOverride, props.verificationResult],
  () => {
    syncFromInitial()
    if (!stepRows.value.length) return
    const parsed = stepRows.value.map(({ id, title, required }) => ({ id, title, required }))
    stepRows.value = buildRowsFromChecklist(parsed, props.initialOverride)
  },
  { deep: true }
)

watch(() => logicBlocks.value.length, initLogicNotes, { immediate: true })

async function save() {
  const needsNote = stepRows.value.some(
    (r) => r.teacherChoice !== 'inherit' && !String(r.stepNote || '').trim()
  )
  if (needsNote) {
    ElMessage.warning('修正步骤判定后，建议填写修正说明')
  }

  const payload = buildPayload()
  if (Object.keys(payload).length === 0) {
    ElMessage.warning('尚未填写任何修正；若需清空已保存修正，请点「清除修正」。')
    return
  }

  saving.value = true
  try {
    const res = await patchGradingVerification(props.submissionId, payload)
    if (res.success) {
      ElMessage.success('核查修正已保存')
      emit('saved')
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function clearOverride() {
  try {
    await ElMessageBox.confirm('确定清除已保存的教师核查修正吗？', '确认', {
      type: 'warning',
      confirmButtonText: '清除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  saving.value = true
  try {
    const res = await patchGradingVerification(props.submissionId, {})
    if (res.success) {
      ElMessage.success('已清除')
      stepRows.value = stepRows.value.map((r) => ({
        ...r,
        teacherChoice: 'inherit',
        stepNote: '',
      }))
      logicNotes.value = logicNotes.value.map(() => '')
      stepScoreOverride.value = null
      emit('saved')
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '操作失败')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.step-checklist-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.summary-card {
  padding: 14px 16px;
  background: #f9fafb;
  border: 1px solid #eef1f6;
  border-radius: 10px;
}

.section-title {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 600;
  color: #1f2d3d;
}

.section-desc {
  margin: -8px 0 12px;
  font-size: 12px;
  color: #9ca3af;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px 16px;
}

.summary-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.summary-item--wide {
  grid-column: 1 / -1;
}

.summary-label {
  font-size: 11px;
  color: #9ca3af;
}

.summary-value {
  font-size: 18px;
  font-weight: 700;
  color: #1f2d3d;
}

.summary-value--success {
  color: #16a34a;
}

.summary-value--warn {
  color: #f59e0b;
}

.summary-value--primary {
  color: #1d5fd6;
}

.summary-value--plain {
  font-size: 16px;
  color: #374151;
}

.summary-percent {
  font-size: 13px;
  font-weight: 500;
  color: #6b7280;
}

.summary-hint {
  margin: 4px 0 0;
  font-size: 11px;
  color: #9ca3af;
  line-height: 1.45;
}

.steps-section {
  margin-top: 4px;
}

.step-cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.step-row-card {
  padding: 14px 16px;
  border: 1px solid #e5eaf2;
  border-radius: 10px;
  background: #fff;
}

.step-row-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.step-index {
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
}

.ai-tag {
  margin-left: auto;
}

.step-requirement {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 600;
  color: #1f2d3d;
  line-height: 1.45;
}

.step-basis {
  margin: 0 0 12px;
  font-size: 13px;
  color: #6b7280;
  line-height: 1.55;
}

.basis-label {
  display: inline-block;
  margin-right: 6px;
  padding: 1px 6px;
  border-radius: 4px;
  background: #eef4ff;
  color: #1d5fd6;
  font-size: 11px;
  font-weight: 500;
}

.teacher-confirm {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 8px;
}

.confirm-label {
  font-size: 13px;
  color: #374151;
  font-weight: 500;
  padding-top: 4px;
}

.teacher-confirm :deep(.el-radio-group) {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
}

.step-note-input {
  margin-top: 4px;
}

.no-checklist-alert {
  margin-bottom: 0;
}

.fallback-steps {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid #eef1f6;
  border-radius: 10px;
  background: #f9fafb;
}

.fallback-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 8px;
}

.fallback-key {
  font-size: 12px;
  color: #9ca3af;
  min-width: 56px;
  padding-top: 4px;
}

.fallback-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex: 1;
}

.empty-text {
  font-size: 13px;
  color: #9ca3af;
}

.score-override-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding-top: 8px;
  border-top: 1px dashed #e5eaf2;
}

.unit {
  font-size: 13px;
  color: #6b7280;
}

.extra-collapse {
  border: none;
}

.extra-collapse :deep(.el-collapse-item__header) {
  font-size: 13px;
  color: #6b7280;
  border: 1px solid #eef1f6;
  border-radius: 8px;
  padding: 0 12px;
  background: #f9fafb;
}

.extra-collapse :deep(.el-collapse-item__wrap) {
  border: none;
}

.logic-row {
  margin-bottom: 14px;
  padding-bottom: 14px;
  border-bottom: 1px dashed #eef1f6;
}

.logic-row:last-child {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.logic-title {
  margin: 0 0 4px;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}

.logic-detail {
  margin: 0 0 8px;
  font-size: 13px;
  color: #6b7280;
  line-height: 1.55;
}

.panel-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.fine-print {
  margin: 0;
  font-size: 11px;
  color: #9ca3af;
  line-height: 1.5;
}

.summary-card--inline {
  padding: 10px 12px;
  background: transparent;
  border: none;
}

.summary-card--inline .summary-grid {
  grid-template-columns: repeat(2, 1fr);
  gap: 8px 12px;
}

.summary-card--inline .summary-value {
  font-size: 16px;
}

.summary-card--inline .summary-item--wide {
  grid-column: 1 / -1;
}

.step-checklist-panel--compact {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.step-checklist-panel--compact .steps-section {
  margin-top: 0;
}

.step-checklist-panel--compact .step-row-card {
  padding: 12px;
}

.step-checklist-panel--compact .section-title {
  font-size: 13px;
  margin-bottom: 10px;
}

/* 教师修正区：最多显示 3 个步骤，超出滚动 */
.step-checklist-panel--compact .step-cards--scroll {
  --step-row-height: 212px;
  --step-row-gap: 12px;
  --step-visible-count: 3;
  max-height: calc(
    var(--step-visible-count) * var(--step-row-height) +
      (var(--step-visible-count) - 1) * var(--step-row-gap)
  );
  overflow-y: auto;
  padding-right: 4px;
  scrollbar-gutter: stable;
}

.step-checklist-panel--compact .panel-actions {
  margin-top: 0;
  padding-top: 4px;
  border-top: 1px solid #f0f2f5;
}

.step-cards--scroll {
  max-height: min(52vh, 480px);
  overflow-y: auto;
  padding-right: 4px;
}

@media (max-width: 640px) {
  .summary-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 640px) {
  .step-checklist-panel:not(.step-checklist-panel--compact) .step-cards--scroll {
    max-height: none;
  }
}
</style>
