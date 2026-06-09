<template>
  <div class="msg-row" :class="message.role === 'user' ? 'msg-row--user' : 'msg-row--assistant'">
    <div class="msg-avatar" :class="message.role === 'user' ? 'msg-avatar--user' : 'msg-avatar--bot'">
      <el-icon v-if="message.role === 'user'"><UserFilled /></el-icon>
      <el-icon v-else><Cpu /></el-icon>
    </div>
    <div class="msg-main">
      <div class="msg-meta">
        <span class="msg-name">{{ message.role === 'user' ? '我' : '实训助手' }}</span>
        <el-tag
          v-if="message.role === 'assistant' && modeLabel && showMeta"
          size="small"
          effect="plain"
          :type="modeTagType"
          class="mode-tag"
        >
          {{ modeLabel }}
        </el-tag>
        <span v-if="message.created_at" class="msg-time">{{ formatDateTime(message.created_at) }}</span>
      </div>
      <div class="bubble" :class="message.role === 'user' ? 'bubble--user' : 'bubble--assistant'">
        <div
          v-if="message.role === 'assistant'"
          class="bubble-content bubble-content--assistant"
          :class="{ 'is-streaming': isStreaming && !renderFinal }"
        >
          <p v-if="isStreaming && !hasVisibleContent" class="asst-generating">正在生成…</p>
          <div v-else v-html="htmlContent" />
        </div>
        <div v-else class="bubble-content">{{ message.content }}</div>
      </div>
      <template v-if="message.role === 'assistant' && !isStreaming">
        <AssistantSources v-if="showMeta" :sources="meta?.sources" :mode="meta?.mode" />
        <div v-if="message.content" class="msg-actions">
          <el-button size="small" text type="primary" @click="$emit('copy', copyTextValue)">复制回答</el-button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { UserFilled, Cpu } from '@element-plus/icons-vue'
import { formatDateTime } from '../../utils/format'
import { modeMeta } from '../../utils/assistantDisplay'
import {
  formatAssistantContent,
  formatAssistantStreamPreview,
} from '../../utils/formatAssistantContent'
import AssistantSources from './AssistantSources.vue'

const props = defineProps({
  message: { type: Object, required: true },
  meta: { type: Object, default: null },
  displayContent: { type: String, default: '' },
  isStreaming: { type: Boolean, default: false },
  renderFinal: { type: Boolean, default: true },
  showMeta: { type: Boolean, default: true },
})

defineEmits(['copy'])

const modeLabel = computed(() => (props.meta?.mode ? modeMeta(props.meta.mode).label : ''))
const modeTagType = computed(() => (props.meta?.mode ? modeMeta(props.meta.mode).tagType : 'info'))

const rawText = computed(() => props.displayContent || props.message.content || '')
const hasVisibleContent = computed(() => !!String(rawText.value).trim())

const copyTextValue = computed(() => String(rawText.value || props.message.content || ''))

const htmlContent = ref('')
let flushTimer = null

function scheduleRender() {
  if (flushTimer) return
  flushTimer = window.setTimeout(() => {
    flushTimer = null
    const raw = rawText.value
    if (props.isStreaming && !props.renderFinal) {
      htmlContent.value = formatAssistantStreamPreview(raw)
    } else {
      htmlContent.value = formatAssistantContent(raw)
    }
  }, props.isStreaming && !props.renderFinal ? 50 : 0)
}

watch(
  () => [rawText.value, props.isStreaming, props.renderFinal],
  () => scheduleRender(),
  { immediate: true }
)

onBeforeUnmount(() => {
  if (flushTimer) window.clearTimeout(flushTimer)
})
</script>

<style scoped>
.msg-row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  max-width: 100%;
}

.msg-row--user {
  flex-direction: row-reverse;
}

.msg-row--user .msg-main {
  align-items: flex-end;
}

.msg-row--user .msg-meta {
  flex-direction: row-reverse;
}

.msg-avatar {
  flex-shrink: 0;
  width: 38px;
  height: 38px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}

.msg-avatar--user {
  background: #1677ff;
  color: #fff;
}

.msg-avatar--bot {
  background: #f1f5f9;
  color: #1677ff;
  border: 1px solid #e2e8f0;
}

