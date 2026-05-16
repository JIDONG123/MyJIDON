<template>
  <div class="verify-override-panel">
    <div class="panel-intro">
      <h3>教师修正智能核查（可选）</h3>
      <p class="intro-text">
        无需手写代码：按实训步骤勾选<strong>「是否完成」</strong>，或对 AI 列出的逻辑问题写<strong>补充说明</strong>；系统将自动保存为结构化记录。
      </p>
    </div>

    <el-skeleton v-if="taskLoading" :rows="4" animated />

    <template v-else>
      <!-- 步骤清单 -->
      <section v-if="stepRows.length" class="section">
        <h4 class="section-title">实训步骤认定</h4>
        <p class="section-desc">对照任务中的步骤清单与左侧 AI 核查结论，修正您认为不符合实际情况的判定。</p>
        <div class="step-list">
          <div v-for="row in stepRows" :key="row.id" class="step-card">
            <div class="step-card__head">
              <span class="step-num">步骤 {{ row.id }}</span>
              <el-tag v-if="row.required" size="small" type="danger" effect="plain">必做</el-tag>
            </div>
            <p class="step-title">{{ row.title }}</p>
            <p class="ai-line">
              <span class="ai-label">AI 参考</span>
              {{ row.aiHint }}
            </p>
            <div class="step-radios">
              <span class="radio-label">教师认定：</span>
              <el-radio-group v-model="row.teacherChoice" size="small">
                <el-radio value="inherit">沿用 AI，不修改</el-radio>
                <el-radio value="done">改判：学生已完成</el-radio>
                <el-radio value="notdone">改判：学生未完成</el-radio>
              </el-radio-group>
            </div>
          </div>
        </div>
      </section>

      <el-alert
        v-else
        type="info"
        show-icon
        :closable="false"
        title="本任务未配置「步骤核查清单」"
        description="若只需补充文字说明，请直接填写下方「教师补充说明」；也可在任务编辑中为任务添加步骤清单，便于下次逐项认定。"
        class="section-alert"
      />

      <!-- 无清单时：可选整体步骤分修正 -->
      <section v-if="!stepRows.length && verificationResult?.stepCompleteness" class="section">
        <h4 class="section-title">步骤完成度分数（可选）</h4>
        <p class="section-desc">AI 给出的步骤相关得分约为 {{ verificationResult.stepCompleteness?.score ?? '—' }} 分，若您认为需要修正可填写（0～100）。</p>
        <el-input-number
          v-model="stepScoreOverride"
          :min="0"
          :max="100"
          :step="1"
          placeholder="不填则不修改"
          style="width: 200px"
        />
        <span class="unit-hint">分</span>
      </section>

      <!-- 逻辑问题批注 -->
      <section v-if="logicBlocks.length" class="section">
        <h4 class="section-title">逻辑与问题 · 教师备注</h4>
        <p class="section-desc">针对 AI 列出的问题，可填写您的课堂上观察到的说明（选填）。</p>
        <div v-for="(blk, i) in logicBlocks" :key="i" class="logic-block">
          <p class="logic-title"><strong>{{ blk.title }}</strong></p>
          <p class="logic-detail">{{ blk.detail }}</p>
          <el-input
            v-model="logicNotes[i]"
            type="textarea"
            :rows="2"
            placeholder="可选：教师补充说明"
          />
        </div>
      </section>

      <!-- 总说明 -->
      <section class="section">
        <h4 class="section-title">教师补充说明（可选）</h4>
        <el-input
          v-model="teacherFreeNote"
          type="textarea"
          :rows="3"
          maxlength="500"
          show-word-limit
          placeholder="例如：课堂答辩已通过、企业导师现场确认某步骤完成等。"
        />
      </section>

      <div class="actions">
        <el-button type="primary" :loading="saving" @click="save">保存核查修正</el-button>
        <el-button :disabled="saving || !hadSavedBefore" @click="clearOverride">清除我的修正</el-button>
      </div>
      <p class="fine-print">保存内容将写入批改记录的「教师核查修正」字段，供教务留痕；不改变 AI 原始核查文本。</p>

      <el-collapse class="json-collapse">
        <el-collapse-item title="技术人员：查看此次提交的 JSON 摘要" name="json">
          <pre class="json-preview">{{ jsonPreview }}</pre>
        </el-collapse-item>
      </el-collapse>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { getTaskById } from '../api/task'
