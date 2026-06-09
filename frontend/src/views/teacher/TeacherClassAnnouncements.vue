<template>
  <div class="tw-page ann-center">
    <header class="tw-head">
      <div>
        <h1 class="tw-title">班级公告</h1>
        <p class="tw-subtitle">
          向教学班或行政班发布实训通知、课程安排与考试提醒，学生端同步查看。
        </p>
      </div>
    </header>

    <section class="tw-metric-grid">
      <div v-for="card in summaryCards" :key="card.key" class="tw-metric-card">
        <div class="tw-metric-card__icon" :class="`tw-metric-card__icon--${card.tone}`">
          <el-icon><component :is="card.icon" /></el-icon>
        </div>
        <div class="tw-metric-card__body">
          <span class="tw-metric-card__value">{{ card.value }}</span>
          <span class="tw-metric-card__label">{{ card.label }}</span>
        </div>
      </div>
    </section>

    <section class="tw-panel ann-toolbar">
      <div class="ann-toolbar__row">
        <div class="ann-toolbar__filters">
          <span class="ann-toolbar__label">班级</span>
          <el-select
            v-model="filterClassId"
            placeholder="全部班级"
            clearable
            filterable
            class="ann-toolbar__select"
            @change="loadAnnouncements"
          >
            <el-option v-for="c in teacherClasses" :key="c.id" :label="classLabel(c)" :value="c.id" />
          </el-select>
          <el-input
            v-model="searchText"
            clearable
            placeholder="搜索公告标题"
            class="ann-toolbar__search"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
        </div>
        <el-button type="primary" class="ann-toolbar__publish" @click="openPublishDialog">
          <el-icon><Plus /></el-icon>
          发布公告
        </el-button>
      </div>
    </section>

    <section v-loading="loading" class="tw-panel ann-list-panel">
      <div class="tw-panel__header">
        <h2 class="tw-panel__title">公告列表</h2>
        <span class="tw-panel__meta">共 {{ displayRows.length }} 条</span>
      </div>
      <div class="tw-panel__body">
        <div v-if="!loading && !displayRows.length" class="ann-empty">
          <el-empty :image-size="96">
            <template #description>
              <h3 class="tw-empty-title">暂无班级公告</h3>
              <p class="tw-empty-desc">
                发布课程通知、实训安排或考试提醒后，学生可在班级公告中查看。
              </p>
            </template>
            <el-button type="primary" @click="openPublishDialog">发布公告</el-button>
          </el-empty>
        </div>

        <div v-else class="ann-card-list">
          <article v-for="row in displayRows" :key="`${row.classId}-${row.id}`" class="ann-card">
            <div class="ann-card__main">
              <div class="ann-card__head">
                <h3 class="ann-card__title" :title="row.title">{{ row.title }}</h3>
                <div class="ann-card__tags">
                  <el-tag v-if="isImportant(row)" size="small" type="danger" effect="plain">重要</el-tag>
                  <el-tag size="small" type="success" effect="plain">已发布</el-tag>
                </div>
              </div>
              <p v-if="excerpt(row)" class="ann-card__excerpt">{{ excerpt(row) }}</p>
              <div class="ann-card__meta">
                <span class="ann-card__class">
                  <el-icon><OfficeBuilding /></el-icon>
                  {{ row.className }}
                </span>
                <span class="ann-card__time">
                  <el-icon><Clock /></el-icon>
                  {{ formatDateTime(row.created_at) }}
                </span>
                <span v-if="row.teacher_name" class="ann-card__author">发布人：{{ row.teacher_name }}</span>
              </div>
            </div>
            <div class="ann-card__actions">
              <el-button type="primary" plain size="small" @click="openEditDialog(row)">编辑</el-button>
              <el-button type="danger" plain size="small" @click="removeRow(row)">删除</el-button>
            </div>
          </article>
        </div>
      </div>
    </section>

    <el-dialog
      v-model="dialogVisible"
      :title="editingId ? '编辑班级公告' : '发布班级公告'"
      width="640px"
      destroy-on-close
      class="ann-dialog"
      align-center
      @closed="resetForm"
    >
      <div class="ann-dialog__body">
        <el-form label-position="top" class="ann-form">
          <section v-if="!editingId" class="ann-form-section">
            <h3 class="ann-form-section__title">1. 发布对象</h3>
            <el-form-item label="班级选择" required>
              <el-select v-model="form.classId" placeholder="选择班级" filterable class="w-full">
                <el-option v-for="c in teacherClasses" :key="c.id" :label="classLabel(c)" :value="c.id" />
              </el-select>
            </el-form-item>
          </section>

          <section class="ann-form-section">
            <h3 class="ann-form-section__title">{{ editingId ? '1.' : '2.' }} 公告内容</h3>
            <el-form-item label="公告标题" required>
              <el-input
                v-model="form.title"
                maxlength="200"
                show-word-limit
                placeholder="请输入公告标题，例如「期末考试复习通知」"
              />
            </el-form-item>
            <el-form-item label="公告正文">
              <el-input
                v-model="form.content"
                type="textarea"
                :rows="8"
                placeholder="请输入公告内容，说明时间安排、任务要求或注意事项"
              />
            </el-form-item>
          </section>
        </el-form>
      </div>
      <template #footer>
        <div class="ann-dialog__footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="saving" @click="save">
            {{ editingId ? '保存修改' : '发布公告' }}
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search, Bell, Calendar, Warning, OfficeBuilding, Clock } from '@element-plus/icons-vue'
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
const searchText = ref('')
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

