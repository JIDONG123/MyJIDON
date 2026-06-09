<template>
  <el-dialog
    v-model="visible"
    title="批量导入学生账号"
    width="920px"
    destroy-on-close
    class="import-dialog"
    @closed="resetState"
  >
    <el-steps :active="step" finish-status="success" align-center class="import-steps">
      <el-step title="下载模板" />
      <el-step title="上传 Excel" />
      <el-step title="预检结果" />
      <el-step title="导入完成" />
    </el-steps>

    <div v-if="step === 0" class="step-body">
      <div class="step-tip">
        <p>请先下载标准模板，按要求填写学生账号信息。</p>
        <p>初始密码默认为学号，学生首次登录必须修改密码。</p>
        <ul class="rule-list">
          <li>带 * 为必填：用户名、真实姓名、学号、电话号码、邮箱</li>
          <li>班级名称为选填；不填则导入为「未分配班级」</li>
          <li>单次最多 500 条，支持 .xlsx / .xls</li>
        </ul>
      </div>
      <el-button type="primary" plain :loading="downloading" @click="downloadTemplate">
        下载 Excel 模板
      </el-button>
    </div>

    <div v-else-if="step === 1" class="step-body">
      <el-upload
        drag
        :auto-upload="false"
        :limit="1"
        accept=".xlsx,.xls"
        :on-change="onFileChange"
        :on-exceed="() => ElMessage.warning('仅支持上传一个文件')"
        :file-list="fileList"
      >
        <el-icon class="upload-icon"><UploadFilled /></el-icon>
        <div class="el-upload__text">将 Excel 拖到此处，或 <em>点击上传</em></div>
        <template #tip>
          <div class="upload-tip">支持 .xlsx / .xls，单次最多 500 条，文件不超过 5MB</div>
        </template>
      </el-upload>
      <div v-if="previewLoading" class="preview-loading">
        <el-icon class="is-loading"><Loading /></el-icon>
        正在预检，请稍候…
      </div>
    </div>

    <div v-else-if="step === 2" class="step-body">
      <div class="preview-stats">
        <div class="stat-item">
          <span class="stat-label">总行数</span>
          <span class="stat-value">{{ preview?.totalRows ?? 0 }}</span>
        </div>
        <div class="stat-item stat-item--ok">
          <span class="stat-label">可导入</span>
          <span class="stat-value">{{ preview?.validRows ?? 0 }}</span>
        </div>
        <div class="stat-item stat-item--err">
          <span class="stat-label">错误行</span>
          <span class="stat-value">{{ preview?.errorRows ?? 0 }}</span>
        </div>
        <div v-if="preview?.batchNo" class="stat-item">
          <span class="stat-label">批次号</span>
          <span class="stat-value stat-value--sm">{{ preview.batchNo }}</span>
        </div>
      </div>

      <el-alert
        v-if="preview?.errorRows > 0"
        type="error"
        :closable="false"
        show-icon
        title="存在错误行，请修正 Excel 后重新上传。有错误行时不能确认导入。"
        class="preview-alert"
      />

      <div class="preview-table-wrap">
        <el-table :data="preview?.rows || []" border size="small" max-height="360">
          <el-table-column prop="rowNumber" label="行号" width="64" align="center" />
          <el-table-column prop="username" label="用户名" min-width="110" show-overflow-tooltip />
          <el-table-column prop="realName" label="姓名" min-width="90" show-overflow-tooltip />
          <el-table-column prop="studentNo" label="学号" min-width="100" show-overflow-tooltip />
          <el-table-column prop="phone" label="电话" min-width="120" show-overflow-tooltip />
          <el-table-column prop="email" label="邮箱" min-width="150" show-overflow-tooltip />
          <el-table-column prop="className" label="班级" min-width="110" show-overflow-tooltip>
            <template #default="{ row }">{{ row.className || '—' }}</template>
          </el-table-column>
          <el-table-column label="状态" width="88" align="center">
            <template #default="{ row }">
              <el-tag :type="row.valid ? 'success' : 'danger'" size="small" effect="plain">
                {{ row.valid ? '通过' : '错误' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="错误原因" min-width="180" show-overflow-tooltip>
            <template #default="{ row }">
              <span v-if="row.errors?.length" class="err-text">{{ row.errors.join('；') }}</span>
              <span v-else class="muted">—</span>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>

    <div v-else class="step-body step-done">
      <el-result icon="success" title="导入完成">
        <template #sub-title>
          <p>成功导入 {{ importResult?.importedRows ?? 0 }} 条</p>
          <p v-if="importResult?.failedRows">失败 {{ importResult.failedRows }} 条</p>
          <p v-if="importResult?.batchId">批次号：{{ preview?.batchNo || importResult.batchId }}</p>
        </template>
        <template #extra>
          <el-button type="primary" plain @click="emit('open-records')">查看导入记录</el-button>
          <el-button plain :loading="downloadingResult" @click="downloadResult">下载导入结果</el-button>
        </template>
      </el-result>
    </div>

    <template #footer>
      <el-button @click="visible = false">{{ step === 3 ? '关闭' : '取消' }}</el-button>
      <el-button v-if="step === 0" type="primary" @click="step = 1">下一步：上传 Excel</el-button>
      <el-button v-if="step === 1" type="primary" :disabled="!selectedFile || previewLoading" @click="runPreview">
        上传并预检
      </el-button>
      <el-button
        v-if="step === 2"
        plain
        @click="reupload"
      >
        重新上传
      </el-button>
      <el-button
        v-if="step === 2"
        type="primary"
        :loading="confirming"
        :disabled="!preview || preview.errorRows > 0 || !preview.validRows"
        @click="runConfirm"
      >
        确认导入
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled, Loading } from '@element-plus/icons-vue'
import {
  downloadStudentImportTemplate,
  previewStudentImport,
  confirmStudentImport,
  downloadStudentImportResult,
} from '../../api/studentImport'
import { triggerBlobDownload } from '../../utils/downloadBlob'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'success', 'open-records'])

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const step = ref(0)
const downloading = ref(false)
const previewLoading = ref(false)
const confirming = ref(false)
const downloadingResult = ref(false)
const selectedFile = ref(null)
const fileList = ref([])
const preview = ref(null)
const importResult = ref(null)

