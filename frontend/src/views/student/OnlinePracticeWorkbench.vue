<template>
  <div class="op-workbench">
    <header class="op-topbar">
      <div class="op-topbar-left">
        <el-button text type="primary" class="back-btn" @click="$router.push('/student/online-practice')">
          ← 返回列表
        </el-button>
        <div class="op-topbar-title">
          <h1>{{ template?.title || '在线实训' }}</h1>
          <el-tag v-if="template?.language" size="small" effect="plain">{{ langLabel(template.language) }}</el-tag>
          <el-tag v-if="template?.entryFile" size="small" type="info" effect="plain">{{ template.entryFile }}</el-tag>
        </div>
      </div>
      <div class="op-topbar-right">
        <span class="save-state" :class="`save-state--${saveState}`">
          <span class="save-dot" />
          {{ saveStateLabel }}
        </span>
        <el-button :loading="saving" @click="saveCode">保存代码</el-button>
        <el-button type="primary" :loading="running || polling" :disabled="!featureOn" @click="runCode">
          运行代码
        </el-button>
      </div>
    </header>

    <el-alert
      v-if="featureReady && !featureOn"
      type="warning"
      show-icon
      :closable="false"
      title="代码运行功能未启用（CODE_RUNNER_ENABLED=0），可编辑代码但无法试运行。"
      class="op-alert"
    />

    <el-skeleton v-if="loading" animated :rows="12" class="op-skeleton" />

    <div v-else-if="template && attempt" class="op-body">
      <aside class="op-brief-card">
        <h2 class="brief-title">任务说明</h2>
        <p v-if="template.description" class="brief-desc">{{ template.description }}</p>
        <p v-else class="brief-desc brief-desc--muted">教师未填写文字说明，请直接编辑代码并运行。</p>
        <dl class="brief-meta">
          <div><dt>语言</dt><dd>{{ langLabel(template.language) }}</dd></div>
          <div><dt>入口文件</dt><dd class="mono">{{ template.entryFile || '—' }}</dd></div>
          <div><dt>超时</dt><dd>{{ template.codeRunTimeoutSec || 10 }} 秒</dd></div>
          <div v-if="template.stdinDefault">
            <dt>测试输入</dt>
            <dd class="mono stdin-block">{{ template.stdinDefault }}</dd>
          </div>
        </dl>
      </aside>

      <section class="op-editor-section">
        <CodeEditor
          v-model="sourceCode"
          :language="template.language"
          :entry-file="template.entryFile"
          :min-height="520"
          fill-height
          show-chrome
        />
      </section>

      <aside class="op-output-section">
        <div class="output-head">运行结果</div>
        <CodeRunOutputPanel
          class="op-run-panel"
          :status="runStatus"
          :summary="runSummary"
          :stdout="runStdout"
          :stderr="runStderr"
          :compile-log="runCompileLog"
          :duration-ms="runDurationMs"
          :compile-exit-code="runCompileExitCode"
          :run-exit-code="runRunExitCode"
          :loading="polling"
        />
        <OnlinePracticeAiReviewPanel
          v-if="showAiReviewSection"
          :review="aiReview"
          :reviewing="aiReviewing"
          :can-request="canRequestAiReview"
          :hint="aiReviewHint"
          @request="requestAiReview"
        />
      </aside>
    </div>

    <el-empty v-else description="练习不可用或无权访问" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  openOnlinePracticeTemplate,
  saveOnlinePracticeSource,
  runOnlinePracticeAttempt,
  getLatestOnlinePracticeAiReview,
  createOnlinePracticeAiReview,
} from '../../api/onlinePractice'
import { getCodeRunJobResult } from '../../api/codeRun'
import { probeCodeRunnerEnabled } from '../../composables/useCodeRunnerFeature'
import CodeEditor from '../../components/codeRunner/CodeEditor.vue'
import CodeRunOutputPanel from '../../components/codeRunner/CodeRunOutputPanel.vue'
import OnlinePracticeAiReviewPanel from '../../components/codeRunner/OnlinePracticeAiReviewPanel.vue'
import { langLabel } from '../../utils/codeRunLanguages'

const route = useRoute()
const templateId = route.params.templateId

const loading = ref(true)
const saving = ref(false)
const running = ref(false)
const polling = ref(false)
const featureReady = ref(false)
const featureOn = ref(false)
const template = ref(null)
const attempt = ref(null)
const sourceCode = ref('')
const savedSnapshot = ref('')

const runStatus = ref('')
const runSummary = ref('')
const runStdout = ref('')
const runStderr = ref('')
const runCompileLog = ref('')
const runDurationMs = ref(null)
const runCompileExitCode = ref(null)
const runRunExitCode = ref(null)
const lastRunResultId = ref(null)

const aiReviewMeta = ref({ globalEnabled: false, llmConfigured: false, templateEnabled: true, available: false })
const aiReview = ref(null)
const aiReviewing = ref(false)

