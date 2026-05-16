<template>
  <div class="page-class-students">
    <header class="page-head">
      <div class="page-head-row">
        <el-button class="back-btn" @click="$router.push(`/teacher/classes/${classId}`)">
          <el-icon><ArrowLeft /></el-icon>
          返回班级工作台
        </el-button>
        <div v-if="clsMeta" class="page-head-meta">
          <h1 class="page-title">班级学生管理</h1>
          <p class="page-desc">{{ clsMeta.class_name }} · {{ clsMeta.major || '—' }} · {{ clsMeta.grade || '—' }}</p>
        </div>
      </div>
    </header>

    <el-skeleton v-if="pageLoading" animated :rows="6" class="sk-main" />

    <el-alert v-else-if="errorMsg" type="error" :title="errorMsg" show-icon :closable="false" />

    <div v-else class="workspace-body">
      <el-card shadow="never" class="module-card">
        <template #header>
          <span class="module-title">本班学生</span>
        </template>
        <el-table :data="students" class="cd-table" stripe v-loading="studentsLoading" empty-text="">
          <template #empty>
            <el-empty description="本班暂无学生，可在下方添加未分班学生" :image-size="72" />
          </template>
          <el-table-column prop="real_name" label="姓名" min-width="100" align="left" />
          <el-table-column prop="username" label="用户名" min-width="120" align="left" />
          <el-table-column prop="email" label="邮箱" min-width="200" align="left" show-overflow-tooltip />
        </el-table>
      </el-card>

      <el-card shadow="never" class="module-card">
        <template #header>
          <span class="module-title">添加未分班学生</span>
        </template>
        <el-collapse v-model="addPanelOpen" class="add-collapse">
          <el-collapse-item name="add">
            <template #title>
              <span class="collapse-title">搜索与候选列表</span>
              <span class="collapse-hint">（可收起）</span>
            </template>
            <div class="add-inner">
              <p class="add-desc">
                仅展示系统中<strong>尚未分班</strong>的学生；每人只能归属一个班级，已分班学生不会出现在此列表。
              </p>
              <div class="toolbar-cand">
                <el-input
                  v-model="searchQuery"
                  placeholder="用户名 / 姓名 / 邮箱（可留空查看全部未分班）"
                  clearable
                  class="search-inp"
                  @keyup.enter="runSearch"
                />
                <el-button type="primary" class="tool-btn" @click="runSearch">
                  <el-icon><Search /></el-icon>
                  搜索
                </el-button>
                <el-button class="tool-btn" @click="resetSearch">
                  <el-icon><RefreshLeft /></el-icon>
                  清空
                </el-button>
              </div>
              <el-table
                ref="candTableRef"
                v-loading="candLoading"
                :data="searchResults"
                row-key="id"
                class="cd-table cd-table--cand"
                stripe
                size="small"
                max-height="420"
                @selection-change="onSelectionChange"
              >
                <el-table-column type="selection" width="48" reserve-selection align="center" />
                <el-table-column prop="real_name" label="姓名" width="100" align="left" />
                <el-table-column prop="username" label="用户名" min-width="110" align="left" />
                <el-table-column prop="email" label="邮箱" min-width="160" align="left" show-overflow-tooltip />
                <el-table-column label="操作" width="100" align="right">
                  <template #default="{ row }">
                    <el-button type="primary" link class="row-link" size="small" @click="addOne(row)">加入本班</el-button>
                  </template>
                </el-table-column>
              </el-table>
              <div class="pager-wrap">
                <el-button
                  :type="selectionCount ? 'primary' : 'default'"
                  :disabled="!selectionCount"
                  class="batch-inline"
                  @click="batchAdd"
                >
                  <el-icon><UserFilled /></el-icon>
                  批量加入本班
                  <span v-if="selectionCount">（{{ selectionCount }} 人）</span>
                </el-button>
                <el-pagination
                  v-model:current-page="candPage"
                  v-model:page-size="candPageSize"
                  :total="candTotal"
                  :page-sizes="[10, 20, 50]"
                  layout="total, sizes, prev, pager, next"
                  size="small"
                  background
                  @current-change="fetchCandidates"
                  @size-change="onCandSizeChange"
                />
              </div>
            </div>
          </el-collapse-item>
        </el-collapse>
      </el-card>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Search, RefreshLeft, UserFilled } from '@element-plus/icons-vue'
