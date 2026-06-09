<template>
  <div class="assistant-workspace">
    <header class="workspace-head">
      <div>
        <h1 class="workspace-title">AI 学习助手</h1>
        <p class="workspace-sub">实训场景智能答疑 · 优先知识库与任务要求 · 通用学习建议兜底</p>
      </div>
    </header>

    <div class="workspace-shell">
      <!-- 左侧会话 -->
      <aside class="session-pane">
        <div class="session-pane__toolbar">
          <span class="session-pane__label">对话历史</span>
          <el-button type="primary" size="small" round @click="newSession">新对话</el-button>
        </div>
        <el-scrollbar class="session-scroll">
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
          <div v-if="!sessions.length" class="sess-empty">
            <p>暂无会话</p>
            <p class="sess-empty__hint">点击「新对话」开始提问</p>
          </div>
        </el-scrollbar>
      </aside>

      <!-- 中间聊天 -->
      <section class="chat-pane">
        <div ref="chatBodyRef" class="chat-body">
          <div v-if="!activeSessionId" class="chat-empty">
            <el-empty description="请选择左侧会话或新建对话" :image-size="88" />
          </div>

          <template v-else-if="!messages.length && !sending && !streaming">
            <div class="welcome-card">
              <div class="welcome-card__icon">
                <el-icon :size="40"><ChatDotRound /></el-icon>
              </div>
              <h2 class="welcome-card__title">你好，我是你的实训 AI 学习助手</h2>
              <p class="welcome-card__text">
                我可以帮助你理解任务要求、排查代码问题、整理提交规范和复习相关知识点。
              </p>
              <div class="welcome-card__chips">
                <button
                  v-for="(ex, i) in quickPrompts"
                  :key="i"
                  type="button"
                  class="welcome-chip"
                  @click="applyQuickPrompt(ex, true)"
                >
                  {{ ex }}
                </button>
              </div>
            </div>
          </template>

          <div v-else class="msg-list">
            <AssistantMessage
              v-for="m in messages"
              :key="m.id"
              :message="m"
              :meta="getMeta(m.id)"
              :display-content="streamBuffers[m.id]"
              :is-streaming="streamingMsgId === m.id"
              :render-final="streamingMsgId !== m.id"
              :show-meta="streamingMsgId !== m.id"
              @copy="copyText"
            />
          </div>
        </div>

        <div class="composer">
          <el-input
            v-model="draft"
            type="textarea"
            :autosize="{ minRows: 2, maxRows: 8 }"
            :disabled="!activeSessionId || sending || streaming"
            placeholder="可以问任务要求、代码报错、提交规范、知识点解释等问题。"
            class="composer-input"
            @keydown="onComposerKeydown"
          />
          <div class="composer-foot">
            <span class="composer-tip">
              Enter 发送 · Shift+Enter 换行
              <template v-if="streaming">· 生成中</template>
            </span>
            <div class="composer-actions">
              <el-button
                v-if="streaming"
                plain
                @click="stopGeneration"
              >
                停止生成
              </el-button>
              <el-button
                type="primary"
                :loading="sending || streaming"
                :disabled="!activeSessionId || !draft.trim() || sending || streaming"
                @click="send()"
              >
                {{ streaming ? '生成中…' : '发送' }}
              </el-button>
            </div>
          </div>
          <p class="composer-disclaimer">
            AI 建议仅供学习参考，最终评分以教师复核为准。请勿输入隐私或违规内容。
          </p>
        </div>
      </section>

      <!-- 右侧依据 -->
      <aside class="context-pane">
        <h3 class="context-pane__title">本次回答依据</h3>
        <div v-if="lastReplyMeta" class="context-card">
          <dl class="context-dl">
            <div class="context-dl__row">
              <dt>回答模式</dt>
              <dd>
                <el-tag size="small" effect="plain" :type="modeMeta(lastReplyMeta.mode).tagType">
                  {{ modeMeta(lastReplyMeta.mode).label }}
                </el-tag>
              </dd>
            </div>
            <div class="context-dl__row">
              <dt>知识库命中</dt>
              <dd>{{ lastReplyMeta.ragHit ? '是' : '否' }}</dd>
            </div>
            <div class="context-dl__row">
              <dt>命中文档</dt>
              <dd>{{ lastReplyMeta.sources?.length || 0 }} 条</dd>
            </div>
          </dl>
          <p class="context-desc">{{ modeMeta(lastReplyMeta.mode).description }}</p>
        </div>
        <p v-else class="context-empty">发送问题后，这里会展示本次回答的模式与知识库命中情况。</p>

        <AssistantQuickPrompts class="context-quick" :disabled="!activeSessionId || sending || streaming" @select="applyQuickPrompt" />

        <div class="context-reminder">
          <strong>使用提醒</strong>
          <ul>
            <li>优先查阅教师知识库与任务要求</li>
            <li>不代写完整作业，可思路与排错</li>
            <li>评分细则以教师发布为准</li>
          </ul>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { ChatDotRound } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import {
  listAssistantSessions,
  createAssistantSession,
  listAssistantMessages,
  sendAssistantMessage,
  streamAssistantMessage,
  isAssistantStreamEnabled,
} from '../../api/assistant'
import { useUserStore } from '../../stores/user'
import { formatDateTime } from '../../utils/format'
import {
  QUICK_PROMPTS,
  modeMeta,
  loadMessageMetaMap,
  saveMessageMeta,
  getMessageMeta,
} from '../../utils/assistantDisplay'
import AssistantMessage from '../../components/assistant/AssistantMessage.vue'
import AssistantQuickPrompts from '../../components/assistant/AssistantQuickPrompts.vue'

