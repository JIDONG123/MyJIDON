<template>
  <div class="page-op-teacher">
    <header class="page-head">
      <div class="page-head-row">
        <div>
          <h1 class="page-title">在线实训模板</h1>
          <p class="page-desc">
            用于课堂即时练习：创建模板并发布到教学班后，学生可在「在线实训」中在线编写并运行代码（Python / Node.js / C / C++ / Java）。
          </p>
        </div>
        <el-button type="primary" @click="goCreate">新建在线实训模板</el-button>
      </div>
    </header>

    <el-alert
      v-if="featureReady && !featureOn"
      type="warning"
      show-icon
      :closable="false"
      title="在线实训未启用（CODE_RUNNER_ENABLED=0）：可管理模板，学生端菜单已隐藏且无法试运行。"
      class="mb16"
    />

    <el-card shadow="never" class="filter-card">
      <el-input
        v-model="keyword"
        clearable
        placeholder="搜索标题"
        style="width: 220px"
        @input="applyFilter"
      />
      <el-select
        v-model="statusFilter"
        clearable
        placeholder="状态"
        style="width: 140px; margin-left: 12px"
        @change="load"
      >
        <el-option label="草稿" value="draft" />
        <el-option label="已发布" value="published" />
        <el-option label="已关闭" value="closed" />
      </el-select>
      <el-select
        v-model="langFilter"
        clearable
        placeholder="语言"
        style="width: 140px; margin-left: 12px"
        @change="applyFilter"
      >
        <el-option v-for="opt in CODE_RUN_LANGUAGES" :key="opt.value" :label="opt.label" :value="opt.value" />
      </el-select>
      <el-select
        v-model="tcFilter"
        clearable
        placeholder="教学班"
        style="width: 240px; margin-left: 12px"
        @change="load"
      >
        <el-option v-for="tc in teachingClasses" :key="tc.id" :label="tc.class_name" :value="tc.id" />
      </el-select>
    </el-card>

    <el-card shadow="never" class="panel-card">
      <el-table v-loading="loading" :data="filteredRows" border stripe>
        <el-table-column prop="title" label="标题" min-width="160" show-overflow-tooltip />
        <el-table-column label="教学班" min-width="120" show-overflow-tooltip>
          <template #default="{ row }">{{ teachingClassName(row.teachingClassId) }}</template>
        </el-table-column>
        <el-table-column label="语言" width="100">
          <template #default="{ row }">{{ langLabel(row.language) }}</template>
        </el-table-column>
        <el-table-column prop="entryFile" label="入口文件" width="120" show-overflow-tooltip />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <CodeRunStatusBadge :status="row.status" />
          </template>
        </el-table-column>
        <el-table-column label="AI 点评" width="100" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="row.aiReviewEnabled !== false ? 'success' : 'info'" effect="plain">
              {{ row.aiReviewEnabled !== false ? '已启用' : '已关闭' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="160">
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" min-width="240" align="right" fixed="right">
          <template #default="{ row }">
            <el-button size="small" plain @click="goEdit(row)">编辑</el-button>
            <el-button
              v-if="row.status === 'draft'"
              size="small"
              type="success"
              plain
              @click="publish(row)"
            >
              发布
            </el-button>
            <el-button
              v-if="row.status === 'published'"
              size="small"
              type="warning"
              plain
              @click="closeTpl(row)"
            >
              关闭
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !filteredRows.length">
        <template #description>
          <span v-if="rows.length">没有匹配的模板，请调整筛选条件</span>
          <span v-else>暂无模板</span>
        </template>
        <el-button v-if="!rows.length" type="primary" @click="goCreate">新建在线实训模板</el-button>
      </el-empty>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  listOnlinePracticeTemplates,
  publishOnlinePracticeTemplate,
  closeOnlinePracticeTemplate,
} from '../../api/onlinePractice'
import { listMyTeachingClasses } from '../../api/teachingClass'
import { probeCodeRunnerEnabled } from '../../composables/useCodeRunnerFeature'
import { CODE_RUN_LANGUAGES, langLabel, formatDateTime } from '../../utils/codeRunLanguages'
import CodeRunStatusBadge from '../../components/codeRunner/CodeRunStatusBadge.vue'

const router = useRouter()
const loading = ref(false)
const rows = ref([])
const filteredRows = ref([])
const teachingClasses = ref([])
const statusFilter = ref('')
const langFilter = ref('')
const tcFilter = ref(null)
const keyword = ref('')
const featureReady = ref(false)
const featureOn = ref(false)

const tcMap = ref({})

const teachingClassName = (id) => tcMap.value[id] || (id ? `#${id}` : '—')

const applyFilter = () => {
  const kw = keyword.value.trim().toLowerCase()
  filteredRows.value = rows.value.filter((r) => {
    if (langFilter.value && r.language !== langFilter.value) return false
    if (!kw) return true
    return (r.title || '').toLowerCase().includes(kw)
  })
}

const load = async () => {
  loading.value = true
  try {
    const params = {}
    if (statusFilter.value) params.status = statusFilter.value
    if (tcFilter.value) params.teachingClassId = tcFilter.value
    const res = await listOnlinePracticeTemplates(params)
    if (res.success) {
      rows.value = res.data || []
      applyFilter()
    }
  } finally {
    loading.value = false
  }
}

const goCreate = () => router.push('/teacher/online-practice/create')
const goEdit = (row) => router.push(`/teacher/online-practice/${row.id}/edit`)

const publish = async (row) => {
  await ElMessageBox.confirm(`发布「${row.title}」？发布后对应班级学生可见。`, '确认发布')
  const res = await publishOnlinePracticeTemplate(row.id)
  if (res.success) {
    ElMessage.success('已发布')
    load()
  }
}

const closeTpl = async (row) => {
  await ElMessageBox.confirm(`关闭「${row.title}」？关闭后学生将无法继续进入。`, '确认关闭')
  const res = await closeOnlinePracticeTemplate(row.id)
  if (res.success) {
    ElMessage.success('已关闭')
    load()
  }
}

onMounted(async () => {
  featureOn.value = await probeCodeRunnerEnabled()
  featureReady.value = true
  const tcRes = await listMyTeachingClasses()
  if (tcRes.success) {
    teachingClasses.value = tcRes.data || []
    tcMap.value = Object.fromEntries(teachingClasses.value.map((tc) => [tc.id, tc.class_name]))
  }
  await load()
})
</script>

<style scoped>
.page-op-teacher {
  max-width: var(--sg-content-max, 1480px);
}

.page-head-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 20px;
}

.page-title {
  margin: 0 0 8px;
  font-size: 22px;
  font-weight: 700;
}

.page-desc {
  margin: 0;
  font-size: 14px;
  color: var(--sg-text-secondary);
  line-height: 1.6;
  max-width: 720px;
}

.mb16 {
  margin-bottom: 16px;
}

.filter-card {
  margin-bottom: 16px;
  border-radius: 12px;
  box-shadow: var(--sg-shadow-card);
}

.filter-card :deep(.el-card__body) {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 14px 16px;
}

.panel-card {
  border-radius: 12px;
  box-shadow: var(--sg-shadow-card);
}
</style>
