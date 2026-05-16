<template>
  <div class="page-asst">
    <header class="page-head">
      <h1 class="page-title">AI 答疑助手</h1>
      <p class="page-desc">
        结合本班任务与教师知识库（RAG）回答实训相关问题；请勿输入隐私或违规内容。
      </p>
    </header>

    <div class="assistant-shell">
      <aside class="session-pane">
        <div class="session-pane__toolbar">
          <span class="session-pane__label">对话历史</span>
          <el-button type="primary" size="small" round @click="newSession">新对话</el-button>
        </div>
        <el-scrollbar class="session-scrollbar">
          <div
            v-for="s in sessionsDisplay"
            :key="s.id"
            class="sess-item"
            :class="{ active: s.id === activeSessionId }"
            @click="selectSession(s.id)"
          >
            <div class="sess-item__title">{{ s.displayTitle }}</div>
            <div class="sess-item__meta">{{ formatDateTime(s.updated_at) }}</div>
          </div>
          <el-empty v-if="!sessions.length" description="暂无会话" :image-size="72" />
        </el-scrollbar>
      </aside>

      <section class="chat-pane">
        <div ref="chatBodyRef" class="chat-body">
          <div v-if="!activeSessionId" class="chat-empty chat-empty--warn">
            <el-empty description="请选择左侧会话或新建对话" :image-size="88" />
          </div>

          <template v-else-if="!messages.length && !sending">
            <div class="chat-empty chat-empty--welcome">
              <div class="welcome-icon" aria-hidden="true">
                <el-icon :size="44"><ChatDotRound /></el-icon>
              </div>
              <h2 class="welcome-title">有问题随时问我</h2>
              <p class="welcome-desc">
                我会结合本班实训任务与教师知识库作答；描述越具体，回答越有针对性。
              </p>
              <div class="welcome-chips">
                <button
                  v-for="(ex, i) in exampleQuestions"
                  :key="i"
                  type="button"
                  class="chip"
                  @click="applyExample(ex)"
                >
                  {{ ex }}
                </button>
              </div>
            </div>
          </template>

          <transition-group v-else name="msg-pop" tag="div" class="msg-list">
            <div
              v-for="m in messages"
              :key="m.id"
              class="msg-row"
              :class="m.role === 'user' ? 'msg-row--user' : 'msg-row--assistant'"
            >
              <div class="msg-avatar" :class="m.role === 'user' ? 'msg-avatar--user' : 'msg-avatar--bot'">
                <el-icon v-if="m.role === 'user'"><UserFilled /></el-icon>
                <el-icon v-else><Cpu /></el-icon>
              </div>
              <div class="msg-main">
                <div class="msg-meta">
                  <span class="msg-name">{{ m.role === 'user' ? '我' : '实训助手' }}</span>
                  <span v-if="m.created_at" class="msg-time">{{ formatDateTime(m.created_at) }}</span>
                </div>
                <div
                  class="bubble"
                  :class="m.role === 'user' ? 'bubble--user' : 'bubble--assistant'"
                >
                  <div
                    v-if="m.role === 'assistant'"
                    class="bubble-content bubble-content--assistant"
                    v-html="assistantHtml(m)"
                  />
                  <div v-else class="bubble-content">{{ m.content }}</div>
                </div>
              </div>
            </div>

            <div v-if="sending" key="__typing__" class="msg-row msg-row--assistant msg-row--typing">
              <div class="msg-avatar msg-avatar--bot">
                <el-icon><Cpu /></el-icon>
              </div>
              <div class="msg-main">
                <div class="msg-meta">
                  <span class="msg-name">实训助手</span>
                  <span class="msg-time thinking-label">思考中…</span>
                </div>
                <div class="bubble bubble--assistant bubble--typing">
                  <span class="dot" /><span class="dot" /><span class="dot" />
                </div>
              </div>
            </div>
          </transition-group>
        </div>

        <div class="composer">
          <div class="composer-inner">
            <el-input
              v-model="draft"
              type="textarea"
              :autosize="{ minRows: 2, maxRows: 10 }"
              :disabled="!activeSessionId || sending"
              placeholder="输入问题，Enter 发送，Shift+Enter 换行…"
              class="composer-input"
              @keydown="onComposerKeydown"
            />
            <div class="composer-actions">
              <span class="composer-hint">Enter 发送 · Shift+Enter 换行</span>
              <el-button
                type="primary"
                class="send-btn"
                :loading="sending"
                :disabled="!activeSessionId || !draft.trim() || sending"
                @click="send"
              >
                发送
              </el-button>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { ChatDotRound, UserFilled, Cpu } from '@element-plus/icons-vue'
