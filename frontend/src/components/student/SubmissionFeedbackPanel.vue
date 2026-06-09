<template>
  <section class="feedback-panel panel-card">
    <div class="feedback-head">
      <h2 class="panel-title">反馈与重交</h2>
      <el-button
        v-if="canCreate"
        type="primary"
        size="small"
        plain
        round
        @click="openDialog"
      >
        反馈 / 申请重交
      </el-button>
    </div>

    <div v-if="!latest" class="feedback-empty">
      <p>对本次批改结果有疑问，或需要重新提交，可向教师发起反馈。</p>
    </div>

    <div v-else class="feedback-body">
      <div class="feedback-status-row">
        <el-tag :type="statusTag(latest.status)" size="small">{{ statusLabel(latest.status) }}</el-tag>
        <span class="feedback-time">{{ formatDateTime(latest.created_at) }}</span>
      </div>
      <p class="feedback-type">{{ typeLabel(latest.feedback_type) }}</p>
      <p class="feedback-content">{{ latest.content }}</p>

      <div v-if="latest.status === 'pending'" class="feedback-hint">
        你的反馈已提交，等待教师处理。
      </div>

      <div v-if="latest.reply_content && ['replied', 'returned', 'rejected'].includes(latest.status)" class="feedback-reply">
        <strong>教师回复：</strong>{{ latest.reply_content }}
      </div>

      <div v-if="latest.status === 'returned'" class="feedback-return">
        <p>教师已退回本次作业，你可以重新提交。</p>
        <p v-if="resubmitExpireAt" class="expire">重交截止：{{ formatDateTime(resubmitExpireAt) }}</p>
        <el-button type="primary" size="small" @click="goResubmit">去重新提交</el-button>
      </div>

      <div v-if="latest.status === 'rejected'" class="feedback-reject">
        <p>{{ latest.reject_reason || latest.reply_content || '反馈已被驳回' }}</p>
      </div>
    </div>

    <el-dialog v-model="dialogVisible" title="反馈 / 申请重交" width="520px" destroy-on-close>
      <el-form label-width="96px">
        <el-form-item label="反馈类型" required>
          <el-select v-model="form.feedbackType" style="width: 100%">
            <el-option
              v-for="(label, key) in FEEDBACK_TYPE_LABELS"
              :key="key"
              :label="label"
              :value="key"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="反馈内容" required>
          <el-input v-model="form.content" type="textarea" :rows="5" maxlength="2000" show-word-limit />
        </el-form-item>
        <el-form-item label="申请重交">
          <el-switch v-model="form.wantsResubmit" />
        </el-form-item>
        <el-form-item label="联系说明">
          <el-input v-model="form.contactNote" maxlength="200" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitFeedback">提交反馈</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  createSubmissionFeedback,
  getMyFeedbacks,
  FEEDBACK_TYPE_LABELS,
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_STATUS_TAG,
} from '../../api/submissionFeedback'
import { formatDateTime } from '../../utils/format'

const props = defineProps({
  submissionId: { type: [String, Number], required: true },
  taskId: { type: [String, Number], default: null },
  resubmitExpireAt: { type: String, default: null },
})

const emit = defineEmits(['updated'])
const router = useRouter()

const latest = ref(null)
const dialogVisible = ref(false)
const submitting = ref(false)
const form = ref({
  feedbackType: 'score_question',
  content: '',
  wantsResubmit: false,
  contactNote: '',
})

const canCreate = computed(() => !latest.value || latest.value.status !== 'pending')

function typeLabel(t) {
  return FEEDBACK_TYPE_LABELS[t] || t
}
function statusLabel(s) {
  return FEEDBACK_STATUS_LABELS[s] || s
}
function statusTag(s) {
  return FEEDBACK_STATUS_TAG[s] || 'info'
}

async function loadFeedbacks() {
  if (!props.submissionId) return
  try {
    const res = await getMyFeedbacks({ submissionId: props.submissionId })
    if (res.success) {
      latest.value = (res.data || [])[0] || null
    }
  } catch {
    latest.value = null
  }
}

function openDialog() {
  if (!canCreate.value) {
    ElMessage.info('该提交已有待处理反馈，请等待教师处理后再提交')
    return
  }
  form.value = {
    feedbackType: 'score_question',
    content: '',
    wantsResubmit: false,
    contactNote: '',
  }
  dialogVisible.value = true
}

async function submitFeedback() {
  if (!String(form.value.content || '').trim()) {
    ElMessage.warning('请填写反馈内容')
    return
  }
  submitting.value = true
  try {
    const res = await createSubmissionFeedback({
      submissionId: Number(props.submissionId),
      feedbackType: form.value.feedbackType,
      content: form.value.content,
      wantsResubmit: form.value.wantsResubmit,
      contactNote: form.value.contactNote || undefined,
    })
    if (res.success) {
      ElMessage.success('反馈已提交')
      dialogVisible.value = false
      await loadFeedbacks()
      emit('updated')
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || e?.message || '提交失败')
  } finally {
    submitting.value = false
  }
}

function goResubmit() {
  if (props.taskId) {
    router.push(`/student/tasks/${props.taskId}`)
  }
}

watch(
  () => props.submissionId,
  () => {
    void loadFeedbacks()
  },
  { immediate: true }
)

defineExpose({ reload: loadFeedbacks, openDialog, canCreate })
</script>

<style scoped>
.feedback-panel {
  margin-top: 16px;
}
.feedback-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.feedback-empty {
  color: #64748b;
  font-size: 14px;
  line-height: 1.6;
}
.feedback-status-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.feedback-time {
  color: #94a3b8;
  font-size: 12px;
}
.feedback-type {
  font-size: 13px;
  color: #475569;
  margin: 0 0 6px;
}
.feedback-content {
  margin: 0 0 10px;
  line-height: 1.6;
  white-space: pre-wrap;
}
.feedback-hint,
.feedback-return,
.feedback-reject {
  padding: 10px 12px;
  border-radius: 8px;
  background: #f8fafc;
  font-size: 13px;
  margin-top: 8px;
}
.feedback-reply {
  margin-top: 8px;
  padding: 10px 12px;
  background: #f0fdf4;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.6;
}
.expire {
  color: #b45309;
  margin: 6px 0;
}
</style>
