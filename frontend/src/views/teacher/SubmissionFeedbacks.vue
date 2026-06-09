<template>
  <div class="feedback-page">
    <header class="page-head">
      <div>
        <h1>作业反馈</h1>
        <p class="sub">处理学生对批改结果、重交申请等反馈</p>
      </div>
    </header>

    <el-card shadow="never" class="filter-card">
      <el-form :inline="true" @submit.prevent="loadList">
        <el-form-item label="状态">
          <el-select v-model="filters.status" clearable placeholder="全部" style="width: 140px">
            <el-option label="全部" value="all" />
            <el-option v-for="(label, key) in FEEDBACK_STATUS_LABELS" :key="key" :label="label" :value="key" />
          </el-select>
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="filters.feedbackType" clearable placeholder="全部" style="width: 160px">
            <el-option v-for="(label, key) in FEEDBACK_TYPE_LABELS" :key="key" :label="label" :value="key" />
          </el-select>
        </el-form-item>
        <el-form-item label="关键词">
          <el-input v-model="filters.keyword" placeholder="学生姓名/学号" clearable style="width: 180px" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="loadList">查询</el-button>
          <el-button @click="resetFilters">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-table v-loading="loading" :data="rows" stripe border class="data-table">
      <el-table-column prop="student_name" label="学生" min-width="100" />
      <el-table-column prop="student_no" label="学号" width="110" />
      <el-table-column prop="class_name" label="班级" min-width="100" />
      <el-table-column prop="task_title" label="任务" min-width="160" show-overflow-tooltip />
      <el-table-column label="反馈类型" width="130">
        <template #default="{ row }">{{ FEEDBACK_TYPE_LABELS[row.feedback_type] || row.feedback_type }}</template>
      </el-table-column>
      <el-table-column label="内容摘要" min-width="200" show-overflow-tooltip>
        <template #default="{ row }">{{ row.content }}</template>
      </el-table-column>
      <el-table-column label="状态" width="96" align="center">
        <template #default="{ row }">
          <el-tag :type="FEEDBACK_STATUS_TAG[row.status]" size="small">
            {{ FEEDBACK_STATUS_LABELS[row.status] }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="提交时间" width="168">
        <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="100" fixed="right" align="center">
        <template #default="{ row }">
          <el-button type="primary" link @click="openDetail(row)">查看</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pager">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        layout="total, prev, pager, next"
        @current-change="loadList"
      />
    </div>

    <el-drawer v-model="drawerVisible" title="反馈详情" size="480px" destroy-on-close>
      <template v-if="current">
        <dl class="detail-dl">
          <dt>学生</dt><dd>{{ current.student_name }}（{{ current.student_no || '—' }}）</dd>
          <dt>班级</dt><dd>{{ current.class_name || '—' }}</dd>
          <dt>任务</dt><dd>{{ current.task_title }}</dd>
          <dt>类型</dt><dd>{{ FEEDBACK_TYPE_LABELS[current.feedback_type] }}</dd>
          <dt>状态</dt>
          <dd><el-tag :type="FEEDBACK_STATUS_TAG[current.status]" size="small">{{ FEEDBACK_STATUS_LABELS[current.status] }}</el-tag></dd>
          <dt>反馈内容</dt><dd class="pre">{{ current.content }}</dd>
          <dt v-if="current.reply_content">教师回复</dt>
          <dd v-if="current.reply_content" class="pre">{{ current.reply_content }}</dd>
        </dl>

        <div v-if="current.status === 'pending'" class="action-block">
          <h4>回复</h4>
          <el-input v-model="replyText" type="textarea" :rows="3" placeholder="填写回复内容" />
          <el-button type="primary" class="mt8" :loading="acting" @click="doReply">发送回复</el-button>

          <h4 class="mt16">退回重交</h4>
          <el-input v-model="returnForm.reason" type="textarea" :rows="2" placeholder="退回原因（必填）" />
          <el-form-item label="额外次数" class="inline-item">
            <el-input-number v-model="returnForm.extraAttempts" :min="1" :max="5" />
          </el-form-item>
          <el-date-picker
            v-model="returnForm.expireAt"
            type="datetime"
            placeholder="重交截止时间（可选）"
            value-format="YYYY-MM-DD HH:mm:ss"
            style="width: 100%"
          />
          <el-button type="warning" class="mt8" :loading="acting" @click="doReturn">确认退回重交</el-button>

          <h4 class="mt16">驳回</h4>
          <el-input v-model="rejectText" type="textarea" :rows="2" placeholder="驳回原因" />
          <el-button type="danger" plain class="mt8" :loading="acting" @click="doReject">驳回反馈</el-button>
        </div>

        <el-button v-if="current.status !== 'closed'" class="mt16" @click="doClose">关闭反馈</el-button>
        <el-button
          v-if="current.submission_id"
          type="primary"
          plain
          class="mt16"
          @click="openSubmissionHistory"
        >
          查看历史版本
        </el-button>
      </template>
    </el-drawer>
    <SubmissionHistoryDialog
      ref="historyDialogRef"
      :submission-id="current?.submission_id || 0"
    />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  listTeacherFeedbacks,
  getTeacherFeedback,
  replyTeacherFeedback,
  returnTeacherFeedback,
  rejectTeacherFeedback,
  closeTeacherFeedback,
  FEEDBACK_TYPE_LABELS,
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_STATUS_TAG,
} from '../../api/submissionFeedback'
import SubmissionHistoryDialog from '../../components/SubmissionHistoryDialog.vue'
import { formatDateTime } from '../../utils/format'