import {
  listAssistantSessions,
  createAssistantSession,
  listAssistantMessages,
  sendAssistantMessage,
} from '../../api/assistant'
import { ElMessage } from 'element-plus'
import { useUserStore } from '../../stores/user'
import { formatDateTime } from '../../utils/format'

const userStore = useUserStore()

const TITLE_STORAGE_PREFIX = 'sg_assistant_sess_titles_'

function titleStorageKey() {
  const id = userStore.user?.id
  return id != null ? `${TITLE_STORAGE_PREFIX}${id}` : TITLE_STORAGE_PREFIX + 'anon'
}

function loadTitleMap() {
  try {
    const raw = sessionStorage.getItem(titleStorageKey())
    if (!raw) return {}
    const o = JSON.parse(raw)
    return typeof o === 'object' && o ? o : {}
  } catch {
    return {}
  }
}

function saveTitleMap(map) {
  try {
    sessionStorage.setItem(titleStorageKey(), JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

function deriveTitleFromQuestion(q) {
  const s = String(q || '').trim().replace(/\s+/g, ' ')
  if (!s) return '新对话'
  const max = 22
  return s.length > max ? `${s.slice(0, max)}…` : s
}

const sessions = ref([])
const activeSessionId = ref(null)
const messages = ref([])
const draft = ref('')
const sending = ref(false)
const chatBodyRef = ref(null)

/** 侧栏展示用标题（首问生成，仅存前端 sessionStorage，不改变接口） */
const sessionTitleMap = ref(loadTitleMap())

const streamBuffers = ref({})
let streamToken = 0

const exampleQuestions = [
  '本次实训的提交格式有什么要求？',
  '评分维度里「功能实现」具体指什么？',
  '知识库里有没有和接口调试相关的说明？',
]

const sessionsDisplay = computed(() => {
  return (sessions.value || []).map((s) => ({
    ...s,
    displayTitle: sessionTitleMap.value[s.id] || s.title || '对话',
  }))
})

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 简单可读增强：换行、加粗 **x**、行内 `code` */
function formatAssistantRich(text) {
  let s = escapeHtml(text || '')
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>')
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/\n/g, '<br />')
  return s
}

function assistantHtml(m) {
  if (m.role !== 'assistant') return escapeHtml(m.content)
  const buf = streamBuffers.value[m.id]
  const raw = buf !== undefined ? buf : m.content
  return formatAssistantRich(raw)
}

function scrollBottom() {
  nextTick(() => {
    const el = chatBodyRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

async function runTypewriter(msgId, fullText) {
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    return
  }
  const myToken = ++streamToken
  streamBuffers.value = { ...streamBuffers.value, [msgId]: '' }
  const chars = Array.from(fullText)
  const stepMs = 14
  for (let i = 0; i <= chars.length; i++) {
    if (myToken !== streamToken) return
    streamBuffers.value = { ...streamBuffers.value, [msgId]: chars.slice(0, i).join('') }
    if (i % 4 === 0) scrollBottom()
    if (i < chars.length) await new Promise((r) => setTimeout(r, stepMs))
  }
  const next = { ...streamBuffers.value }
  delete next[msgId]
  streamBuffers.value = next
  scrollBottom()
}

function cancelTypewriter() {
  streamToken++
  streamBuffers.value = {}
}

const onComposerKeydown = (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}

const applyExample = (text) => {
  draft.value = text
  nextTick(() => scrollBottom())
}

const loadSessions = async () => {
  const res = await listAssistantSessions()
  if (res.success) sessions.value = res.data || []
}

const patchSessionTitleLocal = (sessionId, questionText) => {
  const sid = Number(sessionId)
  const title = deriveTitleFromQuestion(questionText)
  const map = { ...sessionTitleMap.value, [sid]: title }
  sessionTitleMap.value = map
  saveTitleMap(map)
}

/** 无本地缓存时，用首条用户消息推导标题（仍仅前端展示，不写库） */
const ensureTitleFromMessages = (sessionId, msgs) => {
  const sid = Number(sessionId)
  if (sessionTitleMap.value[sid]) return
  const firstUser = (msgs || []).find((m) => m.role === 'user')
  if (firstUser?.content) patchSessionTitleLocal(sid, firstUser.content)
}

const newSession = async () => {
  cancelTypewriter()
  const res = await createAssistantSession({ title: '新对话' })
  if (res.success) {
    await loadSessions()
    activeSessionId.value = res.data.id
    messages.value = []
  }
}

const selectSession = async (id) => {
  const nid = Number(id)
  if (nid === Number(activeSessionId.value)) return
  cancelTypewriter()
  sending.value = false
  activeSessionId.value = nid
  const res = await listAssistantMessages(nid)
  if (res.success) {
    messages.value = res.data || []
    ensureTitleFromMessages(nid, messages.value)
    scrollBottom()
  }
}

const send = async () => {
  const t = draft.value.trim()
  if (!t || !activeSessionId.value || sending.value) return
  sending.value = true
  const sid = activeSessionId.value
  const isFirstUserMessage =
    messages.value.length === 0 || !messages.value.some((m) => m.role === 'user')

  try {
    const res = await sendAssistantMessage(sid, t)
    if (res.success) {
      if (isFirstUserMessage) patchSessionTitleLocal(sid, t)
      draft.value = ''
      const resList = await listAssistantMessages(sid)
      if (resList.success) {
        messages.value = resList.data || []
        ensureTitleFromMessages(sid, messages.value)
        await loadSessions()
        await nextTick()
        scrollBottom()
        const lastAsst = [...messages.value].reverse().find((m) => m.role === 'assistant')
        if (lastAsst?.content) await runTypewriter(lastAsst.id, lastAsst.content)
      }
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '发送失败')
  } finally {
    sending.value = false
    scrollBottom()
  }
}

watch(
  () => messages.value.length,
  () => nextTick(() => scrollBottom())
)

onMounted(async () => {
  userStore.loadUserFromStorage()
  sessionTitleMap.value = loadTitleMap()
  await loadSessions()
  if (sessions.value.length) {
    await selectSession(sessions.value[0].id)
  } else {
    await newSession()
  }
})

onBeforeUnmount(() => {
  cancelTypewriter()
})
</script>

<style scoped>
.page-asst {
  max-width: 1280px;
  margin: 0 auto;
}

.page-head {
  margin-bottom: 20px;
}

.page-title {
  margin: 0 0 8px;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--sg-text);
}

.page-desc {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--sg-text-secondary);
}

.assistant-shell {
  display: flex;
  gap: 0;
  min-height: min(640px, calc(100vh - 220px));
  border-radius: var(--sg-radius-lg);
  border: 1px solid var(--sg-border);
  background: var(--sg-bg-elevated);
  box-shadow: var(--sg-shadow-card);
  overflow: hidden;
}

.session-pane {
  width: 280px;
  flex-shrink: 0;
  border-right: 1px solid var(--sg-border);
  background: linear-gradient(180deg, var(--sg-fill) 0%, #fff 40%);
  display: flex;
  flex-direction: column;
}

.session-pane__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--sg-border);
}

.session-pane__label {
  font-size: 14px;
  font-weight: 600;
  color: var(--sg-text);
}

.session-scrollbar {
  flex: 1;
  padding: 10px 10px 14px;
}

.sess-item {
  padding: 12px 14px;
  border-radius: var(--sg-radius-md);
  cursor: pointer;
  margin-bottom: 6px;
  transition:
    background var(--sg-transition),
    box-shadow var(--sg-transition),
    transform var(--sg-transition-fast);
  border: 1px solid transparent;
}

.sess-item:hover {
  background: rgba(37, 99, 235, 0.06);
}

.sess-item.active {
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.12) 0%, rgba(37, 99, 235, 0.06) 100%);
  border-color: rgba(37, 99, 235, 0.22);
  box-shadow: var(--sg-shadow-xs);
}

