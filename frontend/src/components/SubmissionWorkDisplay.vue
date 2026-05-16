<template>
  <el-card class="submission-work-card" shadow="never">
    <template #header>
      <div class="card-head">
        <span class="card-title">学生提交内容</span>
        <span class="card-sub">作业正文仅展示学生在「文字说明」中填写的内容；附件解析全文用于 AI 批改，请通过下方附件预览或下载查看源文件。</span>
      </div>
    </template>

    <section class="block">
      <h4 class="block-title">作业正文</h4>
      <div v-if="hasText" class="body-scroll">
        <pre class="body-pre">{{ text }}</pre>
      </div>
      <p v-else class="muted">（未填写文字说明；若已上传附件，请查看下方「上传附件」在线打开或下载）</p>
    </section>

    <section v-if="fileUrl || hasFileName" class="block block--file">
      <h4 class="block-title">上传附件</h4>
      <div class="file-actions">
        <span class="fname">{{ displayName }}</span>
        <template v-if="fileUrl">
          <a class="el-button el-button--primary is-link" :href="fileUrl" target="_blank" rel="noopener noreferrer">在线打开 / 预览</a>
          <a class="el-button el-button--primary is-link" :href="fileUrl" :download="downloadName" rel="noopener noreferrer"> 下载保存 </a>
        </template>
        <span v-else class="muted">（已有文件名但缺少可访问链接，请检查服务端 uploads 配置或重新提交）</span>
      </div>
      <p v-if="fileType" class="mime-hint">类型：{{ fileType }}</p>
    </section>
  </el-card>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  text: { type: String, default: '' },
  fileName: { type: String, default: '' },
  fileUrl: { type: String, default: '' },
  fileType: { type: String, default: '' },
})

const hasText = computed(() => String(props.text || '').trim().length > 0)
const hasFileName = computed(() => String(props.fileName || '').trim().length > 0)
const displayName = computed(() => props.fileName || '附件')
const downloadName = computed(() => props.fileName || 'submission')
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
.muted {
  margin: 0;
  font-size: 13px;
  color: #94a3b8;
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
  margin: 8px 0 0;
  font-size: 12px;
  color: #94a3b8;
}
a.el-button.is-link {
  text-decoration: none;
}
</style>
