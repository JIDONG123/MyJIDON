<template>
  <div class="qb-ws">
    <header class="qb-ws-top">
      <div class="qb-ws-top-left">
        <div class="qb-ws-title-row">
          <span class="qb-ws-title">{{ title }}</span>
          <el-tag v-if="statusLabel" size="small" :type="statusTagType" effect="plain" class="qb-ws-status-tag">{{ statusLabel }}</el-tag>
        </div>
        <div class="qb-ws-meta-lines">
          <span v-for="(line, idx) in subtitleLinesFiltered" :key="idx" class="qb-ws-meta-line">{{ line }}</span>
          <span v-if="deadlineText" class="qb-ws-deadline">截止：{{ deadlineText }}</span>
        </div>
      </div>
      <div class="qb-ws-top-mid">
        <div class="qb-ws-progress-row">
          <span class="qb-ws-progress-label">进度 {{ answeredCount }} / {{ totalQuestions }}</span>
          <el-progress :percentage="progressPct" :stroke-width="8" :show-text="false" class="qb-ws-progress-bar" />
        </div>
        <div class="qb-ws-mid-sub">
          <span class="qb-ws-time">用时 {{ elapsedText }}</span>
          <span v-if="saving" class="qb-ws-saving">正在暂存…</span>
          <slot name="toolbar-mid-extra" />
        </div>
      </div>
      <div class="qb-ws-top-right">
        <el-button v-if="!readOnly" :loading="saving" @click="$emit('save')">暂存</el-button>
        <el-button v-if="!readOnly" type="primary" :loading="submitting" @click="$emit('submit')">提交</el-button>
        <el-button @click="$emit('exit')">退出</el-button>
      </div>
    </header>

    <div class="qb-ws-body">
      <aside class="qb-ws-nav" :class="{ 'qb-ws-nav--collapsed': navCollapsed }">
        <div class="qb-ws-nav-head">
          <span class="qb-ws-nav-title">题号</span>
          <el-button text type="primary" class="qb-ws-collapse-btn" @click="navCollapsed = !navCollapsed">
            {{ navCollapsed ? '展开' : '收起' }}
          </el-button>
        </div>
        <div v-show="!navCollapsed" class="qb-ws-nav-grid-wrap">
          <div class="qb-ws-nav-grid">
            <button
              v-for="idx in totalQuestions"
              :key="idx"
              type="button"
              class="nav-cell"
              :class="navCellClass(idx - 1)"
              :title="`第 ${idx} 题`"
              @click="goIndex(idx - 1)"
            >
              {{ idx }}
            </button>
          </div>
        </div>
        <div v-show="navCollapsed" class="qb-ws-nav-collapsed-hint">已收起导航</div>
      </aside>

      <main class="qb-ws-main">
        <div class="qb-ws-main-inner">
          <slot />
        </div>
      </main>
    </div>

    <footer class="qb-ws-bottom">
      <div class="qb-ws-bottom-left">
        <el-button :disabled="currentIndex <= 0" @click="goIndex(currentIndex - 1)">上一题</el-button>
        <el-button v-if="!readOnly" :type="flagCurrent ? 'warning' : 'default'" plain @click="toggleFlag">
          {{ flagCurrent ? '取消标记' : '标记待查' }}
        </el-button>
        <el-button :disabled="currentIndex >= totalQuestions - 1" type="primary" @click="goIndex(currentIndex + 1)">
          下一题
        </el-button>
      </div>
      <div class="qb-ws-bottom-right">第 {{ displayNo }} 题 / 共 {{ totalQuestions }} 题</div>
    </footer>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  title: { type: String, default: '' },
  /** 副标题行（课程/班级、场景说明等） */
  subtitleLines: { type: Array, default: () => [] },
  deadlineText: { type: String, default: '' },
  totalQuestions: { type: Number, default: 0 },
  currentIndex: { type: Number, default: 0 },
  answeredCount: { type: Number, default: 0 },
  elapsedText: { type: String, default: '00:00' },
  statusLabel: { type: String, default: '' },
  statusTagType: { type: String, default: 'info' },
  readOnly: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
  submitting: { type: Boolean, default: false },
  /** (i: number) => boolean */
  isAnsweredAt: { type: Function, required: true },
  /** (i: number) => boolean */
  isFlaggedAt: { type: Function, required: true },
})

const emit = defineEmits(['update:currentIndex', 'save', 'submit', 'exit', 'toggle-flag'])

const navCollapsed = ref(false)

const subtitleLinesFiltered = computed(() =>
  (props.subtitleLines || []).map((x) => String(x || '').trim()).filter(Boolean)
)

const displayNo = computed(() => {
  const n = props.totalQuestions
  if (!n) return 0
  return Math.min(Math.max(props.currentIndex + 1, 1), n)
})

const progressPct = computed(() => {
  const t = props.totalQuestions
  if (!t) return 0
  return Math.min(100, Math.round((props.answeredCount / t) * 100))
})

const flagCurrent = computed(() => props.isFlaggedAt(props.currentIndex))

function goIndex(i) {
  const t = props.totalQuestions
  if (!t) return
  const next = Math.max(0, Math.min(t - 1, i))
  emit('update:currentIndex', next)
}

function toggleFlag() {
  if (props.readOnly) return
  emit('toggle-flag', props.currentIndex)
}