function isThisWeek(dateStr) {
  if (!dateStr) return false
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return false
  const now = new Date()
  const day = now.getDay()
  const mondayOffset = day === 0 ? -6 : 1 - day
  const monday = new Date(now)
  monday.setHours(0, 0, 0, 0)
  monday.setDate(now.getDate() + mondayOffset)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)
  return d >= monday && d <= sunday
}

function isImportant(row) {
  const text = `${row.title || ''}${row.content || ''}`
  return /重要|紧急/.test(text)
}

function excerpt(row) {
  const raw = String(row.content || '').replace(/\s+/g, ' ').trim()
  if (!raw) return ''
  return raw.length > 160 ? `${raw.slice(0, 160)}…` : raw
}

const displayRows = computed(() => {
  const q = searchText.value.trim().toLowerCase()
  if (!q) return rows.value
  return rows.value.filter((r) => (r.title || '').toLowerCase().includes(q))
})

const summaryCards = computed(() => {
  const list = rows.value
  const classIds = new Set(list.map((r) => r.classId))
  return [
    { key: 'total', label: '公告总数', value: list.length, icon: Bell, tone: 'blue' },
    {
      key: 'week',
      label: '本周发布',
      value: list.filter((r) => isThisWeek(r.created_at)).length,
      icon: Calendar,
      tone: 'teal',
    },
    {
      key: 'important',
      label: '重要公告',
      value: list.filter(isImportant).length,
      icon: Warning,
      tone: 'orange',
    },
    { key: 'classes', label: '覆盖班级', value: classIds.size, icon: OfficeBuilding, tone: 'slate' },
  ]
})

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
.ann-center {
  max-width: 1120px;
}

.ann-toolbar {
  padding: 0;
}

.ann-toolbar__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 16px 18px;
}

.ann-toolbar__filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.ann-toolbar__label {
  font-size: 13px;
  font-weight: 600;
  color: #475569;
  white-space: nowrap;
}

.ann-toolbar__select {
  width: 240px;
}

.ann-toolbar__search {
  width: min(100%, 280px);
}

.ann-toolbar__publish {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  flex-shrink: 0;
}

.ann-list-panel .tw-panel__body {
  padding-top: 8px;
}

.ann-empty {
  padding: 24px 12px 32px;
}

.ann-card-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ann-card {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
  background: #fff;
  border: 1px solid #e8edf3;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.ann-card:hover {
  border-color: #c9d8ef;
  box-shadow: 0 4px 14px rgba(15, 76, 129, 0.08);
}

.ann-card__main {
  flex: 1;
  min-width: 0;
}

.ann-card__head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}

.ann-card__title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.4;
  flex: 1;
  min-width: 0;
}

.ann-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex-shrink: 0;
}

.ann-card__excerpt {
  margin: 0 0 12px;
  font-size: 14px;
  line-height: 1.65;
  color: #64748b;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.ann-card__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
  font-size: 13px;
  color: #94a3b8;
}

.ann-card__class,
.ann-card__time {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.ann-card__author {
  font-size: 12px;
}

.ann-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  flex-shrink: 0;
}

.ann-dialog__body {
  max-height: min(62vh, 560px);
  overflow-y: auto;
  padding-right: 4px;
}

.ann-form-section {
  margin-bottom: 20px;
  padding-bottom: 8px;
  border-bottom: 1px solid #eef2f7;
}

.ann-form-section:last-child {
  border-bottom: none;
  margin-bottom: 0;
}

.ann-form-section__title {
  margin: 0 0 14px;
  font-size: 14px;
  font-weight: 700;
  color: #334155;
}

.ann-form :deep(.el-form-item__label) {
  font-weight: 600;
  color: #475569;
}

.ann-dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.w-full {
  width: 100%;
}
</style>

<style>
.ann-dialog .el-dialog__body {
  padding-top: 8px;
  padding-bottom: 8px;
}

.ann-dialog .el-dialog__footer {
  border-top: 1px solid #eef2f7;
  padding-top: 14px;
}
</style>