import { patchGradingVerification } from '../api/grading'
import { ElMessage, ElMessageBox } from 'element-plus'

const props = defineProps({
  submissionId: { type: [String, Number], required: true },
  taskId: { type: Number, default: null },
  verificationResult: { type: Object, default: null },
  initialOverride: { type: Object, default: null },
})

const emit = defineEmits(['saved'])

const taskLoading = ref(false)
const taskDetail = ref(null)
const stepRows = ref([])
const logicNotes = ref([])
const teacherFreeNote = ref('')
const stepScoreOverride = ref(null)
const saving = ref(false)

const logicBlocks = computed(() => {
  const issues = props.verificationResult?.logicIssues
  return Array.isArray(issues) ? issues : []
})

const hadSavedBefore = computed(() => {
  const o = props.initialOverride
  return o && typeof o === 'object' && Object.keys(o).length > 0
})

function parseStepChecklist(raw) {
  if (raw == null) return []
  let list = raw
  if (typeof list === 'string') {
    try {
      list = JSON.parse(list)
    } catch {
      return []
    }
  }
  if (!Array.isArray(list)) return []
  return list.map((x, i) => ({
    id: x.id != null ? Number(x.id) : i + 1,
    title: String(x.title || x.name || `步骤${i + 1}`).trim(),
    required: Boolean(x.required),
  }))
}

function aiHintForStep(row, vr) {
  if (!vr?.stepCompleteness) return '（左侧 AI 未输出步骤摘要时可忽略）'
  const title = row.title
  const missing = vr.stepCompleteness.missing || []
  const covered = vr.stepCompleteness.covered || []
  const mids = vr.missingStepIds
  if (Array.isArray(mids) && mids.map(Number).includes(Number(row.id))) {
    return 'AI 将本步骤列入「缺失步骤 id」'
  }
  const inMissing = missing.some((m) => m && (String(title).includes(String(m)) || String(m).includes(String(title))))
  const inCovered = covered.some((c) => c && (String(title).includes(String(c)) || String(c).includes(String(title))))
  if (inMissing && !inCovered) return 'AI 文本描述：倾向于「未完成」（出现在缺失列表）'
  if (inCovered && !inMissing) return 'AI 文本描述：倾向于「已完成」（出现在覆盖列表）'
  return 'AI 未在覆盖/缺失列表中点名本步骤，请结合全文判断'
}

function passedToChoice(passed) {
  if (passed === true) return 'done'
  if (passed === false) return 'notdone'
  return 'inherit'
}

function applyOverrideToRows(rows, override) {
  const list = override?.stepOverrides
  if (!Array.isArray(list)) {
    return rows.map((r) => ({ ...r, teacherChoice: 'inherit' }))
  }
  const map = new Map(list.map((x) => [Number(x.stepId), x.passed]))
  return rows.map((r) => ({
    ...r,
    teacherChoice: map.has(r.id) ? passedToChoice(map.get(r.id)) : 'inherit',
  }))
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

  const issueNotes = logicNotes.value
    .map((note, index) => ({ index, note: String(note || '').trim() }))
    .filter((x) => x.note)
  if (issueNotes.length) payload.logicIssueNotes = issueNotes

  if (teacherFreeNote.value.trim()) payload.teacherNote = teacherFreeNote.value.trim()

  if (!stepRows.value.length && stepScoreOverride.value != null && stepScoreOverride.value !== '') {
    const n = Number(stepScoreOverride.value)
    if (!Number.isNaN(n)) payload.stepCompletenessScoreOverride = Math.min(100, Math.max(0, n))
  }

  return payload
}

const jsonPreview = computed(() => {
  try {
    return JSON.stringify(buildPayload(), null, 2)
  } catch {
    return '{}'
  }
})

async function loadTask() {
  if (!props.taskId) {
    taskDetail.value = null
    stepRows.value = []
    return
  }
  taskLoading.value = true
  try {
    const res = await getTaskById(props.taskId)
    if (res.success && res.data) {
      taskDetail.value = res.data
      const parsed = parseStepChecklist(res.data.step_checklist)
      let rows = parsed.map((p) => ({
        ...p,
        aiHint: aiHintForStep(p, props.verificationResult),
        teacherChoice: 'inherit',
      }))
      rows = applyOverrideToRows(rows, props.initialOverride)
      stepRows.value = rows
    } else {
      taskDetail.value = null
      stepRows.value = []
    }
  } finally {
    taskLoading.value = false
  }
}