function navCellClass(i) {
  const cur = i === props.currentIndex
  const ans = props.isAnsweredAt(i)
  const fl = props.isFlaggedAt(i)
  return {
    'nav-cell--current': cur,
    'nav-cell--answered': ans && !cur,
    'nav-cell--unanswered': !ans && !cur,
    'nav-cell--flagged': fl,
  }
}
</script>

<style scoped>
.qb-ws {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background: var(--sg-bg-page, #f4f6f8);
  border: 1px solid var(--sg-border, #e5e7eb);
  border-radius: 0;
  overflow: hidden;
}

.qb-ws-top {
  flex-shrink: 0;
  display: grid;
  grid-template-columns: minmax(200px, 1fr) minmax(220px, 340px) auto;
  gap: 12px 20px;
  align-items: center;
  padding: 10px 16px;
  background: rgba(255, 255, 255, 0.97);
  border-bottom: 1px solid var(--sg-border, #e5e7eb);
  box-shadow: 0 1px 0 rgba(15, 23, 42, 0.04);
}

.qb-ws-top-left {
  min-width: 0;
}

.qb-ws-title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.qb-ws-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--sg-text);
  letter-spacing: -0.01em;
  line-height: 1.35;
  min-width: 0;
}

.qb-ws-status-tag {
  flex-shrink: 0;
}

.qb-ws-meta-lines {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  font-size: 12px;
  color: var(--sg-text-secondary);
  line-height: 1.45;
}

.qb-ws-meta-line {
  max-width: 100%;
}

.qb-ws-deadline {
  color: var(--el-color-primary-dark-2);
  font-weight: 500;
}

.qb-ws-top-mid {
  min-width: 0;
}

.qb-ws-progress-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 4px;
}

.qb-ws-progress-label {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--sg-text-secondary);
  font-variant-numeric: tabular-nums;
}

.qb-ws-progress-bar {
  flex: 1;
  min-width: 0;
}

.qb-ws-mid-sub {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
  font-size: 12px;
  color: var(--sg-text-secondary);
}

.qb-ws-time {
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  color: var(--sg-text);
}

.qb-ws-saving {
  color: var(--el-color-primary);
}

.qb-ws-top-right {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  align-items: center;
}

.qb-ws-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: row;
  overflow: hidden;
}

.qb-ws-nav {
  width: 200px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-right: 1px solid var(--sg-border, #e5e7eb);
  min-height: 0;
  transition: width 0.2s ease;
}

.qb-ws-nav--collapsed {
  width: 72px;
}

.qb-ws-nav-head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.qb-ws-nav-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--sg-text-secondary);
}

.qb-ws-collapse-btn {
  padding: 0 4px;
  font-size: 12px;
}

.qb-ws-nav-grid-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 10px;
}

.qb-ws-nav--collapsed .qb-ws-nav-grid-wrap {
  display: none;
}

.qb-ws-nav-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
}

.qb-ws-nav--collapsed .qb-ws-nav-grid {
  display: none;
}

.nav-cell {
  aspect-ratio: 1;
  min-width: 0;
  border-radius: 8px;
  border: 1px solid var(--el-border-color);
  background: var(--el-fill-color-light);
  color: var(--sg-text-secondary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  font-variant-numeric: tabular-nums;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    color 0.15s ease;
}

.nav-cell:hover {
  border-color: var(--el-color-primary-light-5);
  color: var(--el-color-primary);
}

.nav-cell--unanswered {
  background: #f3f4f6;
  color: #64748b;
}

.nav-cell--answered {
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary-light-5);
  color: var(--el-color-primary-dark-2);
}

.nav-cell--flagged {
  box-shadow: inset 0 0 0 2px #f59e0b;
}

.nav-cell--current {
  border-color: var(--el-color-primary);
  background: #fff;
  color: var(--el-color-primary);
  box-shadow: 0 0 0 2px rgba(20, 184, 166, 0.35);
}

.nav-cell--current.nav-cell--flagged {
  box-shadow:
    0 0 0 2px rgba(20, 184, 166, 0.35),
    inset 0 0 0 2px #f59e0b;
}

.qb-ws-nav-collapsed-hint {
  padding: 12px 8px;
  font-size: 11px;
  color: var(--sg-text-secondary);
  text-align: center;
  line-height: 1.4;
}

.qb-ws-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0;
  background: linear-gradient(180deg, #fafbfc 0%, #f4f6f8 100%);
}

.qb-ws-main-inner {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 14px 18px 16px;
}

.qb-ws-bottom {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  background: rgba(255, 255, 255, 0.98);
  border-top: 1px solid var(--sg-border, #e5e7eb);
  box-shadow: 0 -2px 10px rgba(15, 23, 42, 0.04);
}

.qb-ws-bottom-left {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.qb-ws-bottom-right {
  font-size: 13px;
  font-weight: 600;
  color: var(--sg-text-secondary);
  font-variant-numeric: tabular-nums;
}

@media (max-width: 960px) {
  .qb-ws-top {
    grid-template-columns: 1fr;
  }
  .qb-ws-top-right {
    justify-content: flex-start;
  }
  .qb-ws-nav {
    width: 160px;
  }
  .qb-ws-nav-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}
</style>
