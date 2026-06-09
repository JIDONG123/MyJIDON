<template>
  <div class="tw-page content-safety-page">
    <header class="page-head">
      <div>
        <h1 class="page-title">内容安全审核</h1>
        <p class="page-desc">查看待复核内容，人工通过或驳回后写入审计日志。</p>
      </div>
    </header>

    <div class="filter-bar">
      <el-select v-model="filters.status" placeholder="状态" clearable style="width: 140px" @change="load">
        <el-option label="待复核" value="pending_review" />
        <el-option label="已通过" value="manual_approved" />
        <el-option label="已驳回" value="manual_rejected" />
        <el-option label="已拦截" value="rejected" />
      </el-select>
      <el-select v-model="filters.targetType" placeholder="入口" clearable style="width: 160px" @change="load">
        <el-option label="学生提交" value="submission" />
        <el-option label="知识库" value="kb_document" />
        <el-option label="头像" value="avatar" />
        <el-option label="Excel 导入" value="student_import" />
        <el-option label="AI 助手" value="assistant" />
      </el-select>
      <el-input
        v-model="filters.q"
        placeholder="搜索上传人 / 文件名"
        clearable
        style="width: 220px"
        @keyup.enter="load"
      />
      <el-button type="primary" @click="load">查询</el-button>
    </div>

    <el-table v-loading="loading" :data="rows" stripe border>
      <el-table-column prop="id" label="ID" width="72" />
      <el-table-column label="入口" width="110">
        <template #default="{ row }">{{ targetLabel(row.target_type) }}</template>
      </el-table-column>
      <el-table-column label="上传人" min-width="120">
        <template #default="{ row }">{{ row.real_name || row.username || '—' }}</template>
      </el-table-column>
      <el-table-column prop="file_name" label="文件/摘要" min-width="160" show-overflow-tooltip />
      <el-table-column label="风险等级" width="100">
        <template #default="{ row }">
          <el-tag size="small" :type="riskTag(row.risk_level)">{{ row.risk_level || '—' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="reason" label="检测原因" min-width="180" show-overflow-tooltip />
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag size="small" :type="statusTag(row.status)">{{ statusLabel(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="时间" width="168">
        <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button
            v-if="row.status === 'pending_review'"
            link
            type="success"
            @click="openReview(row, 'approve')"
          >
            通过
          </el-button>
          <el-button
            v-if="row.status === 'pending_review'"
            link
            type="danger"
            @click="openReview(row, 'reject')"
          >
            驳回
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pager">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        layout="total, prev, pager, next"
        @current-change="load"
      />
    </div>

    <el-dialog v-model="dialogVisible" :title="dialogAction === 'approve' ? '通过审核' : '驳回'" width="480px">
      <p v-if="activeRow" class="dialog-meta">
        {{ targetLabel(activeRow.target_type) }} · {{ activeRow.file_name || activeRow.reason || '—' }}
      </p>
      <el-input
        v-model="reviewNote"
        type="textarea"
        :rows="4"
        placeholder="请填写审核意见（必填）"
      />
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitReview">确认</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { formatDateTime } from '../../utils/format'
import {
  listContentSafetyReviews,
  approveContentSafetyReview,
  rejectContentSafetyReview,
} from '../../api/contentSafety'

const loading = ref(false)
const rows = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const filters = reactive({ status: 'pending_review', targetType: '', q: '' })

const dialogVisible = ref(false)
const dialogAction = ref('approve')
const activeRow = ref(null)
const reviewNote = ref('')
const submitting = ref(false)

function targetLabel(t) {
  const map = {
    submission: '学生提交',
    kb_document: '知识库',
    avatar: '头像',
    student_import: 'Excel 导入',
    teacher_import: 'Excel 导入',
    assistant: 'AI 助手',
    account: '账号',
  }
  return map[t] || t || '—'
}

function riskTag(level) {
  if (level === 'blocked') return 'danger'
  if (level === 'suspicious') return 'warning'
  return 'success'
}

function statusLabel(s) {
  const map = {
    pending_review: '待复核',
    manual_approved: '已通过',
    manual_rejected: '已驳回',
    rejected: '已拦截',
    passed: '已通过',
  }
  return map[s] || s || '—'
}

function statusTag(s) {
  if (s === 'pending_review') return 'warning'
  if (s === 'manual_rejected' || s === 'rejected') return 'danger'
  return 'success'
}

async function load() {
  loading.value = true
  try {
    const res = await listContentSafetyReviews({
      page: page.value,
      pageSize: pageSize.value,
      status: filters.status || undefined,
      targetType: filters.targetType || undefined,
      q: filters.q || undefined,
    })
    if (res.success) {
      rows.value = res.data || []
      total.value = res.total || 0
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

function openReview(row, action) {
  activeRow.value = row
  dialogAction.value = action
  reviewNote.value = ''
  dialogVisible.value = true
}

async function submitReview() {
  if (!reviewNote.value.trim()) {
    ElMessage.warning('请填写审核意见')
    return
  }
  submitting.value = true
  try {
    const fn =
      dialogAction.value === 'approve'
        ? approveContentSafetyReview
        : rejectContentSafetyReview
    const res = await fn(activeRow.value.id, reviewNote.value.trim())
    if (res.success) {
      ElMessage.success(res.message || '操作成功')
      dialogVisible.value = false
      load()
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '操作失败')
  } finally {
    submitting.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.content-safety-page {
  padding: 20px 24px;
}
.page-head {
  margin-bottom: 16px;
}
.page-title {
  margin: 0 0 4px;
  font-size: 20px;
}
.page-desc {
  margin: 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 16px;
}
.pager {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
.dialog-meta {
  margin: 0 0 12px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
</style>
