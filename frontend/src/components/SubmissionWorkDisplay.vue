<template>
  <el-card class="submission-work-card" shadow="never">
    <template #header>
      <div class="card-head">
        <span class="card-title">学生提交内容</span>
        <span class="card-sub">作业正文仅展示学生在「文字说明」中填写的内容；附件解析全文用于 AI 批改，请通过下方附件预览或下载查看源文件。</span>
      </div>
    </template>

    <section class="block">
      <h4 class="block-title">文字说明</h4>
      <div v-if="hasText" class="body-wrap">
        <div class="body-scroll" :class="{ 'body-scroll--collapsed': collapseLongText && !bodyExpanded }">
          <pre class="body-pre">{{ text }}</pre>
        </div>
        <button
          v-if="collapseLongText && isLongText"
          type="button"
          class="expand-btn"
          @click="bodyExpanded = !bodyExpanded"
        >
          {{ bodyExpanded ? '收起' : '展开全文' }}
        </button>
      </div>
      <p v-else class="muted">（未填写文字说明）</p>
    </section>

    <section v-if="hasCode" class="block">
      <h4 class="block-title">代码内容{{ codeLanguage ? `（${codeLanguage}）` : '' }}</h4>
      <pre class="body-pre code-pre">{{ codeContent }}</pre>
    </section>

    <section v-if="displayAttachments.length" class="block block--file">
      <h4 class="block-title">上传附件（{{ displayAttachments.length }}）</h4>
      <ul class="file-list">
        <li v-for="(att, idx) in displayAttachments" :key="att.id || att.fileUrl || idx" class="file-row">
          <div class="file-info">
            <span class="fname">{{ att.originalName || att.fileName || '附件' }}</span>
            <span v-if="att.fileSize || att.mimeType" class="mime-hint">
              {{ formatSize(att.fileSize) }}
              <template v-if="att.mimeType || att.fileExt"> · {{ att.fileExt || att.mimeType }}</template>
            </span>
          </div>
          <div class="file-actions">
            <a
              v-if="att.fileUrl"
              class="el-button el-button--primary is-link"
              :href="att.fileUrl"
              target="_blank"
              rel="noopener noreferrer"
            >在线打开</a>
            <a
              v-if="att.fileUrl"
              class="el-button el-button--primary is-link"
              :href="att.fileUrl"
              :download="att.originalName || att.fileName || 'attachment'"
              rel="noopener noreferrer"
            >下载</a>
          </div>
        </li>
      </ul>
    </section>
    <section v-else-if="fileUrl || hasFileName" class="block block--file">
      <h4 class="block-title">上传附件</h4>
      <div class="file-actions">
        <span class="fname">{{ displayName }}</span>
        <template v-if="fileUrl">
          <a class="el-button el-button--primary is-link" :href="fileUrl" target="_blank" rel="noopener noreferrer">在线打开</a>
          <a class="el-button el-button--primary is-link" :href="fileUrl" :download="downloadName" rel="noopener noreferrer">下载</a>
        </template>
        <span v-else class="muted">（缺少可访问链接）</span>
      </div>
      <p v-if="fileType" class="mime-hint">类型：{{ fileType }}</p>
    </section>
    <p v-else class="muted block">（未上传附件）</p>
  </el-card>
</template>

<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  text: { type: String, default: '' },
  codeContent: { type: String, default: '' },
  codeLanguage: { type: String, default: '' },
  attachments: { type: Array, default: () => [] },
  fileName: { type: String, default: '' },
  fileUrl: { type: String, default: '' },
  fileType: { type: String, default: '' },
  collapseLongText: { type: Boolean, default: false },
})

const bodyExpanded = ref(false)
const hasText = computed(() => String(props.text || '').trim().length > 0)
const hasCode = computed(() => String(props.codeContent || '').trim().length > 0)
const isLongText = computed(() => String(props.text || '').length > 480)
const hasFileName = computed(() => String(props.fileName || '').trim().length > 0)
const displayName = computed(() => props.fileName || '附件')
const downloadName = computed(() => props.fileName || 'submission')

const displayAttachments = computed(() => {
  if (props.attachments?.length) return props.attachments
  if (props.fileUrl || props.fileName) {
    return [{ originalName: props.fileName, fileName: props.fileName, fileUrl: props.fileUrl, mimeType: props.fileType }]
  }
  return []
})

function formatSize(bytes) {
  if (bytes == null) return ''
  const n = Number(bytes)
  if (!Number.isFinite(n)) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
</script>

<style scoped>
.submission-work-card {
  border-radius: 12px;
  border: 1px solid var(--sg-border, #e8eef5);
}
.card-head {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.card-title {
  font-weight: 600;
  font-size: 15px;
  color: var(--sg-text, #0b3d6d);
}
.card-sub {
  font-size: 12px;
  color: var(--sg-text-secondary, #64748b);
  line-height: 1.5;
}
.block {
  margin-bottom: 16px;
}
.block:last-child {
  margin-bottom: 0;
}
.block-title {
  margin: 0 0 8px;
  font-size: 13px;
  color: #334155;
  font-weight: 600;
}
.body-scroll {
  max-height: min(75vh, 1200px);
  overflow: auto;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #f8fafc;
}
.body-scroll--collapsed {
  max-height: 200px;
  overflow: hidden;
}
.expand-btn {
  margin-top: 8px;
  padding: 0;
  border: none;
  background: none;
  color: #1d5fd6;
  font-size: 13px;
  cursor: pointer;
}
.expand-btn:hover {
  text-decoration: underline;
}
.body-pre {
  margin: 0;
  padding: 12px 14px;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, 'Cascadia Mono', 'Segoe UI Mono', Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.55;
  color: #1e293b;
}
.code-pre {
  max-height: 360px;
  overflow: auto;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #f8fafc;
}
.muted {
  margin: 0;
  font-size: 13px;
  color: #94a3b8;
}
.file-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.file-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid #f1f5f9;
}
.file-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}
.fname {
  font-size: 13px;
  color: #334155;
  word-break: break-all;
  max-width: 100%;
}
.mime-hint {
  display: block;
  margin: 4px 0 0;
  font-size: 12px;
  color: #94a3b8;
}
a.el-button.is-link {
  text-decoration: none;
}
</style>
