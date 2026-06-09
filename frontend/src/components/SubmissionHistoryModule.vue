<template>
  <div class="history-module">
    <div class="history-module__head">
      <div>
        <h3 class="history-module__title">{{ title }}</h3>
        <p v-if="currentVersion != null" class="history-module__ver">
          当前版本：<strong>第 {{ currentVersion }} 版</strong>
          <el-tag size="small" type="success" effect="plain" class="live-tag">当前生效</el-tag>
        </p>
      </div>
      <el-button size="small" plain @click="openDialog">查看历史版本</el-button>
    </div>

    <SubmissionHistoryDialog ref="dialogRef" :submission-id="submissionId" />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import SubmissionHistoryDialog from './SubmissionHistoryDialog.vue'

defineProps({
  submissionId: { type: [String, Number], required: true },
  currentVersion: { type: Number, default: null },
  title: { type: String, default: '提交版本' },
})

const dialogRef = ref(null)

function openDialog() {
  dialogRef.value?.open()
}

defineExpose({ open: openDialog })
</script>

<style scoped>
.history-module {
  margin-top: 12px;
  padding: 14px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #f8fafc;
}
.history-module__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.history-module__title {
  margin: 0 0 6px;
  font-size: 15px;
  font-weight: 600;
  color: #0f172a;
}
.history-module__ver {
  margin: 0;
  font-size: 13px;
  color: #64748b;
}
.live-tag {
  margin-left: 8px;
  vertical-align: middle;
}
</style>