.sess-item__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--sg-text);
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.sess-item__meta {
  margin-top: 6px;
  font-size: 12px;
  color: var(--sg-text-placeholder);
}

.chat-pane {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #fafbfc 0%, #fff 100%);
}

.chat-body {
  flex: 1;
  min-height: 360px;
  overflow-y: auto;
  padding: 20px 22px;
  scroll-behavior: smooth;
}

.chat-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  min-height: 320px;
  padding: 24px;
}

.chat-empty--welcome .welcome-icon {
  width: 72px;
  height: 72px;
  border-radius: 20px;
  background: linear-gradient(145deg, var(--sg-primary-soft), #fff);
  border: 1px solid var(--sg-border);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--sg-primary);
  margin-bottom: 16px;
}

.welcome-title {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 700;
  color: var(--sg-text);
}

.welcome-desc {
  margin: 0 0 20px;
  font-size: 13px;
  color: var(--sg-text-secondary);
  max-width: 420px;
  line-height: 1.65;
}

.welcome-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
  max-width: 520px;
}

.chip {
  padding: 8px 14px;
  font-size: 13px;
  color: var(--sg-primary);
  background: #fff;
  border: 1px solid rgba(37, 99, 235, 0.28);
  border-radius: 999px;
  cursor: pointer;
  transition:
    background var(--sg-transition),
    border-color var(--sg-transition),
    transform var(--sg-transition-fast);
}

