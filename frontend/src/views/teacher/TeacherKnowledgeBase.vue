<template>
  <div class="kb-center">
    <header class="workbench-head">
      <div class="workbench-head__main">
        <h1 class="workbench-title">实训知识库（RAG）</h1>
        <p class="workbench-subtitle">
          上传课程标准、评分标准、实训指导书、优秀案例等资料，系统将自动解析并向量化，
          在 AI 批改、智能核查和实训报告生成时检索相关片段作为参考依据。
        </p>
      </div>
      <div class="workbench-head__status">
        <el-tag :type="vectorStatusTag.type" size="small" effect="light" class="status-tag">
          {{ vectorStatusTag.text }}
        </el-tag>
        <el-tag :type="parseStatusTag.type" size="small" effect="light" class="status-tag">
          {{ parseStatusTag.text }}
        </el-tag>
      </div>
    </header>

    <el-alert
      class="config-tip"
      type="info"
      show-icon
      :closable="false"
      title="请先在「管理端 → 系统设置」配置向量服务：默认使用阿里云 DashScope OpenAI 兼容地址与 text-embedding-v4；未配置或解析失败时，AI 批改仍按原逻辑运行（不使用知识库）。"
    />

    <el-skeleton v-if="loading && !docs.length" animated :rows="8" class="workbench-skeleton" />

    <template v-else>
      <section class="metric-grid">
        <div v-for="card in overviewCards" :key="card.key" class="metric-card">
          <div class="metric-card__icon" :class="`metric-card__icon--${card.tone}`">
            <el-icon><component :is="card.icon" /></el-icon>
          </div>
          <div class="metric-card__body">
            <span class="metric-card__value">{{ card.value }}</span>
            <span class="metric-card__label">{{ card.label }}</span>
            <span class="metric-card__hint">{{ card.hint }}</span>
          </div>
        </div>
      </section>

      <el-row :gutter="16" class="upload-row">
        <el-col :xs="24" :lg="14">
          <div ref="uploadSectionRef" class="panel">
            <div class="panel__header">
              <h2 class="panel__title">上传文档</h2>
              <span class="panel__meta">仅您本人可管理此处文档</span>
            </div>
            <div class="panel__body">
              <el-form label-position="top" class="upload-form">
                <el-row :gutter="16">
                  <el-col :xs="24" :sm="12">
                    <el-form-item label="文档类型">
                      <el-select v-model="uploadCategory" placeholder="选择类型" style="width: 100%">
                        <el-option label="实训指导书" value="guide" />
                        <el-option label="评分标准 / 量规" value="standard" />
                        <el-option label="优秀案例" value="example" />
                        <el-option label="易错点说明" value="pitfalls" />
                        <el-option label="其它" value="other" />
                      </el-select>
                    </el-form-item>
                  </el-col>
                  <el-col :xs="24" :sm="12">
                    <el-form-item label="显示标题">
                      <el-input v-model="uploadTitle" placeholder="可选，默认用文件名" clearable />
                    </el-form-item>
                  </el-col>
                </el-row>
                <el-form-item label="文件选择">
                  <el-upload
                    class="upload-drop"
                    drag
                    :show-file-list="false"
                    :http-request="doUpload"
                    accept=".pdf,.docx,.txt,.md"
                  >
                    <div class="upload-drop__inner">
                      <el-icon class="upload-drop__icon"><UploadFilled /></el-icon>
                      <p class="upload-drop__title">拖拽文件到此处，或点击选择上传</p>
                      <p class="upload-drop__hint">支持 docx / pdf / txt / md · 单文件 ≤ 30MB</p>
                      <p class="upload-drop__hint">上传后系统将自动解析、分块并向量化</p>
                      <el-button type="primary" :loading="uploading" class="upload-drop__btn">
                        选择并上传
                      </el-button>
                    </div>
                  </el-upload>
                </el-form-item>
              </el-form>
            </div>
          </div>
        </el-col>

        <el-col :xs="24" :lg="10">
          <div class="panel panel--support">
            <div class="panel__header">
              <h2 class="panel__title">支持上传内容</h2>
            </div>
            <div class="panel__body">
              <ul class="support-list">
                <li v-for="item in supportItems" :key="item.key" class="support-item">
                  <el-icon class="support-item__icon"><Document /></el-icon>
                  <div>
                    <span class="support-item__label">{{ item.label }}</span>
                    <span class="support-item__desc">{{ item.desc }}</span>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </el-col>
      </el-row>

      <div class="panel panel--flow">
        <div class="panel__header">
          <h2 class="panel__title">知识库增强 AI 批改流程</h2>
          <span class="panel__meta">RAG 为 AI 批改提供可检索的依据片段</span>
        </div>
        <div class="panel__body">
          <div class="flow-steps">
            <div v-for="(step, idx) in flowSteps" :key="step.key" class="flow-step">
              <div class="flow-step__index">{{ idx + 1 }}</div>
              <div class="flow-step__content">
                <span class="flow-step__title">{{ step.title }}</span>
                <span class="flow-step__desc">{{ step.desc }}</span>
              </div>
              <div v-if="idx < flowSteps.length - 1" class="flow-step__arrow" aria-hidden="true">→</div>
            </div>
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="panel__header panel__header--filters">
          <div>
            <h2 class="panel__title">我的文档</h2>
            <span class="panel__meta">共 {{ filteredDocs.length }} 份 · 本地筛选展示</span>
          </div>
          <div class="filter-bar">
            <el-input
              v-model="searchText"
              clearable
              placeholder="搜索标题 / 文件名"
              class="filter-input"
            >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
            </el-input>
            <el-select v-model="filterCategory" clearable placeholder="文档类型" class="filter-select">
              <el-option label="实训指导书" value="guide" />
              <el-option label="评分标准" value="standard" />
              <el-option label="优秀案例" value="example" />
              <el-option label="易错点" value="pitfalls" />
              <el-option label="其它" value="other" />
            </el-select>
            <el-select v-model="filterStatus" clearable placeholder="解析状态" class="filter-select">
              <el-option label="就绪" value="ready" />
              <el-option label="解析中" value="processing" />
              <el-option label="失败" value="failed" />
            </el-select>
            <el-button :loading="loading" @click="loadList">
              <el-icon><Refresh /></el-icon>
              刷新
            </el-button>
          </div>
        </div>

        <div v-if="!filteredDocs.length && !loading" class="panel__body">
          <el-empty description="暂无知识文档" :image-size="100" class="panel-empty">
            <p class="empty-tip">
              上传评分标准、实训指导书或优秀案例后，AI 批改将可检索相关依据
            </p>
            <el-button type="primary" @click="focusUpload">上传第一份文档</el-button>
          </el-empty>
        </div>

        <div v-else class="table-wrap">
          <el-table :data="filteredDocs" v-loading="loading" stripe class="workbench-table">
            <el-table-column label="文档名称" min-width="160" show-overflow-tooltip>
              <template #default="{ row }">
                <span class="cell-strong">{{ row.title || row.file_name || '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="文档类型" width="120">
              <template #default="{ row }">
                <el-tag size="small" effect="light" type="info">{{ categoryLabel(row.category) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="file_name" label="文件名" min-width="160" show-overflow-tooltip />
            <el-table-column label="解析状态" width="108" align="center">
              <template #default="{ row }">
                <el-tag :type="statusMeta(row.status).type" size="small" effect="light">
                  {{ statusMeta(row.status).text }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="chunk_count" label="知识分块" width="96" align="center">
              <template #default="{ row }">
                {{ row.chunk_count ?? '—' }}
              </template>
            </el-table-column>
            <el-table-column label="用途标签" min-width="180">
              <template #default="{ row }">
                <div class="purpose-tags">
                  <el-tag
                    v-for="tag in purposeTags(row.category)"
                    :key="tag"
                    size="small"
                    effect="plain"
                    class="purpose-tag"
                  >
                    {{ tag }}
                  </el-tag>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="更新时间" width="170">
              <template #default="{ row }">{{ formatDateTime(row.updated_at) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="100" align="right" fixed="right">
              <template #default="{ row }">
                <div class="table-row-actions">
                  <el-button type="danger" size="small" plain :icon="Delete" @click="removeDoc(row)">
                    删除
                  </el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>
          <p v-if="failedHint" class="fail-hint">{{ failedHint }}</p>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Delete,
  Document,
  UploadFilled,
  Search,
  Refresh,
  Collection,
  CircleCheck,
  Grid,
  Clock,
} from '@element-plus/icons-vue'
import { listKbDocuments, uploadKbDocument, deleteKbDocument } from '../../api/kb'
import { formatDateTime } from '../../utils/format'

const docs = ref([])
const loading = ref(true)
const uploading = ref(false)
const uploadCategory = ref('guide')
const uploadTitle = ref('')
const searchText = ref('')
const filterCategory = ref('')
const filterStatus = ref('')
const uploadSectionRef = ref(null)
let pollTimer = null

const supportItems = [
  { key: 'guide', label: '实训指导书', desc: '操作步骤、验收要求与注意事项' },
  { key: 'standard', label: '评分标准', desc: '量规、维度权重与达标说明' },
  { key: 'enterprise', label: '企业岗位标准', desc: '岗位能力要求与行业规范' },
  { key: 'example', label: '优秀案例', desc: '示范答案与优秀作业样例' },
  { key: 'pitfalls', label: '易错点总结', desc: '常见错误与改进建议' },
]

const flowSteps = [
  {
    key: 'upload',
    title: '上传评分标准 / 实训指导书',
    desc: '教师上传 docx、pdf 等教学资料',
  },
  {
    key: 'chunk',
    title: '系统解析并生成知识分块',
    desc: '自动切分文本并完成向量化',
  },
  {
    key: 'retrieve',
    title: 'AI 批改时检索相关片段',
    desc: '按作业内容匹配最相关依据',
  },
  {
    key: 'grade',
    title: '生成更有依据的评分与建议',
    desc: '输出对标评分、核查与改进意见',
  },
]

const readyCount = computed(() => docs.value.filter((d) => d.status === 'ready').length)
const totalChunks = computed(() =>
  docs.value.reduce((s, d) => s + (Number(d.chunk_count) || 0), 0)
)
const latestUpdated = computed(() => {
  const dates = docs.value
    .map((d) => d.updated_at)
    .filter(Boolean)
    .map((t) => new Date(t).getTime())
    .filter((t) => !Number.isNaN(t))
  if (!dates.length) return null
  return formatDateTime(new Date(Math.max(...dates)))
})

const vectorStatusTag = computed(() => {
  const hasReadyChunks = docs.value.some(
    (d) => d.status === 'ready' && Number(d.chunk_count) > 0
  )
  if (hasReadyChunks) {
    return { text: '向量服务已配置', type: 'success' }
  }
  return { text: '向量服务未配置或未验证', type: 'info' }
})

const parseStatusTag = computed(() => {
  if (docs.value.some((d) => d.status === 'processing')) {
    return { text: '文档解析中', type: 'primary' }
  }
  if (readyCount.value > 0) {
    return { text: '文档解析可用', type: 'success' }
  }
  if (docs.value.some((d) => d.status === 'failed')) {
    return { text: '部分文档解析失败', type: 'warning' }
  }
  return { text: '待上传文档验证', type: 'info' }
})

const overviewCards = computed(() => [
  {
    key: 'total',
    label: '文档总数',
    value: docs.value.length,
    hint: '本人知识库',
    icon: Collection,
    tone: 'blue',
  },
  {
    key: 'ready',
    label: '已就绪文档',
    value: readyCount.value,
    hint: '可用于 RAG 检索',
    icon: CircleCheck,
    tone: 'green',
  },
  {
    key: 'chunks',
    label: '知识分块数',
    value: totalChunks.value,
    hint: '向量化片段合计',
    icon: Grid,
    tone: 'indigo',
  },
  {
    key: 'updated',
    label: '最近更新时间',
    value: latestUpdated.value || '—',
    hint: '按文档更新统计',
    icon: Clock,
    tone: 'slate',
  },
])

const filteredDocs = computed(() => {
  let list = docs.value
  const q = searchText.value.trim().toLowerCase()
  if (q) {
    list = list.filter(
      (d) =>
        (d.title || '').toLowerCase().includes(q) ||
        (d.file_name || '').toLowerCase().includes(q)
    )
  }
  if (filterCategory.value) {
    list = list.filter((d) => d.category === filterCategory.value)
  }
  if (filterStatus.value) {
    list = list.filter((d) => d.status === filterStatus.value)
  }
  return list
})

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

function statusMeta(status) {
  if (status === 'ready') return { text: '就绪', type: 'success' }
  if (status === 'processing') return { text: '解析中', type: 'primary' }
  if (status === 'failed') return { text: '失败', type: 'danger' }
  return { text: '待处理', type: 'info' }
}

function purposeTags(category) {
  const map = {
    guide: ['AI批改参考', '智能核查'],
    standard: ['AI批改参考', '评分标准'],
    example: ['AI批改参考'],
    pitfalls: ['智能核查', 'AI批改参考'],
    other: ['AI批改参考'],
  }
  return map[category] || ['AI批改参考']
}

function focusUpload() {
  uploadSectionRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
.kb-center {
  max-width: 1360px;
  margin: 0 auto;
  padding: 20px 4px 32px;
  min-height: calc(100vh - 120px);
}

.workbench-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px 24px;
  margin-bottom: 16px;
}

.workbench-title {
  margin: 0 0 8px;
  font-size: 24px;
  font-weight: 700;
  color: #0f172a;
  letter-spacing: -0.02em;
}

.workbench-subtitle {
  margin: 0;
  max-width: 44rem;
  font-size: 14px;
  line-height: 1.65;
  color: #64748b;
}

.workbench-head__status {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.status-tag {
  border-radius: 6px;
  font-weight: 500;
}

.config-tip {
  margin-bottom: 20px;
  border-radius: 12px;
}

.workbench-skeleton {
  padding: 12px 0;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 14px;
  margin-bottom: 20px;
}

.metric-card {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 18px 16px;
  background: #fff;
  border: 1px solid #e8edf3;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
}

.metric-card__icon {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
}

.metric-card__icon--slate { background: #f1f5f9; color: #475569; }
.metric-card__icon--blue { background: #eff6ff; color: #1677ff; }
.metric-card__icon--green { background: #f0fdf4; color: #16a34a; }
.metric-card__icon--indigo { background: #eef2ff; color: #4f46e5; }

.metric-card__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.metric-card__value {
  font-size: 22px;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.25;
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.metric-card__label {
  font-size: 13px;
  font-weight: 600;
  color: #475569;
}

.metric-card__hint {
  font-size: 11px;
  color: #94a3b8;
}

.upload-row {
  margin-bottom: 20px;
}

.panel {
  background: #fff;
  border: 1px solid #e8edf3;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
  margin-bottom: 20px;
}

.panel--support {
  height: 100%;
  margin-bottom: 0;
}

.panel--flow {
  margin-bottom: 20px;
}

.panel__header {
  padding: 16px 20px 14px;
  border-bottom: 1px solid #eef2f7;
  background: #fafbfc;
}

.panel__header--filters {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px 20px;
}

.panel__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #0f172a;
}

.panel__meta {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: #94a3b8;
}

.panel__body {
  padding: 20px;
}

.upload-form :deep(.el-form-item__label) {
  font-weight: 600;
  color: #475569;
}

.upload-drop {
  width: 100%;
}

.upload-drop :deep(.el-upload) {
  width: 100%;
}

.upload-drop :deep(.el-upload-dragger) {
  width: 100%;
  padding: 28px 20px;
  border-radius: 12px;
  border: 1px dashed #cbd5e1;
  background: #f8fafc;
  transition: border-color 0.2s ease, background 0.2s ease;
}

.upload-drop :deep(.el-upload-dragger:hover) {
  border-color: rgba(22, 119, 255, 0.45);
  background: #f0f7ff;
}

.upload-drop__inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.upload-drop__icon {
  font-size: 40px;
  color: #1677ff;
  margin-bottom: 4px;
}

.upload-drop__title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #0f172a;
}

.upload-drop__hint {
  margin: 0;
  font-size: 12px;
  color: #64748b;
  line-height: 1.5;
}

.upload-drop__btn {
  margin-top: 10px;
  border-radius: 8px;
  font-weight: 600;
}

.support-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.support-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid #f1f5f9;
}

.support-item:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.support-item__icon {
  flex-shrink: 0;
  font-size: 20px;
  color: #1677ff;
  margin-top: 2px;
}

.support-item__label {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
  margin-bottom: 4px;
}

.support-item__desc {
  display: block;
  font-size: 12px;
  color: #64748b;
  line-height: 1.5;
}

.flow-steps {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}

.flow-step {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  border: 1px solid #e8edf3;
  border-radius: 10px;
  background: #fafbfc;
}

.flow-step__index {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: #eff6ff;
  color: #1677ff;
  font-size: 14px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.flow-step__content {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.flow-step__title {
  font-size: 13px;
  font-weight: 600;
  color: #0f172a;
  line-height: 1.45;
}

.flow-step__desc {
  font-size: 12px;
  color: #64748b;
  line-height: 1.5;
}

.flow-step__arrow {
  display: none;
}

.filter-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  flex: 1;
  justify-content: flex-end;
  min-width: 280px;
}

.filter-input {
  width: 200px;
}

.filter-select {
  width: 130px;
}

.table-wrap {
  padding: 0 4px 12px;
}

.workbench-table :deep(.el-table__header th) {
  background: #f8fafc !important;
  color: #475569;
  font-weight: 600;
}

.cell-strong {
  font-weight: 600;
  color: #0f172a;
}

.purpose-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.purpose-tag {
  border-radius: 4px;
}

.table-row-actions {
  display: flex;
  justify-content: flex-end;
}

.fail-hint {
  margin: 0 16px 12px;
  font-size: 12px;
  color: #b45309;
}

.panel-empty {
  padding: 24px 16px 32px;
}

.empty-tip {
  margin: 0 0 16px;
  max-width: 28rem;
  font-size: 13px;
  color: #64748b;
  line-height: 1.6;
}

@media (min-width: 1200px) {
  .flow-steps {
    grid-template-columns: repeat(4, 1fr);
  }
}

@media (max-width: 992px) {
  .panel--support {
    margin-bottom: 20px;
  }
}

@media (max-width: 768px) {
  .filter-input,
  .filter-select {
    width: 100%;
  }

  .filter-bar {
    justify-content: stretch;
  }
}
</style>