.msg-main {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  max-width: min(720px, calc(100% - 52px));
}

.msg-row--user .msg-main {
  align-items: flex-end;
}

.msg-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.msg-name {
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
}

.msg-time {
  font-size: 11px;
  color: #94a3b8;
}

.mode-tag {
  border: none !important;
}

.bubble {
  border-radius: 12px;
  padding: 12px 14px;
  max-width: 100%;
  word-break: break-word;
}

.bubble--user {
  background: #1677ff;
  color: #fff;
  border-bottom-right-radius: 4px;
}

.bubble--assistant {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-bottom-left-radius: 4px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);
  width: 100%;
}

.bubble-content {
  font-size: 14px;
  line-height: 1.65;
}

.bubble--user .bubble-content {
  color: #fff;
}

/* 行内代码（VS Code 浅色内联风格） */
.bubble-content--assistant :deep(p code),
.bubble-content--assistant :deep(li code),
.bubble-content--assistant :deep(.asst-heading code) {
  font-family: Consolas, 'Courier New', ui-monospace, Menlo, monospace;
  font-size: 12.5px;
  padding: 1px 5px;
  border-radius: 3px;
  background: #f3f3f3;
  color: #a31515;
  border: 1px solid #e8e8e8;
}

/* 块级代码：不受行内 code 样式影响 */
.bubble-content--assistant :deep(.asst-pre code) {
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  color: inherit;
  font-size: inherit;
}

.bubble-content--assistant :deep(strong) {
  font-weight: 600;
  color: #0f172a;
}

.bubble-content--assistant :deep(.asst-p) {
  margin: 0 0 10px;
  color: #334155;
}

.bubble-content--assistant :deep(.asst-p:last-child) {
  margin-bottom: 0;
}

.bubble-content--assistant :deep(.asst-heading) {
  margin: 14px 0 8px;
  font-weight: 600;
  color: #0f172a;
  line-height: 1.45;
}

.bubble-content--assistant :deep(.asst-heading:first-child) {
  margin-top: 0;
}

.bubble-content--assistant :deep(.asst-heading--3) {
  font-size: 15px;
}

.bubble-content--assistant :deep(.asst-heading--4) {
  font-size: 14px;
}

.bubble-content--assistant :deep(.asst-list) {
  margin: 0 0 10px;
  padding-left: 1.25em;
  color: #334155;
}

.bubble-content--assistant :deep(.asst-list li) {
  margin: 4px 0;
}

.bubble-content--assistant :deep(.asst-list--ordered) {
  padding-left: 1.4em;
}

.bubble-content--assistant :deep(.asst-divider) {
  height: 1px;
  margin: 12px 0;
  background: #e2e8f0;
}

/* VS Code Dark+ 代码块 */
.bubble-content--assistant :deep(.asst-code-panel) {
  margin: 12px 0;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid #2d2d2d;
  background: #1e1e1e;
}

.bubble-content--assistant :deep(.asst-code-toolbar) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: #2d2d2d;
  border-bottom: 1px solid #3c3c3c;
}

.bubble-content--assistant :deep(.asst-code-lang) {
  font-family: Consolas, 'Courier New', ui-monospace, Menlo, monospace;
  font-size: 11px;
  color: #cccccc;
  text-transform: lowercase;
}

.bubble-content--assistant :deep(.asst-pre) {
  margin: 0;
  padding: 14px 16px;
  background: #1e1e1e;
  color: #d4d4d4;
  overflow-x: auto;
}

.bubble-content--assistant :deep(.asst-code-panel),
.bubble-content--assistant :deep(.asst-code-panel *) {
  color: #d4d4d4;
}

.bubble-content--assistant :deep(.asst-code-block) {
  display: block;
  font-family: Consolas, 'Courier New', ui-monospace, Menlo, monospace;
  font-size: 13px;
  line-height: 1.55;
  color: #d4d4d4;
  white-space: pre;
  tab-size: 4;
  -webkit-font-smoothing: antialiased;
}

.bubble-content--assistant.is-streaming {
  color: #334155;
}

.asst-generating {
  margin: 0;
  color: #94a3b8;
  font-size: 13px;
}

.msg-actions {
  margin-top: 4px;
}
</style>