.chip:hover {
  background: rgba(37, 99, 235, 0.08);
  border-color: var(--sg-primary);
  transform: translateY(-1px);
}

.msg-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

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
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}

.msg-avatar--user {
  background: linear-gradient(145deg, #3b82f6, #2563eb);
  color: #fff;
  box-shadow: 0 4px 14px rgba(37, 99, 235, 0.35);
}

.msg-avatar--bot {
  background: linear-gradient(145deg, #f1f5f9, #e2e8f0);
  color: var(--sg-primary);
  border: 1px solid var(--sg-border);
}

.msg-main {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  max-width: min(720px, calc(100% - 56px));
}

.msg-row--user .msg-main {
  align-items: flex-end;
}

.msg-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.msg-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--sg-text-secondary);
}

.msg-time {
  font-size: 11px;
  color: var(--sg-text-placeholder);
}

.thinking-label {
  color: var(--sg-primary);
  font-weight: 500;
}

.bubble {
  border-radius: 14px;
  padding: 12px 16px;
  box-shadow: var(--sg-shadow-xs);
  max-width: 100%;
  word-break: break-word;
}

.bubble--user {
  background: linear-gradient(145deg, #3b82f6 0%, #2563eb 100%);
  color: #fff;
  border-bottom-right-radius: 4px;
}

.bubble--assistant {
  background: #fff;
  border: 1px solid var(--sg-border);
  border-bottom-left-radius: 4px;
  box-shadow: 0 2px 12px rgba(15, 23, 42, 0.06);
}

.bubble-content {
  font-size: 14px;
  line-height: 1.65;
  white-space: pre-wrap;
}

.bubble--user .bubble-content {
  color: #fff;
}

.bubble-content--assistant :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12.5px;
  padding: 2px 6px;
  border-radius: 6px;
  background: var(--sg-fill-muted);
  color: #0f172a;
}

.bubble-content--assistant :deep(strong) {
  color: var(--sg-text);
  font-weight: 600;
}

.bubble--typing {
  display: flex;
  align-items: center;
  gap: 5px;
  min-height: 44px;
  min-width: 72px;
}

.bubble--typing .dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--sg-primary);
  opacity: 0.35;
  animation: bounce-dot 1.2s ease-in-out infinite;
}

.bubble--typing .dot:nth-child(2) {
  animation-delay: 0.15s;
}
.bubble--typing .dot:nth-child(3) {
  animation-delay: 0.3s;
}

@keyframes bounce-dot {
  0%,
  80%,
  100% {
    transform: translateY(0);
    opacity: 0.35;
  }
  40% {
    transform: translateY(-5px);
    opacity: 1;
  }
}

.composer {
  border-top: 1px solid var(--sg-border);
  padding: 14px 18px 16px;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(8px);
}

.composer-inner {
  max-width: 880px;
  margin: 0 auto;
}

.composer-input :deep(.el-textarea__inner) {
  border-radius: var(--sg-radius-md);
  font-size: 14px;
  line-height: 1.55;
  transition: box-shadow var(--sg-transition);
}

.composer-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
  gap: 12px;
  flex-wrap: wrap;
}

.composer-hint {
  font-size: 12px;
  color: var(--sg-text-placeholder);
}

.send-btn {
  min-width: 92px;
  border-radius: var(--sg-radius-md);
  font-weight: 600;
}

.send-btn.is-disabled {
  opacity: 0.55;
}

.msg-pop-enter-active,
.msg-pop-leave-active {
  transition:
    opacity 0.28s var(--sg-ease-out),
    transform 0.32s var(--sg-ease-out);
}

.msg-pop-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.msg-pop-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

@media (max-width: 900px) {
  .assistant-shell {
    flex-direction: column;
    min-height: auto;
  }

  .session-pane {
    width: 100%;
    border-right: none;
    border-bottom: 1px solid var(--sg-border);
    max-height: 220px;
  }

  .chat-body {
    min-height: 280px;
  }

  .msg-main {
    max-width: calc(100% - 52px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .sess-item,
  .chip,
  .msg-pop-enter-active,
  .msg-pop-leave-active {
    transition: none !important;
  }

  .bubble--typing .dot {
    animation: none;
    opacity: 0.7;
  }
}
</style>