const userStore = useUserStore()
const TITLE_STORAGE_PREFIX = 'sg_assistant_sess_titles_'

function titleStorageKey() {
  const id = userStore.user?.id
  return id != null ? `${TITLE_STORAGE_PREFIX}${id}` : `${TITLE_STORAGE_PREFIX}anon`
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
  return s.length > 22 ? `${s.slice(0, 22)}…` : s
}

const sessions = ref([])
const activeSessionId = ref(null)
const messages = ref([])
const draft = ref('')
const sending = ref(false)
const streaming = ref(false)
const chatBodyRef = ref(null)
const sessionTitleMap = ref(loadTitleMap())
const messageMetaMap = ref(loadMessageMetaMap(userStore.user?.id))
const lastReplyMeta = ref(null)
const streamBuffers = ref({})
const streamingMsgId = ref(null)
let abortController = null
let pendingDelta = ''
let deltaFlushTimer = null

function sendErrorMessage(err) {
  if (err?.name === 'AbortError') return '已停止生成'
  if (err?.code === 'ECONNABORTED') {
    return 'AI 回答生成超时（超过 2 分钟），请稍后重试或缩短问题'
  }
  if (err?.message?.includes('Network Error') || err?.code === 'ERR_NETWORK') {
    return 'AI 服务暂时不可用，请稍后重试'
  }
  const msg = err?.response?.data?.message || err?.message || ''
  if (msg && !/network error/i.test(msg)) return msg
  return 'AI 服务暂时不可用，请稍后重试'
}

const quickPrompts = QUICK_PROMPTS

const sessionsDisplay = computed(() =>
  (sessions.value || []).map((s) => ({
    ...s,
    displayTitle: sessionTitleMap.value[s.id] || s.title || '对话',
  }))
)

function getMeta(messageId) {
  return getMessageMeta(messageMetaMap.value, messageId)
}

function isNearBottom(el, threshold = 96) {
  return el.scrollHeight - el.scrollTop - el.clientHeight < threshold
}

function scrollBottom(force = false) {
  nextTick(() => {
    const el = chatBodyRef.value
    if (!el) return
    if (force || isNearBottom(el)) {
      el.scrollTop = el.scrollHeight
    }
  })
}

function flushDeltaToBuffer(msgId) {
  if (!pendingDelta || msgId == null) return
  const cur = streamBuffers.value[msgId] || ''
  streamBuffers.value = { ...streamBuffers.value, [msgId]: cur + pendingDelta }
  pendingDelta = ''
  scrollBottom()
}

function scheduleDeltaFlush(msgId) {
  if (deltaFlushTimer) return
  deltaFlushTimer = window.setTimeout(() => {
    deltaFlushTimer = null
    flushDeltaToBuffer(msgId)
  }, 50)
}

function cancelActiveStream() {
  if (abortController) {
    abortController.abort()
    abortController = null
  }
  if (deltaFlushTimer) {
    window.clearTimeout(deltaFlushTimer)
    deltaFlushTimer = null
  }
  pendingDelta = ''
  streamingMsgId.value = null
  streamBuffers.value = {}
  streaming.value = false
}

