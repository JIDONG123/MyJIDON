<template>
  <div class="code-run-output">
    <div class="code-run-output__header">
      <el-tag v-if="displayStatus" :type="statusTagType" size="small" effect="dark" class="status-tag">
        {{ displayStatusLabel }}
      </el-tag>
      <span v-if="summary" class="summary-text">{{ summary }}</span>
    </div>

    <el-skeleton v-if="loading" animated :rows="5" class="output-skeleton" />

    <template v-else>
      <el-tabs v-model="activeTab" class="output-tabs">
        <el-tab-pane name="stdout">
          <template #label>
            <span class="tab-label">stdout</span>
            <el-badge v-if="stdout" is-dot class="tab-dot" />
          </template>
          <div class="output-pane">
            <pre v-if="stdout" class="output-pre">{{ stdout }}</pre>
            <div v-else class="output-empty">
              <el-icon :size="28"><Document /></el-icon>
              <p>暂无标准输出</p>
            </div>
          </div>
        </el-tab-pane>

        <el-tab-pane name="stderr">
          <template #label>
            <span class="tab-label">stderr</span>
            <el-badge v-if="stderr" is-dot type="danger" class="tab-dot" />
          </template>
          <div class="output-pane">
            <pre v-if="stderr" class="output-pre output-pre--err">{{ stderr }}</pre>
            <div v-else class="output-empty">
              <el-icon :size="28"><Warning /></el-icon>
              <p>暂无错误输出</p>
            </div>
          </div>
        </el-tab-pane>

        <el-tab-pane name="compile">
          <template #label>
            <span class="tab-label">compile log</span>
            <el-badge v-if="compileLog" is-dot class="tab-dot" />
          </template>
          <div class="output-pane">
            <pre v-if="compileLog" class="output-pre">{{ compileLog }}</pre>
            <div v-else class="output-empty">
              <el-icon :size="28"><Tools /></el-icon>
              <p>无编译日志</p>
            </div>
          </div>
        </el-tab-pane>

        <el-tab-pane label="meta" name="meta">
          <div class="output-pane output-pane--meta">
            <dl class="meta-list">
              <div><dt>运行状态</dt><dd>{{ displayStatusLabel || '未运行' }}</dd></div>
              <div><dt>退出码</dt><dd>{{ exitCodeText }}</dd></div>
              <div><dt>编译退出码</dt><dd>{{ compileExitCodeText }}</dd></div>
              <div><dt>耗时</dt><dd>{{ durationText }}</dd></div>
              <div v-if="summary"><dt>摘要</dt><dd>{{ summary }}</dd></div>
            </dl>
          </div>
        </el-tab-pane>
      </el-tabs>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { Document, Warning, Tools } from '@element-plus/icons-vue'

const props = defineProps({
  status: { type: String, default: '' },
  summary: { type: String, default: '' },
  stdout: { type: String, default: '' },
  stderr: { type: String, default: '' },
  compileLog: { type: String, default: '' },
  durationMs: { type: Number, default: null },
  compileExitCode: { type: Number, default: null },
  runExitCode: { type: Number, default: null },
  loading: { type: Boolean, default: false },
})

const activeTab = ref('stdout')

const displayStatus = computed(() => {
  if (props.loading || props.status === 'running' || props.status === 'pending') return 'running'
  if (props.status === 'timeout') return 'timeout'
  if (!props.status) return 'idle'
  if (props.compileExitCode != null && props.compileExitCode !== 0) return 'compile_failed'
  if (props.status === 'completed' && props.runExitCode === 0) return 'success'
  if (props.status === 'failed' || (props.runExitCode != null && props.runExitCode !== 0)) return 'failed'
  if (props.status === 'completed') return 'success'
  return props.status
})