const resetState = () => {
  step.value = 0
  selectedFile.value = null
  fileList.value = []
  preview.value = null
  importResult.value = null
}

const downloadTemplate = async () => {
  downloading.value = true
  try {
    const blob = await downloadStudentImportTemplate()
    await triggerBlobDownload(blob, '学生账号导入模板.xlsx', '模板下载失败')
  } catch (e) {
    ElMessage.error(e.message || '模板下载失败')
  } finally {
    downloading.value = false
  }
}

const onFileChange = (file) => {
  selectedFile.value = file.raw
  fileList.value = [file]
}

const runPreview = async () => {
  if (!selectedFile.value) {
    ElMessage.warning('请先选择 Excel 文件')
    return
  }
  previewLoading.value = true
  try {
    const res = await previewStudentImport(selectedFile.value)
    if (res.success) {
      preview.value = res.data
      step.value = 2
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '预检失败')
  } finally {
    previewLoading.value = false
  }
}

const reupload = () => {
  preview.value = null
  selectedFile.value = null
  fileList.value = []
  step.value = 1
}

const runConfirm = async () => {
  if (!preview.value?.batchId) return
  confirming.value = true
  try {
    const res = await confirmStudentImport(preview.value.batchId)
    if (res.success) {
      importResult.value = res.data
      step.value = 3
      emit('success')
      ElMessage.success('导入完成')
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '导入失败')
  } finally {
    confirming.value = false
  }
}

const downloadResult = async () => {
  const batchId = preview.value?.batchId || importResult.value?.batchId
  if (!batchId) return
  downloadingResult.value = true
  try {
    const blob = await downloadStudentImportResult(batchId)
    await triggerBlobDownload(blob, `student-import-result-${batchId}.xlsx`, '下载失败')
  } catch (e) {
    ElMessage.error(e.message || '下载失败')
  } finally {
    downloadingResult.value = false
  }
}
</script>

<style scoped>
.import-steps {
  margin-bottom: 24px;
}

.step-body {
  min-height: 200px;
}

.step-tip {
  margin-bottom: 16px;
  font-size: 14px;
  color: #475569;
  line-height: 1.6;
}

.step-tip p {
  margin: 0 0 8px;
}

.rule-list {
  margin: 12px 0 0;
  padding-left: 18px;
  color: #64748b;
  font-size: 13px;
}

.rule-list li {
  margin-bottom: 4px;
}

.upload-icon {
  font-size: 48px;
  color: #94a3b8;
  margin-bottom: 8px;
}

.upload-tip {
  font-size: 12px;
  color: #94a3b8;
}

.preview-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
  color: #64748b;
  font-size: 14px;
}

.preview-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
}

.stat-item {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px 16px;
  min-width: 100px;
}

.stat-item--ok .stat-value {
  color: #059669;
}

.stat-item--err .stat-value {
  color: #dc2626;
}

.stat-label {
  display: block;
  font-size: 12px;
  color: #64748b;
  margin-bottom: 4px;
}

.stat-value {
  font-size: 20px;
  font-weight: 600;
  color: #1e293b;
}

.stat-value--sm {
  font-size: 13px;
  font-weight: 500;
  word-break: break-all;
}

.preview-alert {
  margin-bottom: 12px;
}

.preview-table-wrap {
  border-radius: 8px;
  overflow: hidden;
}

.err-text {
  color: #b91c1c;
  font-size: 12px;
}

.muted {
  color: #94a3b8;
}

.step-done {
  padding-top: 8px;
}
</style>