function stopGeneration() {
  if (abortController) abortController.abort()
}

function applyReplyMeta(answerId, refsPayload) {
  if (!refsPayload?.mode || answerId == null) return
  const meta = {
    mode: refsPayload.mode,
    ragHit: refsPayload.ragHit,
    sources: refsPayload.sources || refsPayload.references || [],
  }
  saveMessageMeta(userStore.user?.id, answerId, meta)
  messageMetaMap.value = loadMessageMetaMap(userStore.user?.id)
  lastReplyMeta.value = meta
}

async function finalizeNonStreamReply(sid, payload, isFirstUserMessage, questionText) {
  if (isFirstUserMessage) patchSessionTitleLocal(sid, questionText)
  lastReplyMeta.value = {
    mode: payload.mode,
    ragHit: payload.ragHit,
    sources: payload.sources || [],
  }
  const resList = await listAssistantMessages(sid)
  if (!resList.success) return
  messages.value = resList.data || []
  ensureTitleFromMessages(sid, messages.value)
  await loadSessions()
  const lastAsst = [...messages.value].reverse().find((m) => m.role === 'assistant')
  if (lastAsst && payload.mode) {
    applyReplyMeta(lastAsst.id, payload)
  }
  scrollBottom(true)
}

const onComposerKeydown = (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}

function applyQuickPrompt(text, sendNow = false) {
  draft.value = text
  if (sendNow) send(text)
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(String(text || ''))
    ElMessage.success('已复制到剪贴板')
  } catch {
    ElMessage.error('复制失败')
  }
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

const ensureTitleFromMessages = (sessionId, msgs) => {
  const sid = Number(sessionId)
  if (sessionTitleMap.value[sid]) return
  const firstUser = (msgs || []).find((m) => m.role === 'user')
  if (firstUser?.content) patchSessionTitleLocal(sid, firstUser.content)
}

const newSession = async () => {
  cancelActiveStream()
  lastReplyMeta.value = null
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
  cancelActiveStream()
  sending.value = false
  activeSessionId.value = nid
  lastReplyMeta.value = null
  const res = await listAssistantMessages(nid)
  if (res.success) {
    messages.value = res.data || []
    ensureTitleFromMessages(nid, messages.value)
    const lastAsst = [...messages.value].reverse().find((m) => m.role === 'assistant')
    if (lastAsst) {
      const meta = getMeta(lastAsst.id)
      if (meta) lastReplyMeta.value = meta
    }
    scrollBottom()
  }
}