import {
  getMyTeachingOverview,
  getClassStudents,
  addStudentToClass,
  addStudentsToClassBatch,
} from '../../api/class'
import { pickStudents } from '../../api/user'

const route = useRoute()
const classId = computed(() => route.params.id)

const pageLoading = ref(true)
const errorMsg = ref('')
const clsMeta = ref(null)
const students = ref([])
const studentsLoading = ref(false)

const addPanelOpen = ref(['add'])
const searchQuery = ref('')
const searchResults = ref([])
const candPage = ref(1)
const candPageSize = ref(20)
const candTotal = ref(0)
const candTableRef = ref(null)
const selectionCount = ref(0)
const candLoading = ref(false)

const loadPage = async () => {
  pageLoading.value = true
  errorMsg.value = ''
  clsMeta.value = null
  students.value = []
  try {
    const res = await getMyTeachingOverview()
    if (!res.success) {
      errorMsg.value = '加载失败'
      return
    }
    const row = (res.data || []).find((c) => String(c.id) === String(classId.value))
    if (!row) {
      errorMsg.value = '班级不存在或您无权管理该班级'
      return
    }
    clsMeta.value = row
    await refreshStudents()
  } finally {
    pageLoading.value = false
  }
}

const refreshStudents = async () => {
  studentsLoading.value = true
  try {
    const res = await getClassStudents(classId.value)
    if (res.success) students.value = res.data || []
  } catch {
    students.value = []
  } finally {
    studentsLoading.value = false
  }
}

const fetchCandidates = async () => {
  candLoading.value = true
  try {
    const q = searchQuery.value.trim()
    const res = await pickStudents({
      q: q || undefined,
      page: candPage.value,
      pageSize: candPageSize.value,
    })
    if (res.success) {
      searchResults.value = res.data || []
      candTotal.value = res.total ?? 0
    } else {
      searchResults.value = []
      candTotal.value = 0
    }
    await nextTick()
    selectionCount.value = candTableRef.value?.getSelectionRows()?.length ?? 0
  } catch (e) {
    console.error(e)
    ElMessage.error('加载候选学生失败')
  } finally {
    candLoading.value = false
  }
}

const runSearch = () => {
  candPage.value = 1
  candTableRef.value?.clearSelection()
  fetchCandidates()
}

const resetSearch = () => {
  searchQuery.value = ''
  candPage.value = 1
  candTableRef.value?.clearSelection()
  fetchCandidates()
}

const onCandSizeChange = () => {
  candPage.value = 1
  candTableRef.value?.clearSelection()
  fetchCandidates()
}

const onSelectionChange = () => {
  selectionCount.value = candTableRef.value?.getSelectionRows()?.length ?? 0
}

const addOne = async (row) => {
  try {
    await ElMessageBox.confirm(
      `将「${row.real_name}（${row.username}）」加入 ${clsMeta.value.class_name}？`,
      '确认加入',
      { type: 'warning' }
    )
    const res = await addStudentToClass(classId.value, row.id)
    if (res.success) {
      ElMessage.success('已加入班级')
      candTableRef.value?.clearSelection()
      await refreshStudents()
      await fetchCandidates()
    }
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e?.response?.data?.message || '添加失败')
  }
}

const batchAdd = async () => {
  const rows = candTableRef.value?.getSelectionRows() || []
  if (!rows.length) {
    ElMessage.warning('请先勾选学生')
    return
  }
  const ids = rows.map((r) => r.id)
  try {
    await ElMessageBox.confirm(`将已选的 ${ids.length} 名学生加入「${clsMeta.value.class_name}」？`, '批量加入', {
      type: 'warning',
    })
    const res = await addStudentsToClassBatch(classId.value, ids)
    if (res.success) {
      ElMessage.success(res.message || '已批量加入')
      candTableRef.value?.clearSelection()
      selectionCount.value = 0
      await refreshStudents()
      await fetchCandidates()
    }
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e?.response?.data?.message || '批量添加失败')
  }
}