function syncFromInitial() {
  teacherFreeNote.value =
    props.initialOverride?.teacherNote != null ? String(props.initialOverride.teacherNote) : ''
  if (props.initialOverride?.stepCompletenessScoreOverride != null) {
    stepScoreOverride.value = Number(props.initialOverride.stepCompletenessScoreOverride)
  } else {
    stepScoreOverride.value = null
  }
  initLogicNotes()
}

watch(
  () => props.taskId,
  () => {
    loadTask()
  },
  { immediate: true }
)

watch(
  () => [props.initialOverride, props.verificationResult],
  () => {
    syncFromInitial()
    if (!stepRows.value.length) return
    stepRows.value = stepRows.value.map((r) => ({
      ...r,
      aiHint: aiHintForStep(r, props.verificationResult),
    }))
    stepRows.value = applyOverrideToRows(stepRows.value, props.initialOverride)
  },
  { deep: true }
)

watch(
  () => logicBlocks.value.length,
  () => initLogicNotes(),
  { immediate: true }
)

const save = async () => {
  const payload = buildPayload()
  if (Object.keys(payload).length === 0) {
    ElMessage.warning('您尚未填写任何修正；若需清空已保存的修正，请点「清除我的修正」。')
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

const clearOverride = async () => {
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
      stepRows.value = stepRows.value.map((r) => ({ ...r, teacherChoice: 'inherit' }))
      teacherFreeNote.value = ''
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
.verify-override-panel {
  width: 100%;
}

.panel-intro h3 {
  margin: 0 0 8px;
  font-size: 17px;
  font-weight: 700;
  color: var(--sg-text);
}

.intro-text {
  margin: 0 0 20px;
  font-size: 13px;
  line-height: 1.65;
  color: var(--sg-text-secondary);
}

.section {
  margin-bottom: 22px;
}

.section-title {
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--sg-text);
}

.section-desc {
  margin: 0 0 14px;
  font-size: 13px;
  color: var(--sg-text-secondary);
  line-height: 1.55;
}

.section-alert {
  margin-bottom: 16px;
}

.step-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.step-card {
  padding: 14px 16px;
  border-radius: var(--sg-radius-md);
  border: 1px solid var(--sg-border);
  background: var(--sg-fill);
}

.step-card__head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.step-num {
  font-size: 12px;
  font-weight: 600;
  color: var(--sg-text-placeholder);
}

.step-title {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--sg-text);
  line-height: 1.45;
}

.ai-line {
  margin: 0 0 12px;
  font-size: 12px;
  line-height: 1.55;
  color: var(--sg-text-secondary);
}

.ai-label {
  display: inline-block;
  margin-right: 6px;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(37, 99, 235, 0.08);
  color: var(--sg-primary);
  font-weight: 500;
}

.step-radios {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 8px;
}

.radio-label {
  font-size: 13px;
  color: var(--sg-text-secondary);
  padding-top: 4px;
}

.step-radios :deep(.el-radio-group) {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
}

.unit-hint {
  margin-left: 8px;
  font-size: 13px;
  color: var(--sg-text-secondary);
}

.logic-block {
  margin-bottom: 14px;
  padding-bottom: 14px;
  border-bottom: 1px dashed var(--sg-border);
}

.logic-block:last-child {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}

.logic-title {
  margin: 0 0 4px;
  font-size: 13px;
}

.logic-detail {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--sg-text-secondary);
  line-height: 1.55;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 8px;
}

.fine-print {
  margin: 12px 0 16px;
  font-size: 12px;
  color: var(--sg-text-placeholder);
  line-height: 1.5;
}

.json-collapse {
  border: none;
}

.json-collapse :deep(.el-collapse-item__header) {
  font-size: 12px;
  color: var(--sg-text-placeholder);
  font-weight: 500;
}

.json-preview {
  margin: 0;
  padding: 12px;
  font-size: 11px;
  line-height: 1.5;
  background: var(--sg-fill-muted);
  border-radius: 8px;
  overflow: auto;
  max-height: 200px;
}
</style>