const send = async (textOverride) => {
  const t = String(textOverride ?? draft.value).trim()
  if (!t || !activeSessionId.value || sending.value || streaming.value) return

  cancelActiveStream()
  sending.value = true
  const sid = activeSessionId.value
  const isFirstUserMessage = !messages.value.some((m) => m.role === 'user')
  const userTempId = `tmp-user-${Date.now()}`
  const asstTempId = `tmp-asst-${Date.now()}`

  messages.value = [
    ...messages.value,
    { id: userTempId, role: 'user', content: t, created_at: new Date().toISOString() },
    { id: asstTempId, role: 'assistant', content: '', created_at: null },
  ]
  streamingMsgId.value = asstTempId
  streamBuffers.value = { [asstTempId]: '' }
  draft.value = ''
  if (isFirstUserMessage) patchSessionTitleLocal(sid, t)
  scrollBottom(true)

  const useStream = isAssistantStreamEnabled()
  let refsPayload = null
  let streamStarted = false

  const runNonStream = async () => {
    const res = await sendAssistantMessage(sid, t)
    if (!res.success) throw new Error(res.message || '发送失败')
    messages.value = messages.value.filter((m) => m.id !== userTempId && m.id !== asstTempId)
    streamBuffers.value = {}
    streamingMsgId.value = null
    await finalizeNonStreamReply(sid, res.data || {}, isFirstUserMessage, t)
  }

  try {
    if (!useStream) {
      await runNonStream()
      return
    }

    abortController = new AbortController()
    streaming.value = true
    sending.value = false

    refsPayload = null
    streamStarted = false

    await streamAssistantMessage(sid, t, {
      signal: abortController.signal,
      onStart: (data) => {
        streamStarted = true
        if (data?.userMessageId) {
          messages.value = messages.value.map((m) =>
            m.id === userTempId ? { ...m, id: data.userMessageId } : m
          )
        }
      },
      onDelta: ({ content }) => {
        if (!content) return
        pendingDelta += content
        scheduleDeltaFlush(asstTempId)
      },
      onReferences: (data) => {
        refsPayload = data
      },
      onDone: async (data) => {
        flushDeltaToBuffer(asstTempId)
        const finalContent = streamBuffers.value[asstTempId] || ''
        const answerId = data?.answerId ?? asstTempId
        messages.value = messages.value.map((m) => {
          if (m.id === asstTempId) {
            return {
              ...m,
              id: answerId,
              content: finalContent,
              created_at: new Date().toISOString(),
            }
          }
          return m
        })
        const next = { ...streamBuffers.value }
        delete next[asstTempId]
        streamBuffers.value = next
        streamingMsgId.value = null
        applyReplyMeta(answerId, refsPayload)
        await loadSessions()
        scrollBottom(true)
      },
      onError: (data) => {
        throw new Error(data?.message || '生成失败，请稍后重试')
      },
    })
  } catch (e) {
    if (e?.name === 'AbortError') {
      flushDeltaToBuffer(asstTempId)
      const partial = streamBuffers.value[asstTempId] || ''
      const stopped = partial.trim() ? `${partial.trim()}\n\n已停止生成。` : '已停止生成。'
      messages.value = messages.value.map((m) =>
        m.id === asstTempId ? { ...m, content: stopped } : m
      )
      const next = { ...streamBuffers.value }
      delete next[asstTempId]
      streamBuffers.value = next
      streamingMsgId.value = null
      return
    }

    if (useStream && !streamStarted) {
      try {
        messages.value = messages.value.filter((m) => m.id !== userTempId && m.id !== asstTempId)
        streamBuffers.value = {}
        streamingMsgId.value = null
        await runNonStream()
        return
      } catch (fallbackErr) {
        ElMessage.error(sendErrorMessage(fallbackErr))
        return
      }
    }

    const errText = sendErrorMessage(e)
    ElMessage.error(errText)
    flushDeltaToBuffer(asstTempId)
    const partial = streamBuffers.value[asstTempId] || ''
    const failedText = partial.trim()
      ? `${partial.trim()}\n\n${errText}`
      : errText
    messages.value = messages.value.map((m) =>
      m.id === asstTempId ? { ...m, content: failedText } : m
    )
    const next = { ...streamBuffers.value }
    delete next[asstTempId]
    streamBuffers.value = next
    streamingMsgId.value = null
  } finally {
    sending.value = false
    streaming.value = false
    abortController = null
    if (deltaFlushTimer) {
      window.clearTimeout(deltaFlushTimer)
      deltaFlushTimer = null
    }
    pendingDelta = ''
  }
}

watch(
  () => messages.value.length,
  () => nextTick(() => scrollBottom())
)

onMounted(async () => {
  userStore.loadUserFromStorage()
  sessionTitleMap.value = loadTitleMap()
  messageMetaMap.value = loadMessageMetaMap(userStore.user?.id)
  await loadSessions()
  if (sessions.value.length) {
    await selectSession(sessions.value[0].id)
  } else {
    await newSession()
  }
})

onBeforeUnmount(() => {
  cancelActiveStream()
})
</script>

<style scoped>
.assistant-workspace {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  padding: 16px 20px 20px;
  box-sizing: border-box;
  background: #eef2f7;
}

.workspace-head {
  flex-shrink: 0;
  margin-bottom: 14px;
}

.workspace-title {
  margin: 0 0 6px;
  font-size: 24px;
  font-weight: 700;
  color: #0f172a;
}

.workspace-sub {
  margin: 0;
  font-size: 14px;
  color: #64748b;
}

.workspace-shell {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 260px 1fr 280px;
  gap: 14px;
  overflow: hidden;
}

.session-pane,
.chat-pane,
.context-pane {
  background: #fff;
  border: 1px solid #e8edf3;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
  overflow: hidden;
  min-height: 0;
}

.session-pane {
  display: flex;
  flex-direction: column;
}

.session-pane__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 14px 12px;
  border-bottom: 1px solid #eef2f7;
}

.session-pane__label {
  font-size: 14px;
  font-weight: 700;
  color: #334155;
}

.session-scroll {
  flex: 1;
  min-height: 0;
  padding: 10px;
}