onMounted(async () => {
  await loadPage()
  if (!errorMsg.value) await fetchCandidates()
})

watch(
  () => route.params.id,
  async () => {
    await loadPage()
    if (!errorMsg.value) await fetchCandidates()
  }
)
</script>

<style scoped>
.page-class-students {
  max-width: 1120px;
  margin: 0 auto;
  padding: 8px 4px 40px;
}

.page-head {
  margin-bottom: 24px;
}

.page-head-row {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-start;
}

.page-head-meta {
  flex: 1;
  min-width: 0;
}

.back-btn {
  border-radius: 10px;
  font-weight: 500;
}

.page-title {
  margin: 0 0 8px;
  font-size: 24px;
  font-weight: 700;
  color: var(--sg-text, #0f172a);
}

.page-desc {
  margin: 0;
  font-size: 13px;
  color: #64748b;
}

.sk-main {
  padding: 20px 0;
}

.workspace-body {
  display: flex;
  flex-direction: column;
  gap: 22px;
  animation: in 0.4s ease-out both;
}

@keyframes in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.module-card {
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: #fff;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 28px rgba(15, 76, 129, 0.06);
  transition: box-shadow 0.25s ease;
}

.module-card:hover {
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.06), 0 16px 40px rgba(15, 76, 129, 0.08);
}

.module-card :deep(.el-card__header) {
  padding: 16px 20px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.95);
  background: linear-gradient(180deg, #fafbfc 0%, #ffffff 100%);
}

.module-card :deep(.el-card__body) {
  padding: 18px 20px 22px;
}

.module-title {
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.add-collapse {
  border: none;
}

.add-collapse :deep(.el-collapse-item__header) {
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
  padding: 0 4px 12px;
  border: none;
  height: auto;
  line-height: 1.4;
}

.add-collapse :deep(.el-collapse-item__wrap) {
  border: none;
}

.add-collapse :deep(.el-collapse-item__content) {
  padding-bottom: 0;
}

.collapse-title {
  margin-right: 6px;
}

.collapse-hint {
  font-size: 12px;
  font-weight: 500;
  color: #94a3b8;
}

.add-inner {
  padding-top: 4px;
}

.add-desc {
  margin: 0 0 14px;
  font-size: 13px;
  line-height: 1.65;
  color: #64748b;
}

.toolbar-cand {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin-bottom: 14px;
}

.search-inp {
  flex: 1;
  min-width: 220px;
  max-width: 440px;
}

.search-inp :deep(.el-input__wrapper) {
  border-radius: 10px;
}

.tool-btn {
  border-radius: 10px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.cd-table {
  --el-table-border-color: transparent;
  --el-table-header-bg-color: #f1f5f9;
  border-radius: 10px;
  overflow: hidden;
}

.cd-table :deep(.el-table__header-wrapper th) {
  font-weight: 600;
  font-size: 13px;
  color: #475569;
  background: #f1f5f9 !important;
  border-bottom: 1px solid #e2e8f0 !important;
}

.cd-table :deep(.el-table__body-wrapper .el-table__row:hover > td) {
  background-color: rgba(64, 158, 255, 0.06) !important;
}

.cd-table :deep(.el-table__cell) {
  padding: 12px 14px;
}

.cd-table--cand {
  margin-bottom: 12px;
}

.row-link {
  font-weight: 600;
}

.pager-wrap {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 16px;
}

.batch-inline {
  border-radius: 10px;
  font-weight: 600;
  margin-right: auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.pager-wrap :deep(.el-pagination) {
  flex-wrap: wrap;
  justify-content: flex-end;
}

@media (max-width: 768px) {
  .pager-wrap {
    flex-direction: column;
    align-items: stretch;
  }

  .batch-inline {
    margin-right: 0;
    width: 100%;
    justify-content: center;
  }
}
</style>
