<template>
  <div
    class="code-editor"
    :class="{
      'code-editor--compact': !showChrome,
      'code-editor--fill': fillHeight,
    }"
  >
    <div v-if="label && !showChrome" class="code-editor__label">{{ label }}</div>

    <div v-if="showChrome" class="code-editor__chrome">
      <div class="code-editor__tabs">
        <div class="code-editor__tab code-editor__tab--active">
          <span class="code-editor__tab-icon">●</span>
          <span class="code-editor__tab-name">{{ displayFileName }}</span>
        </div>
      </div>
      <div ref="mountEl" class="code-editor__surface" :style="surfaceStyle" />
      <div class="code-editor__statusbar">
        <span>{{ languageLabel }}</span>
        <span class="code-editor__statusbar-sep">|</span>
        <span>{{ displayFileName }}</span>
        <span class="code-editor__statusbar-spacer" />
        <span>Ln {{ cursorLine }}, Col {{ cursorCol }}</span>
      </div>
    </div>

    <div v-else ref="mountEl" class="code-editor__surface code-editor__surface--plain" :style="surfaceStyle" />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import '../../utils/monacoSetup.js'
import * as monaco from 'monaco-editor'
import { langLabel, monacoLanguage, defaultEntryFile } from '../../utils/codeRunLanguages'

const props = defineProps({
  modelValue: { type: String, default: '' },
  language: { type: String, default: 'python' },
  entryFile: { type: String, default: '' },
  readonly: { type: Boolean, default: false },
  label: { type: String, default: '' },
  minHeight: { type: Number, default: 520 },
  showChrome: { type: Boolean, default: true },
  fillHeight: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

const mountEl = ref(null)
const cursorLine = ref(1)
const cursorCol = ref(1)

let editor = null
let resizeObserver = null

const languageLabel = computed(() => langLabel(props.language))
const displayFileName = computed(() => props.entryFile || defaultEntryFile(props.language))
const surfaceStyle = computed(() => {
  if (props.fillHeight) {
    return { flex: '1 1 auto', minHeight: `${props.minHeight}px` }
  }
  return { minHeight: `${props.minHeight}px` }
})

const syncCursor = () => {
  if (!editor) return
  const pos = editor.getPosition()
  if (!pos) return
  cursorLine.value = pos.lineNumber
  cursorCol.value = pos.column
}

const initEditor = async () => {
  await nextTick()
  if (!mountEl.value || editor) return

  editor = monaco.editor.create(mountEl.value, {
    value: props.modelValue || '',
    language: monacoLanguage(props.language),
    theme: 'vs-dark',
    readOnly: props.readonly,
    automaticLayout: true,
    fontSize: 14,
    lineHeight: 22,
    fontFamily: "ui-monospace, 'Cascadia Code', 'Consolas', 'Menlo', monospace",
    tabSize: 4,
    insertSpaces: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    renderLineHighlight: 'line',
    bracketPairColorization: { enabled: true },
    matchBrackets: 'always',
    padding: { top: 10, bottom: 10 },
    lineDecorationsWidth: 8,
    lineNumbersMinChars: 3,
    scrollbar: {
      verticalScrollbarSize: 10,
      horizontalScrollbarSize: 10,
    },
    overviewRulerLanes: 0,
    hideCursorInOverviewRuler: true,
    overviewRulerBorder: false,
  })

  editor.onDidChangeModelContent(() => {
    emit('update:modelValue', editor.getValue())
  })
  editor.onDidChangeCursorPosition(syncCursor)
  syncCursor()

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => editor?.layout())
    resizeObserver.observe(mountEl.value)
  }
}

watch(
  () => props.modelValue,
  (val) => {
    if (!editor) return
    const current = editor.getValue()
    if (val !== current) editor.setValue(val ?? '')
  }
)

watch(
  () => props.language,
  (lang) => {
    if (!editor) return
    const model = editor.getModel()
    if (model) monaco.editor.setModelLanguage(model, monacoLanguage(lang))
  }
)

watch(
  () => props.readonly,
  (ro) => {
    editor?.updateOptions({ readOnly: ro })
  }
)

onMounted(initEditor)

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  editor?.dispose()
  editor = null
})
</script>

<style scoped>
.code-editor {
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  overflow: hidden;
  background: #1e1e1e;
  border: 1px solid #2d2d2d;
  box-sizing: border-box;
}

.code-editor--fill {
  flex: 1;
  height: 100%;
  min-height: 0;
}

.code-editor--fill .code-editor__chrome {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.code-editor--fill .code-editor__surface {
  flex: 1;
  min-height: 0;
}

.code-editor--compact {
  border: none;
  border-radius: 8px;
}

.code-editor__label {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--sg-text);
}

.code-editor__chrome {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.code-editor__tabs {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  padding: 8px 12px 0;
  background: #252526;
  border-bottom: 1px solid #1e1e1e;
  flex-shrink: 0;
}

.code-editor__tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 12px;
  color: #969696;
  background: #2d2d2d;
  border: 1px solid #252526;
  border-bottom: none;
  border-radius: 6px 6px 0 0;
}

.code-editor__tab--active {
  color: #ffffff;
  background: #1e1e1e;
  border-color: #1e1e1e;
}

.code-editor__tab-icon {
  font-size: 8px;
  color: #569cd6;
}

.code-editor__tab-name {
  font-family: ui-monospace, Consolas, monospace;
}

.code-editor__surface {
  flex: 1;
  min-height: 520px;
}

.code-editor__surface--plain {
  border-radius: 8px;
}

.code-editor__statusbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 16px;
  font-size: 11px;
  color: #cccccc;
  background: #007acc;
  font-family: ui-monospace, Consolas, monospace;
  flex-shrink: 0;
  box-sizing: border-box;
}

.code-editor__statusbar-sep {
  opacity: 0.6;
}

.code-editor__statusbar-spacer {
  flex: 1;
}
</style>
