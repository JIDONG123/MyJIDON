<template>
  <div class="page-ann-mgmt">
    <header class="page-head">
      <div>
        <h1 class="page-title">班级公告</h1>
        <p class="page-desc">管理您负责班级的公告：按班级筛选、发布、编辑与删除。</p>
      </div>
    </header>

    <el-card shadow="never" class="module-card toolbar-card">
      <div class="toolbar">
        <div class="toolbar-left">
          <span class="filter-label">班级</span>
          <el-select
            v-model="filterClassId"
            placeholder="全部班级"
            clearable
            filterable
            class="class-filter"
            @change="loadAnnouncements"
          >
            <el-option v-for="c in teacherClasses" :key="c.id" :label="classLabel(c)" :value="c.id" />
          </el-select>
        </div>
        <el-button type="primary" class="primary-btn" @click="openPublishDialog">
          <el-icon><Plus /></el-icon>
          发布公告
        </el-button>
      </div>
    </el-card>

    <el-card v-loading="loading" shadow="never" class="module-card">
      <el-table :data="rows" class="cd-table" stripe empty-text="">
        <template #empty>
          <el-empty description="暂无公告，可点击右上角「发布公告」创建" :image-size="80" />
        </template>
        <el-table-column prop="className" label="班级" min-width="140" show-overflow-tooltip />
        <el-table-column prop="title" label="标题" min-width="200" show-overflow-tooltip />
        <el-table-column label="发布时间" width="180" align="left">
          <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="160" align="right">
          <template #default="{ row }">
            <el-button link type="primary" class="row-link" @click="openEditDialog(row)">编辑</el-button>
            <el-button link type="danger" class="row-link" @click="removeRow(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="editingId ? '编辑公告' : '发布公告'"
      width="560px"
      destroy-on-close
      @closed="resetForm"
    >
      <el-form label-width="80px">
        <el-form-item v-if="!editingId" label="班级" required>
          <el-select v-model="form.classId" placeholder="选择班级" filterable class="w-full">
            <el-option v-for="c in teacherClasses" :key="c.id" :label="classLabel(c)" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="标题" required>
          <el-input v-model="form.title" maxlength="200" show-word-limit placeholder="公告标题" />
        </el-form-item>
        <el-form-item label="内容">
          <el-input v-model="form.content" type="textarea" :rows="6" placeholder="正文（选填）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import {
  getMyTeachingOverview,
  listClassAnnouncements,
  createClassAnnouncement,
  updateClassAnnouncement,
  deleteClassAnnouncement,
} from '../../api/class'
import { formatDateTime } from '../../utils/format'

const route = useRoute()

const teacherClasses = ref([])
/** null 表示「全部班级」 */
const filterClassId = ref(null)
const loading = ref(true)
const rows = ref([])

const dialogVisible = ref(false)
const editingId = ref(null)
const editingClassId = ref(null)
const saving = ref(false)
const form = reactive({ classId: null, title: '', content: '' })

const classLabel = (c) => {
  const parts = [c.class_name, c.major, c.grade].filter(Boolean)
  return parts.length ? parts.join(' · ') : `班级 ${c.id}`
}

const loadClasses = async () => {
  const res = await getMyTeachingOverview()
  if (res.success) teacherClasses.value = res.data || []
}

const loadAnnouncements = async () => {
  loading.value = true
  try {
    const merged = []
    const list = teacherClasses.value
    for (const c of list) {
      if (filterClassId.value != null && Number(c.id) !== Number(filterClassId.value)) continue
      const res = await listClassAnnouncements(c.id)
      if (res.success) {
        for (const a of res.data || []) {
          merged.push({
            ...a,
            classId: c.id,
            className: c.class_name,
          })
        }
      }
    }
    merged.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    rows.value = merged
  } finally {
    loading.value = false
  }
}

const resetForm = () => {
  editingId.value = null
  editingClassId.value = null
  form.classId = null
  form.title = ''
  form.content = ''
}

const openPublishDialog = () => {
  resetForm()
  if (filterClassId.value != null) form.classId = filterClassId.value
  dialogVisible.value = true
}

const openEditDialog = (row) => {
  editingId.value = row.id
  editingClassId.value = row.classId
  form.classId = row.classId
  form.title = row.title || ''
  form.content = row.content || ''
  dialogVisible.value = true
}

const save = async () => {
  if (!form.title?.trim()) {
    ElMessage.warning('请填写标题')
    return
  }
  saving.value = true
  try {
    if (editingId.value) {
      await updateClassAnnouncement(editingClassId.value, editingId.value, {
        title: form.title.trim(),
        content: form.content,
      })
      ElMessage.success('已保存')
    } else {
      if (!form.classId) {
        ElMessage.warning('请选择班级')
        saving.value = false
        return
      }
      await createClassAnnouncement(form.classId, {
        title: form.title.trim(),
        content: form.content,
      })
      ElMessage.success('已发布')
    }
    dialogVisible.value = false
    await loadAnnouncements()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

const removeRow = async (row) => {
  try {
    await ElMessageBox.confirm(`确定删除公告「${row.title}」？`, '确认', { type: 'warning' })
    await deleteClassAnnouncement(row.classId, row.id)
    ElMessage.success('已删除')
    await loadAnnouncements()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e?.response?.data?.message || '删除失败')
  }
}

function applyClassIdQuery(q) {
  if (q == null || q === '') {
    filterClassId.value = null
    return
  }
  const id = Number(q)
  if (Number.isFinite(id) && teacherClasses.value.some((c) => Number(c.id) === id)) {
    filterClassId.value = id
  } else {
    filterClassId.value = null
  }
}

onMounted(async () => {
  await loadClasses()
  applyClassIdQuery(route.query.classId)
  await loadAnnouncements()
})

watch(
  () => route.query.classId,
  async (q) => {
    if (!teacherClasses.value.length) return
    applyClassIdQuery(q)
    await loadAnnouncements()
  }
)
</script>

<style scoped>
.page-ann-mgmt {
  max-width: 1120px;
  margin: 0 auto;
  padding: 8px 4px 40px;
}

.page-head {
  margin-bottom: 22px;
  padding: 0 2px;
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
  color: var(--sg-text-secondary, #64748b);
  line-height: 1.6;
}

.module-card {
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: #fff;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 28px rgba(15, 76, 129, 0.06);
  margin-bottom: 20px;
  transition: box-shadow 0.25s ease;
}

.module-card:hover {
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.06), 0 16px 40px rgba(15, 76, 129, 0.08);
}

.module-card :deep(.el-card__body) {
  padding: 18px 20px;
}

.toolbar-card :deep(.el-card__body) {
  padding: 16px 20px;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 14px;
}

.toolbar-left {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.filter-label {
  font-size: 13px;
  font-weight: 600;
  color: #475569;
}

.class-filter {
  min-width: 240px;
}

.primary-btn {
  border-radius: 10px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.w-full {
  width: 100%;
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

.row-link {
  font-weight: 600;
}
</style>