let pollTimer = null

const showAiReviewSection = computed(
  () => aiReviewMeta.value.globalEnabled && aiReviewMeta.value.templateEnabled
)

const hasRunResult = computed(
  () => Boolean(lastRunResultId.value || attempt.value?.lastCodeRunResultId)
)

const canRequestAiReview = computed(
  () =>
    aiReviewMeta.value.available &&
    hasRunResult.value &&
    !aiReviewing.value &&
    !running.value &&
    !polling.value
)

const aiReviewHint = computed(() => {
  if (!aiReviewMeta.value.globalEnabled) {
    return 'AI 代码点评未启用（ONLINE_PRACTICE_AI_REVIEW_ENABLED=0）'
  }
  if (!aiReviewMeta.value.templateEnabled) {
    return '教师未为本练习启用 AI 代码点评'
  }
  if (!aiReviewMeta.value.llmConfigured) {
    return '大模型未配置，请联系管理员'
  }
  if (!hasRunResult.value) {
    return '请先运行代码一次后再使用 AI 点评'
  }
  return ''
})

const isDirty = computed(() => sourceCode.value !== savedSnapshot.value)

const saveState = computed(() => {
  if (saving.value) return 'saving'
  if (isDirty.value) return 'unsaved'
  return 'saved'
})

const saveStateLabel = computed(() => {
  const map = { saved: '已保存', unsaved: '未保存', saving: '保存中…' }
  return map[saveState.value]
})

const init = async () => {
  loading.value = true
  featureOn.value = await probeCodeRunnerEnabled()
  featureReady.value = true
  try {
    const res = await openOnlinePracticeTemplate(templateId)
    if (res.success) {
      template.value = res.data.template
      attempt.value = res.data.attempt
      const code = res.data.attempt?.sourceCode ?? res.data.template?.starterCode ?? ''
      sourceCode.value = code
      savedSnapshot.value = code
      aiReviewMeta.value = res.data.aiReview || aiReviewMeta.value
      lastRunResultId.value = res.data.attempt?.lastCodeRunResultId ?? null
      await loadLatestAiReview()
    }
  } catch (e) {
    ElMessage.error(e.response?.data?.message || '加载练习失败')
  } finally {
    loading.value = false
  }
}

const saveCode = async () => {
  if (!attempt.value?.id) return
  saving.value = true
  try {
    const res = await saveOnlinePracticeSource(attempt.value.id, sourceCode.value)
    if (res.success) {
      attempt.value = res.data
      savedSnapshot.value = sourceCode.value
      ElMessage.success('代码已保存')
    }
  } catch (e) {
    ElMessage.error(e.response?.data?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

const loadLatestAiReview = async () => {
  if (!attempt.value?.id || !showAiReviewSection.value) return
  try {
    const res = await getLatestOnlinePracticeAiReview(attempt.value.id)
    if (res.success) aiReview.value = res.data || null
  } catch {
    /* 无历史点评时忽略 */
  }
}

const requestAiReview = async () => {
  if (!attempt.value?.id || !canRequestAiReview.value) return
  aiReviewing.value = true
  try {
    await saveOnlinePracticeSource(attempt.value.id, sourceCode.value)
    savedSnapshot.value = sourceCode.value
    const resultId = lastRunResultId.value || attempt.value.lastCodeRunResultId
    const res = await createOnlinePracticeAiReview(attempt.value.id, {
      codeRunResultId: resultId,
    })
    if (res.success) {
      aiReview.value = res.data
      ElMessage.success('AI 代码规范参考点评已完成')
    }
  } catch (e) {
    const msg = e.response?.data?.message || e.message || 'AI 点评失败'
    ElMessage.error(msg)
  } finally {
    aiReviewing.value = false
  }
}

const notifyRunComplete = (status, result) => {
  if (status === 'timeout') {
    ElMessage.warning('运行超时')
    return
  }
  if (result?.compileExitCode != null && result.compileExitCode !== 0) {
    ElMessage.error('编译失败，请查看 compile log')
    return
  }
  if (status === 'completed' && result?.runExitCode === 0) {
    ElMessage.success('运行成功')
    return
  }
  if (status === 'failed' || (result?.runExitCode != null && result.runExitCode !== 0)) {
    ElMessage.error('运行失败，请查看 stderr')
  }
}

const pollResult = async (jobId) => {
  polling.value = true
  runStatus.value = 'running'
  const start = Date.now()
  const tick = async () => {
    try {
      const res = await getCodeRunJobResult(jobId)
      const data = res.data
      runStatus.value = data?.status || ''
      if (data?.result) {
        runSummary.value = data.result.summary || ''
        runStdout.value = data.result.stdout || ''
        runStderr.value = data.result.stderr || ''
        runCompileLog.value = data.result.compileLog || ''
        runDurationMs.value = data.result.durationMs
        runCompileExitCode.value = data.result.compileExitCode ?? null
        runRunExitCode.value = data.result.runExitCode ?? null
      }
      if (['completed', 'failed', 'timeout', 'cancelled'].includes(data?.status)) {
        polling.value = false
        running.value = false
        if (['completed', 'failed', 'timeout'].includes(data?.status) && data?.result?.resultId) {
          lastRunResultId.value = data.result.resultId
          if (attempt.value) attempt.value.lastCodeRunResultId = data.result.resultId
        }
        notifyRunComplete(data?.status, data?.result)
        return
      }
      if (Date.now() - start > 120000) {
        polling.value = false
        running.value = false
        ElMessage.warning('运行结果等待超时')
        return
      }
      pollTimer = setTimeout(tick, 500)
    } catch {
      polling.value = false
      running.value = false
    }
  }
  await tick()
}

const runCode = async () => {
  if (!attempt.value?.id) return
  if (!featureOn.value) {
    ElMessage.warning('代码运行功能未启用')
    return
  }
  running.value = true
  runStatus.value = 'pending'
  runStdout.value = ''
  runStderr.value = ''
  runCompileLog.value = ''
  runSummary.value = ''
  runDurationMs.value = null
  runCompileExitCode.value = null
  runRunExitCode.value = null
  try {
    await saveOnlinePracticeSource(attempt.value.id, sourceCode.value)
    savedSnapshot.value = sourceCode.value
    const res = await runOnlinePracticeAttempt(attempt.value.id, {})
    const jobId = res.data?.jobId
    if (!jobId) throw new Error('未返回 jobId')
    await pollResult(jobId)
  } catch (e) {
    running.value = false
    polling.value = false
    ElMessage.error(e.response?.data?.message || e.message || '运行失败')
  }
}

onMounted(init)
onBeforeUnmount(() => {
  if (pollTimer) clearTimeout(pollTimer)
})
</script>

<style scoped>
.op-workbench {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 100px);
  min-height: 640px;
  background: var(--sg-bg-page, #eef2f7);
  margin: -8px -12px 0;
  padding: 12px 16px 16px;
}

.op-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 16px;
  margin-bottom: 12px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(15, 23, 42, 0.06);
  flex-shrink: 0;
  flex-wrap: wrap;
}

.op-topbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.back-btn {
  flex-shrink: 0;
}

.op-topbar-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex-wrap: wrap;
}

.op-topbar-title h1 {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: var(--sg-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 360px;
}

.op-topbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.save-state {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--sg-text-secondary);
  padding: 0 4px;
}

.save-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #94a3b8;
}