.session-scroll :deep(.el-scrollbar__wrap) {
  max-height: 100%;
}

.sess-item {
  padding: 11px 12px;
  border-radius: 10px;
  cursor: pointer;
  margin-bottom: 6px;
  border: 1px solid transparent;
  transition: background 0.15s ease;
}

.sess-item:hover {
  background: #f8fafc;
}

.sess-item.active {
  background: #eff6ff;
  border-color: #bfdbfe;
}

.sess-item__title {
  font-size: 13px;
  font-weight: 600;
  color: #0f172a;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.sess-item__meta {
  margin-top: 4px;
  font-size: 11px;
  color: #94a3b8;
}

.sess-empty {
  padding: 24px 12px;
  text-align: center;
  color: #94a3b8;
  font-size: 13px;
}

.sess-empty__hint {
  margin-top: 6px;
  font-size: 12px;
}

.chat-pane {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.chat-body {
  flex: 1;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 18px;
  -webkit-overflow-scrolling: touch;
}

.chat-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 280px;
}

.welcome-card {
  max-width: 520px;
  margin: 0 auto;
  text-align: center;
  padding: 24px 16px;
}

.welcome-card__icon {
  width: 68px;
  height: 68px;
  margin: 0 auto 14px;
  border-radius: 14px;
  background: #eff6ff;
  color: #1677ff;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #dbeafe;
}

.welcome-card__title {
  margin: 0 0 10px;
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
}

.welcome-card__text {
  margin: 0 0 18px;
  font-size: 14px;
  line-height: 1.65;
  color: #64748b;
}

.welcome-card__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.welcome-chip {
  padding: 8px 12px;
  font-size: 12px;
  color: #334155;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 999px;
  cursor: pointer;
}

.welcome-chip:hover {
  background: #eff6ff;
  border-color: #bfdbfe;
  color: #1677ff;
}

.msg-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.typing-row {
  display: flex;
  gap: 10px;
  align-items: center;
}

.typing-avatar {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: #f1f5f9;
  color: #1677ff;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #e2e8f0;
}

.typing-bubble {
  display: flex;
  gap: 5px;
  padding: 12px 16px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
}

.typing-bubble .dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #1677ff;
  opacity: 0.35;
  animation: bounce 1.2s ease-in-out infinite;
}

.typing-bubble .dot:nth-child(2) { animation-delay: 0.15s; }
.typing-bubble .dot:nth-child(3) { animation-delay: 0.3s; }

@keyframes bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.35; }
  40% { transform: translateY(-4px); opacity: 1; }
}

.composer {
  flex-shrink: 0;
  border-top: 1px solid #eef2f7;
  padding: 14px 16px 12px;
  background: #fafbfc;
}

.composer-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 10px;
  gap: 12px;
}

.composer-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.composer-tip {
  font-size: 12px;
  color: #94a3b8;
}

.composer-disclaimer {
  margin: 10px 0 0;
  font-size: 11px;
  line-height: 1.5;
  color: #94a3b8;
}

.context-pane {
  padding: 16px;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.context-pane__title {
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
}

.context-card {
  padding: 12px;
  margin-bottom: 16px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.context-dl {
  margin: 0;
}

.context-dl__row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
  font-size: 13px;
}

.context-dl__row dt {
  color: #64748b;
}

.context-dl__row dd {
  margin: 0;
  font-weight: 600;
  color: #334155;
}

.context-desc {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.55;
  color: #64748b;
}

.context-empty {
  margin: 0 0 16px;
  font-size: 12px;
  line-height: 1.55;
  color: #94a3b8;
}

.context-quick {
  margin-bottom: 16px;
}

.context-reminder {
  padding: 12px;
  border-radius: 10px;
  background: #fffbeb;
  border: 1px solid #fde68a;
  font-size: 12px;
  color: #92400e;
}

.context-reminder strong {
  display: block;
  margin-bottom: 6px;
}

.context-reminder ul {
  margin: 0;
  padding-left: 18px;
  line-height: 1.55;
}

@media (max-width: 1100px) {
  .workspace-shell {
    grid-template-columns: 240px 1fr;
  }

  .context-pane {
    display: none;
  }
}

@media (max-width: 768px) {
  .workspace-shell {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }

  .session-pane {
    max-height: 180px;
  }

  .assistant-workspace {
    padding: 12px 14px 14px;
  }
}
</style>