const displayStatusLabel = computed(() => {
  const map = {
    idle: '未运行',
    running: '运行中',
    success: '成功',
    failed: '失败',
    compile_failed: '编译失败',
    timeout: '超时',
    cancelled: '已取消',
  }
  return map[displayStatus.value] || displayStatus.value
})

const statusTagType = computed(() => {
  const map = {
    idle: 'info',
    running: 'warning',
    success: 'success',
    failed: 'danger',
    compile_failed: 'danger',
    timeout: 'warning',
    cancelled: 'info',
  }
  return map[displayStatus.value] || 'info'
})

const exitCodeText = computed(() => {
  if (props.runExitCode == null) return '—'
  return String(props.runExitCode)
})

const compileExitCodeText = computed(() => {
  if (props.compileExitCode == null) return '—'
  return String(props.compileExitCode)
})

const durationText = computed(() => {
  if (props.durationMs == null) return '—'
  return `${props.durationMs} ms`
})

watch(
  () => [props.stderr, props.compileLog, props.stdout],
  () => {
    if (props.stderr) activeTab.value = 'stderr'
    else if (props.compileLog && props.compileExitCode != null && props.compileExitCode !== 0) {
      activeTab.value = 'compile'
    } else if (props.stdout) activeTab.value = 'stdout'
  }
)
</script>

<style scoped>
.code-run-output {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 320px;
  background: #1e1e1e;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid #2d2d2d;
  box-sizing: border-box;
}

.code-run-output__header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  background: #252526;
  border-bottom: 1px solid #2d2d2d;
  flex-wrap: wrap;
  flex-shrink: 0;
}

.status-tag {
  font-weight: 600;
}

.summary-text {
  font-size: 12px;
  color: #cccccc;
  line-height: 1.4;
}

.output-skeleton {
  padding: 16px;
}

.output-tabs {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.output-tabs :deep(.el-tabs__header) {
  margin: 0;
  background: #252526;
  border-bottom: 1px solid #2d2d2d;
  padding: 0 8px;
}

.output-tabs :deep(.el-tabs__nav-wrap) {
  padding: 0 8px;
}

.output-tabs :deep(.el-tabs__nav-wrap::after) {
  display: none;
}

.output-tabs :deep(.el-tabs__item) {
  color: #969696;
  font-size: 12px;
  font-family: ui-monospace, Consolas, monospace;
  height: 36px;
  padding: 0 16px !important;
}

.output-tabs :deep(.el-tabs__item.is-active) {
  color: #ffffff;
}

.output-tabs :deep(.el-tabs__active-bar) {
  background: #007acc;
}

.output-tabs :deep(.el-tabs__content) {
  flex: 1;
  min-height: 0;
}

.output-tabs :deep(.el-tab-pane) {
  height: 100%;
}

.tab-label {
  text-transform: lowercase;
}

.tab-dot {
  margin-left: 4px;
  vertical-align: middle;
}

.output-pane {
  height: 100%;
  min-height: 0;
  overflow: auto;
  background: #1e1e1e;
}

.output-pane--meta {
  padding: 16px 20px;
}

.output-pre {
  margin: 0;
  padding: 14px 16px;
  font-family: ui-monospace, 'Cascadia Code', Consolas, monospace;
  font-size: 13px;
  line-height: 1.55;
  color: #d4d4d4;
  white-space: pre-wrap;
  word-break: break-word;
}

.output-pre--err {
  color: #f48771;
}

.output-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 200px;
  color: #6a6a6a;
  font-size: 13px;
}

.output-empty p {
  margin: 0;
}

.meta-list {
  margin: 0;
  display: grid;
  gap: 12px;
}

.meta-list div {
  display: grid;
  grid-template-columns: 100px 1fr;
  gap: 8px;
  font-size: 13px;
}

.meta-list dt {
  margin: 0;
  color: #969696;
}

.meta-list dd {
  margin: 0;
  color: #d4d4d4;
  font-family: ui-monospace, Consolas, monospace;
  word-break: break-word;
}
</style>