.save-state--saved .save-dot {
  background: #059669;
}

.save-state--unsaved .save-dot {
  background: #d97706;
}

.save-state--saving .save-dot {
  background: #2563eb;
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}

.op-alert {
  margin-bottom: 12px;
  flex-shrink: 0;
}

.op-skeleton {
  padding: 16px;
  background: #fff;
  border-radius: 12px;
}

.op-body {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr) 340px;
  gap: 12px;
  flex: 1;
  min-height: 0;
  align-items: stretch;
}

.op-brief-card {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(15, 23, 42, 0.06);
  padding: 16px;
  overflow-y: auto;
  height: 100%;
  box-sizing: border-box;
}

.brief-title {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 700;
  color: var(--sg-text);
}

.brief-desc {
  margin: 0 0 14px;
  color: var(--sg-text-secondary);
  font-size: 13px;
  line-height: 1.65;
  white-space: pre-wrap;
}

.brief-desc--muted {
  color: var(--sg-text-placeholder);
}

.brief-meta {
  display: grid;
  gap: 10px;
  margin: 0;
  font-size: 12px;
}

.brief-meta div {
  display: grid;
  grid-template-columns: 64px 1fr;
  gap: 8px;
  align-items: start;
}

.brief-meta dt {
  margin: 0;
  color: var(--sg-text-placeholder);
}

.brief-meta dd {
  margin: 0;
  font-weight: 500;
  color: var(--sg-text);
}

.brief-meta .mono {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 12px;
  word-break: break-all;
}

.stdin-block {
  white-space: pre-wrap;
  background: var(--sg-fill-muted);
  padding: 8px;
  border-radius: 6px;
}

.op-editor-section {
  min-width: 0;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.op-output-section {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  overflow-y: auto;
}

.op-run-panel {
  flex: 1;
  min-height: 240px;
}

.op-output-section :deep(.code-run-output) {
  min-height: 240px;
}

.output-head {
  font-size: 13px;
  font-weight: 600;
  color: var(--sg-text);
  margin-bottom: 8px;
  padding-left: 4px;
  flex-shrink: 0;
  line-height: 20px;
}

@media (max-width: 1200px) {
  .op-body {
    grid-template-columns: 1fr;
    overflow-y: auto;
  }

  .op-workbench {
    height: auto;
    min-height: calc(100vh - 100px);
  }
}
</style>