const route = useRoute()
const loading = ref(false)
const historyDialogRef = ref(null)
const rows = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const filters = reactive({ status: 'all', feedbackType: '', keyword: '' })

const drawerVisible = ref(false)
const current = ref(null)
const acting = ref(false)
const replyText = ref('')
const rejectText = ref('')
const returnForm = reactive({ reason: '', extraAttempts: 1, expireAt: null })

async function loadList() {
  loading.value = true
  try {
    const res = await listTeacherFeedbacks({
      page: page.value,
      pageSize: pageSize.value,
      status: filters.status === 'all' ? undefined : filters.status,
      feedbackType: filters.feedbackType || undefined,
      keyword: filters.keyword || undefined,
    })
    if (res.success) {
      rows.value = res.data?.rows || []
      total.value = res.data?.total || 0
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

function resetFilters() {
  filters.status = 'all'
  filters.feedbackType = ''
  filters.keyword = ''
  page.value = 1
  void loadList()
}

async function openDetail(row) {
  try {
    const res = await getTeacherFeedback(row.id)
    if (res.success) {
      current.value = res.data
      replyText.value = ''
      rejectText.value = ''
      returnForm.reason = ''
      returnForm.extraAttempts = 1
      returnForm.expireAt = null
      drawerVisible.value = true
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '加载详情失败')
  }
}

async function doReply() {
  if (!replyText.value.trim()) {
    ElMessage.warning('请填写回复内容')
    return
  }
  acting.value = true
  try {
    const res = await replyTeacherFeedback(current.value.id, replyText.value.trim())
    if (res.success) {
      ElMessage.success('已回复')
      current.value = res.data
      await loadList()
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '回复失败')
  } finally {
    acting.value = false
  }
}

async function doReturn() {
  if (!returnForm.reason.trim()) {
    ElMessage.warning('请填写退回原因')
    return
  }
  try {
    await ElMessageBox.confirm('确认退回该作业并授权学生重新提交？', '退回重交', { type: 'warning' })
  } catch {
    return
  }
  acting.value = true
  try {
    const res = await returnTeacherFeedback(current.value.id, {
      reason: returnForm.reason.trim(),
      extraAttempts: returnForm.extraAttempts,
      expireAt: returnForm.expireAt || undefined,
      keepHistory: true,
    })
    if (res.success) {
      ElMessage.success('已退回并授权重交')
      current.value = res.data
      await loadList()
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '操作失败')
  } finally {
    acting.value = false
  }
}

async function doReject() {
  if (!rejectText.value.trim()) {
    ElMessage.warning('请填写驳回原因')
    return
  }
  acting.value = true
  try {
    const res = await rejectTeacherFeedback(current.value.id, rejectText.value.trim())
    if (res.success) {
      ElMessage.success('已驳回')
      current.value = res.data
      await loadList()
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '驳回失败')
  } finally {
    acting.value = false
  }
}

async function doClose() {
  acting.value = true
  try {
    const res = await closeTeacherFeedback(current.value.id)
    if (res.success) {
      ElMessage.success('已关闭')
      current.value = res.data
      await loadList()
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '关闭失败')
  } finally {
    acting.value = false
  }
}

function openSubmissionHistory() {
  historyDialogRef.value?.open()
}

onMounted(async () => {
  await loadList()
  const qid = route.query.id
  if (qid) {
    try {
      const res = await getTeacherFeedback(qid)
      if (res.success) {
        current.value = res.data
        drawerVisible.value = true
      }
    } catch {
      /* ignore */
    }
  }
})
</script>

<style scoped>
.feedback-page {
  max-width: 1280px;
  margin: 0 auto;
  padding: 20px 24px 32px;
}
.page-head h1 {
  margin: 0 0 4px;
  font-size: 22px;
}
.sub {
  margin: 0;
  color: #64748b;
  font-size: 14px;
}
.filter-card {
  margin: 16px 0;
}
.data-table {
  width: 100%;
}
.pager {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
.detail-dl {
  display: grid;
  grid-template-columns: 88px 1fr;
  gap: 8px 12px;
  font-size: 14px;
}
.detail-dl dt {
  color: #64748b;
}
.detail-dl .pre {
  white-space: pre-wrap;
  line-height: 1.6;
  margin: 0;
}
.action-block h4 {
  margin: 0 0 8px;
  font-size: 14px;
}
.mt8 { margin-top: 8px; }
.mt16 { margin-top: 16px; }
.inline-item { margin-top: 8px; }
</style>
