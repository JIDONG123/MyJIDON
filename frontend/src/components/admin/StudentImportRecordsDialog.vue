<template>
  <el-dialog v-model="visible" title="导入记录" width="960px" destroy-on-close @open="loadBatches">
    <div class="records-toolbar">
      <el-select v-model="statusFilter" placeholder="批次状态" clearable style="width: 140px" @change="reload">
        <el-option label="已预检" value="previewed" />
        <el-option label="导入中" value="importing" />
        <el-option label="已完成" value="completed" />
        <el-option label="失败" value="failed" />
        <el-option label="已取消" value="cancelled" />
      </el-select>
      <el-button plain @click="reload">刷新</el-button>
    </div>

    <el-skeleton v-if="loading" animated :rows="6" />

    <template v-else>
      <el-table :data="batches" border size="small" max-height="420">
        <el-table-column prop="batch_no" label="批次号" min-width="140" show-overflow-tooltip />
        <el-table-column prop="file_name" label="文件名" min-width="160" show-overflow-tooltip />
        <el-table-column prop="uploader_name" label="上传人" width="100" show-overflow-tooltip />
        <el-table-column prop="total_rows" label="总行数" width="80" align="center" />
        <el-table-column prop="valid_rows" label="可导入" width="80" align="center" />
        <el-table-column prop="imported_rows" label="成功" width="72" align="center" />
        <el-table-column prop="failed_rows" label="失败" width="72" align="center" />
        <el-table-column label="状态" width="96" align="center">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" size="small" effect="plain">
              {{ statusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="上传时间" width="168">
          <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="160" align="right" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row)">查看详情</el-button>
            <el-button link type="primary" @click="downloadResult(row.id)">下载结果</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pager-wrap">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          background
          small
          @current-change="loadBatches"
          @size-change="onSizeChange"
        />
      </div>
    </template>

    <el-drawer v-model="detailVisible" title="导入批次详情" size="720px" destroy-on-close>
      <template v-if="detail">
        <dl class="batch-meta">
          <div><dt>批次号</dt><dd>{{ detail.batch.batch_no }}</dd></div>
          <div><dt>文件名</dt><dd>{{ detail.batch.file_name }}</dd></div>
          <div><dt>上传人</dt><dd>{{ detail.batch.uploader_name || '—' }}</dd></div>
          <div><dt>状态</dt><dd>{{ statusLabel(detail.batch.status) }}</dd></div>
          <div><dt>总行数</dt><dd>{{ detail.batch.total_rows }}</dd></div>
          <div><dt>成功 / 失败</dt><dd>{{ detail.batch.imported_rows }} / {{ detail.batch.failed_rows }}</dd></div>
        </dl>

        <el-table :data="detail.rows" border size="small" max-height="520">
          <el-table-column prop="row_number" label="行号" width="64" align="center" />
          <el-table-column prop="username" label="用户名" min-width="100" show-overflow-tooltip />
          <el-table-column prop="real_name" label="姓名" min-width="90" show-overflow-tooltip />
          <el-table-column prop="student_no" label="学号" min-width="100" show-overflow-tooltip />
          <el-table-column prop="phone" label="电话" min-width="120" show-overflow-tooltip />
          <el-table-column prop="email" label="邮箱" min-width="150" show-overflow-tooltip />
          <el-table-column prop="class_name" label="班级" min-width="110" show-overflow-tooltip />
          <el-table-column label="状态" width="88" align="center">
            <template #default="{ row }">
              <el-tag size="small" effect="plain">{{ row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="错误原因" min-width="160" show-overflow-tooltip>
            <template #default="{ row }">
              {{ (row.errors || []).join('；') || '—' }}
            </template>
          </el-table-column>
          <el-table-column prop="created_user_id" label="用户ID" width="88" align="center" />
        </el-table>
      </template>
      <el-skeleton v-else animated :rows="8" />
    </el-drawer>
  </el-dialog>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import {
  listStudentImportBatches,
  getStudentImportBatchDetail,
  downloadStudentImportResult,
} from '../../api/studentImport'
import { formatDateTime } from '../../utils/format'
import { triggerBlobDownload } from '../../utils/downloadBlob'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const loading = ref(false)
const batches = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const statusFilter = ref('')
const detailVisible = ref(false)
const detail = ref(null)

const statusLabel = (s) => {
  const map = {
    previewed: '已预检',
    importing: '导入中',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消',
  }
  return map[s] || s || '—'
}

const statusTagType = (s) => {
  if (s === 'completed') return 'success'
  if (s === 'failed') return 'danger'
  if (s === 'importing') return 'warning'
  return 'info'
}

const loadBatches = async () => {
  loading.value = true
  try {
    const res = await listStudentImportBatches({
      page: page.value,
      pageSize: pageSize.value,
      status: statusFilter.value || undefined,
    })
    if (res.success) {
      batches.value = res.data || []
      total.value = res.total ?? 0
    }
  } catch (e) {
    ElMessage.error('加载导入记录失败')
  } finally {
    loading.value = false
  }
}

const reload = () => {
  page.value = 1
  loadBatches()
}

const onSizeChange = () => {
  page.value = 1
  loadBatches()
}

const openDetail = async (row) => {
  detailVisible.value = true
  detail.value = null
  try {
    const res = await getStudentImportBatchDetail(row.id)
    if (res.success) detail.value = res.data
  } catch (e) {
    ElMessage.error('加载详情失败')
    detailVisible.value = false
  }
}

const downloadResult = async (batchId) => {
  try {
    const blob = await downloadStudentImportResult(batchId)
    await triggerBlobDownload(blob, `student-import-result-${batchId}.xlsx`, '下载失败')
  } catch (e) {
    ElMessage.error(e.message || '下载失败')
  }
}
</script>

<style scoped>
.records-toolbar {
  display: flex;
  gap: 10px;
  margin-bottom: 14px;
}

.pager-wrap {
  margin-top: 14px;
  display: flex;
  justify-content: flex-end;
}

.batch-meta {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px 20px;
  margin: 0 0 16px;
  padding: 14px;
  background: #f8fafc;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}

.batch-meta div {
  display: flex;
  gap: 8px;
  font-size: 13px;
}

.batch-meta dt {
  color: #64748b;
  flex-shrink: 0;
}

.batch-meta dd {
  margin: 0;
  color: #1e293b;
  word-break: break-all;
}
</style>
