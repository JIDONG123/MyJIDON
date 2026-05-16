<template>
  <div class="page-kb">
    <header class="page-head">
      <h1 class="page-title">实训知识库（RAG）</h1>
      <p class="page-desc">
        上传指导书、评分标准、优秀案例、易错点等文档（Word docx / PDF / TXT / MD），系统将解析、分块并向量化；您发布任务的 AI
        批改会自动检索与您提交内容最相关的片段，结合 DeepSeek 等大模型做精准对标。仅您本人可管理此处文档。
      </p>
    </header>

    <el-alert
      class="tip"
      type="info"
      show-icon
      :closable="false"
      title="请先在「管理端 → 系统设置」配置向量服务：默认使用阿里云 DashScope OpenAI 兼容地址与 text-embedding-v4；未配置或解析失败时，AI 批改仍按原逻辑运行（不使用知识库）。"
    />

    <el-card shadow="never" class="upload-card">
      <template #header>
        <span class="card-title">上传文档</span>
      </template>
      <el-form label-width="88px" class="upload-form">
        <el-form-item label="文档类型">
          <el-select v-model="uploadCategory" placeholder="选择类型" style="width: 220px">
            <el-option label="实训指导书" value="guide" />
            <el-option label="评分标准 / 量规" value="standard" />
            <el-option label="优秀案例" value="example" />
            <el-option label="易错点说明" value="pitfalls" />
            <el-option label="其它" value="other" />
          </el-select>
        </el-form-item>
        <el-form-item label="显示标题">
          <el-input v-model="uploadTitle" placeholder="可选，默认用文件名" clearable style="max-width: 360px" />
        </el-form-item>
        <el-form-item label="选择文件">
          <el-upload
            :show-file-list="false"
            :http-request="doUpload"
            accept=".pdf,.docx,.txt,.md"
          >
            <el-button type="primary" :loading="uploading">选择并上传</el-button>
          </el-upload>
          <span class="upload-hint">单文件 ≤ 30MB；上传后后台解析与向量化，请稍后刷新列表查看「就绪」状态。</span>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never" class="list-card">
      <template #header>
        <div class="list-head">
          <span class="card-title">我的文档</span>
          <el-button text type="primary" @click="loadList">刷新</el-button>
        </div>
      </template>
      <el-table :data="docs" v-loading="loading" stripe empty-text="暂无文档">
        <el-table-column prop="title" label="标题" min-width="160" show-overflow-tooltip />
        <el-table-column label="类型" width="120">
          <template #default="{ row }">{{ categoryLabel(row.category) }}</template>
        </el-table-column>
        <el-table-column prop="file_name" label="文件名" min-width="180" show-overflow-tooltip />
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <el-tag v-if="row.status === 'ready'" type="success" size="small">就绪</el-tag>
            <el-tag v-else-if="row.status === 'processing'" type="warning" size="small">处理中</el-tag>
            <el-tag v-else type="danger" size="small">失败</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="chunk_count" label="分块数" width="88" align="center" />
        <el-table-column label="更新时间" width="170">
          <template #default="{ row }">{{ formatDateTime(row.updated_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="100" align="right" fixed="right">
          <template #default="{ row }">
            <el-button link type="danger" @click="removeDoc(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <p v-if="failedHint" class="fail-hint">{{ failedHint }}</p>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { listKbDocuments, uploadKbDocument, deleteKbDocument } from '../../api/kb'
import { formatDateTime } from '../../utils/format'

const docs = ref([])
const loading = ref(true)
const uploading = ref(false)
const uploadCategory = ref('guide')
const uploadTitle = ref('')
let pollTimer = null

const failedHint = computed(() => {
  const failed = docs.value.filter((d) => d.status === 'failed' && d.error_message)
  if (!failed.length) return ''
  return `失败原因示例：${failed[0].error_message}`
})

function categoryLabel(c) {
  const m = {
    guide: '指导书',
    standard: '评分标准',
    example: '优秀案例',
    pitfalls: '易错点',
    other: '其它',
  }
  return m[c] || c || '—'
}

const loadList = async () => {
  loading.value = true
  try {
    const res = await listKbDocuments()
    if (res.success) docs.value = res.data || []
  } catch {
    docs.value = []
  } finally {
    loading.value = false
  }
}

const doUpload = async ({ file, onError, onSuccess }) => {
  uploading.value = true
  try {
    const res = await uploadKbDocument(file, {
      category: uploadCategory.value,
      title: uploadTitle.value?.trim() || undefined,
    })
    if (res.success) {
      ElMessage.success(res.message || '上传成功')
      uploadTitle.value = ''
      onSuccess && onSuccess(res)
      await loadList()
    } else {
      ElMessage.error(res.message || '上传失败')
      onError && onError()
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || e?.message || '上传失败')
    onError && onError(e)
  } finally {
    uploading.value = false
  }
}

const removeDoc = async (row) => {
  try {
    await ElMessageBox.confirm(`确定删除「${row.title}」？`, '确认', { type: 'warning' })
    const res = await deleteKbDocument(row.id)
    if (res.success) {
      ElMessage.success('已删除')
      await loadList()
    }
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e?.response?.data?.message || '删除失败')
  }
}

const tickPoll = () => {
  if (docs.value.some((d) => d.status === 'processing')) loadList()
}

onMounted(async () => {
  await loadList()
  pollTimer = setInterval(tickPoll, 4000)
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})
</script>

<style scoped>
.page-kb {
  max-width: 1100px;
  margin: 0 auto;
}

.page-title {
  margin: 0 0 8px;
  font-size: 22px;
  font-weight: 700;
  color: var(--sg-text);
}

.page-desc {
  margin: 0 0 16px;
  font-size: 14px;
  color: var(--sg-text-secondary);
  line-height: 1.55;
}

.tip {
  margin-bottom: 16px;
  border-radius: 12px;
}

.upload-card,
.list-card {
  margin-bottom: 16px;
  border-radius: 12px;
}

.card-title {
  font-weight: 600;
}

.upload-form {
  max-width: 640px;
}

.upload-hint {
  margin-left: 12px;
  font-size: 13px;
  color: var(--sg-text-secondary);
}

.list-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.fail-hint {
  margin: 12px 0 0;
  font-size: 12px;
  color: #b45309;
}
</style>
