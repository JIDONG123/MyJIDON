<template>
  <div class="page-detail">
    <header class="page-head">
      <el-button plain @click="goBack">返回</el-button>
      <h1 class="page-title">{{ detail?.class_name || '教学班详情' }}</h1>
      <div v-if="isAdmin" class="head-actions">
        <el-button type="primary" plain size="small" @click="openTeachers">管理教师</el-button>
        <el-button type="danger" plain size="small" @click="removeTc">删除教学班</el-button>
      </div>
    </header>

    <el-skeleton v-if="loading" animated :rows="6" />
    <template v-else-if="detail">
      <el-descriptions :column="2" border class="desc-block">
        <el-descriptions-item label="课程">{{ detail.course_name }}</el-descriptions-item>
        <el-descriptions-item label="学期">{{ detail.term_name }}</el-descriptions-item>
        <el-descriptions-item label="班代码">{{ detail.class_code }}</el-descriptions-item>
        <el-descriptions-item label="地点">{{ detail.location || '—' }}</el-descriptions-item>
      </el-descriptions>

      <el-card shadow="never" class="section-card">
        <template #header>
          <div class="card-head">
            <span>学生名单（{{ detail.students?.length || 0 }}）</span>
            <el-button type="primary" size="small" @click="openAddStudents">添加学生</el-button>
          </div>
        </template>
        <el-table :data="detail.students || []" border size="small">
          <el-table-column prop="real_name" label="姓名" />
          <el-table-column prop="student_no" label="学号" />
          <el-table-column prop="source_class_name" label="来源行政班" />
        </el-table>
      </el-card>

      <el-card shadow="never" class="section-card">
        <template #header>
          <div class="card-head">
            <span>任课教师</span>
            <el-button v-if="isAdmin" link type="primary" @click="openTeachers">编辑</el-button>
          </div>
        </template>
        <el-tag v-for="t in detail.teachers || []" :key="t.teacher_id" class="tag-item">
          {{ t.real_name }}（{{ t.role === 'lead' ? '主讲' : '协同' }}）
        </el-tag>
      </el-card>
    </template>

    <el-dialog v-model="showPick" title="添加学生" width="680px" destroy-on-close @opened="onPickOpened">
      <p class="pick-hint">
        可从学校任意行政班勾选学生，或切换到「未分班学生」添加尚未归属行政班的学生。已在教学班内的学生会自动禁用勾选。
      </p>
      <div class="pick-toolbar">
        <el-select
          v-model="sourceClassId"
          filterable
          clearable
          placeholder="选择来源"
          style="width: 240px"
          @change="onSourceClassChange"
        >
          <el-option label="未分班学生" :value="UNASSIGNED_CLASS" />
          <el-option
            v-for="c in classOptions"
            :key="c.id"
            :label="c.class_name"
            :value="c.id"
          />
        </el-select>
        <el-input
          v-model="studentSearch"
          placeholder="姓名 / 学号 / 用户名"
          clearable
          style="flex: 1"
          @keyup.enter="loadCandidates"
        />
        <el-button type="primary" :loading="candLoading" @click="loadCandidates">搜索</el-button>
      </div>
      <el-table
        ref="candTableRef"
        v-loading="candLoading"
        :data="candidates"
        row-key="id"
        max-height="320"
        border
        size="small"
        @selection-change="onCandSelectionChange"
      >
        <el-table-column type="selection" width="48" :selectable="rowSelectable" />
        <el-table-column prop="real_name" label="姓名" width="100" />
        <el-table-column prop="student_no" label="学号" width="120">
          <template #default="{ row }">{{ row.student_no || '—' }}</template>
        </el-table-column>
        <el-table-column prop="username" label="用户名" width="120" />
        <el-table-column prop="class_name" label="行政班" min-width="120">
          <template #default="{ row }">{{ row.class_name || '未分班' }}</template>
        </el-table-column>
      </el-table>
      <div class="pick-footer-meta">
        已在本班 {{ existingCount }} 人 · 本次新选 {{ newPickCount }} 人
      </div>
      <template #footer>
        <el-button @click="showPick = false">取消</el-button>
        <el-button type="primary" :disabled="!newPickCount" @click="saveStudents">加入所选</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showTeachers" title="教学班教师" width="520px" destroy-on-close>
      <div v-for="(row, idx) in teacherRows" :key="idx" class="teacher-row">
        <el-select v-model="row.teacherId" filterable placeholder="选择教师" style="flex: 1">
          <el-option v-for="t in teacherOptions" :key="t.id" :label="t.real_name" :value="t.id" />
        </el-select>
        <el-select v-model="row.role" style="width: 120px; margin-left: 8px">
          <el-option label="主讲" value="lead" />
          <el-option label="协同" value="assistant" />
        </el-select>
        <el-button link type="danger" @click="teacherRows.splice(idx, 1)">移除</el-button>
      </div>
      <el-button type="primary" link @click="teacherRows.push({ teacherId: null, role: 'assistant' })">
        + 添加教师
      </el-button>
      <template #footer>
        <el-button @click="showTeachers = false">取消</el-button>
        <el-button type="primary" @click="saveTeachers">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  getTeachingClass,
  setTeachingClassStudents,
  setTeachingClassTeachers,
  deleteTeachingClass,
} from '../../api/teachingClass'
import { pickStudents, getTeacherUsers } from '../../api/user'
import { getPublicClassNames } from '../../api/class'
import { useUserStore } from '../../stores/user'
import { ElMessage, ElMessageBox } from 'element-plus'

/** 下拉「未分班学生」哨兵值（非真实 class id） */
const UNASSIGNED_CLASS = '__unassigned__'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const isAdmin = computed(() => userStore.user?.role === 'admin')

const loading = ref(true)
const detail = ref(null)
const showPick = ref(false)
const classOptions = ref([])
const sourceClassId = ref(null)
const studentSearch = ref('')
const candidates = ref([])
const candLoading = ref(false)
const candTableRef = ref(null)
const newSelectedRows = ref([])
const showTeachers = ref(false)
const teacherRows = ref([])
const teacherOptions = ref([])

const existingStudentIds = computed(
  () => new Set((detail.value?.students || []).map((s) => s.student_id))
)
const existingCount = computed(() => detail.value?.students?.length || 0)
const newPickCount = computed(() => newSelectedRows.value.length)

const goBack = () => {
  if (isAdmin.value) router.push('/admin/curriculum?tab=teaching-classes')
  else router.back()
}

const load = async () => {
  loading.value = true
  try {
    const res = await getTeachingClass(route.params.id)
    if (res.success) detail.value = res.data
  } finally {
    loading.value = false
  }
}

const loadClassOptions = async () => {
  if (classOptions.value.length) return
  const res = await getPublicClassNames()
  if (res.success) classOptions.value = res.data || []
}

const rowSelectable = (row) => !existingStudentIds.value.has(row.id)

const onCandSelectionChange = (rows) => {
  newSelectedRows.value = rows || []
}

const loadCandidates = async () => {
  if (!sourceClassId.value) {
    ElMessage.warning('请先选择行政班或「未分班学生」')
    return
  }
  candLoading.value = true
  try {
    const params = { pageSize: 100 }
    const q = studentSearch.value.trim()
    if (q) params.q = q
    if (sourceClassId.value !== UNASSIGNED_CLASS) {
      params.classId = sourceClassId.value
    }
    const res = await pickStudents(params)
    candidates.value = res.success ? res.data || [] : []
    await nextTick()
    candTableRef.value?.clearSelection()
    newSelectedRows.value = []
  } catch (e) {
    candidates.value = []
    ElMessage.error(e?.response?.data?.message || '加载学生失败')
  } finally {
    candLoading.value = false
  }
}

const onSourceClassChange = () => {
  studentSearch.value = ''
  candidates.value = []
  newSelectedRows.value = []
  candTableRef.value?.clearSelection()
  if (sourceClassId.value) loadCandidates()
}

const onPickOpened = async () => {
  await loadClassOptions()
  sourceClassId.value = UNASSIGNED_CLASS
  studentSearch.value = ''
  candidates.value = []
  newSelectedRows.value = []
  loadCandidates()
}

const openAddStudents = () => {
  showPick.value = true
}

const saveStudents = async () => {
  if (!newSelectedRows.value.length) {
    ElMessage.warning('请勾选要加入的学生')
    return
  }
  const existing = (detail.value?.students || []).map((s) => ({
    studentId: s.student_id,
    sourceClassId: s.source_class_id || null,
  }))
  const adding = newSelectedRows.value.map((row) => ({
    studentId: row.id,
    sourceClassId:
      row.class_id ||
      (sourceClassId.value !== UNASSIGNED_CLASS ? sourceClassId.value : null) ||
      null,
  }))
  const merged = [...existing]
  const seen = new Set(existing.map((s) => s.studentId))
  for (const row of adding) {
    if (seen.has(row.studentId)) continue
    seen.add(row.studentId)
    merged.push(row)
  }
  try {
    await setTeachingClassStudents(route.params.id, merged)
    ElMessage.success(`已加入 ${adding.length} 名学生`)
    showPick.value = false
    load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '保存失败')
  }
}

const openTeachers = async () => {
  if (!teacherOptions.value.length) {
    const res = await getTeacherUsers({ pageSize: 200 })
    if (res.success) teacherOptions.value = res.data || []
  }
  teacherRows.value = (detail.value?.teachers || []).map((t) => ({
    teacherId: t.teacher_id,
    role: t.role === 'lead' ? 'lead' : 'assistant',
  }))
  if (!teacherRows.value.length) {
    teacherRows.value = [{ teacherId: null, role: 'lead' }]
  }
  showTeachers.value = true
}

const saveTeachers = async () => {
  const teachers = teacherRows.value
    .filter((r) => r.teacherId)
    .map((r) => ({ teacherId: r.teacherId, role: r.role }))
  if (!teachers.some((t) => t.role === 'lead')) {
    ElMessage.warning('请至少指定一名主讲教师')
    return
  }
  try {
    await setTeachingClassTeachers(route.params.id, teachers)
    ElMessage.success('教师已更新')
    showTeachers.value = false
    load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '保存失败')
  }
}

const removeTc = async () => {
  await ElMessageBox.confirm('确定删除该教学班？', '提示', { type: 'warning' })
  try {
    await deleteTeachingClass(route.params.id)
    ElMessage.success('已删除')
    goBack()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '删除失败')
  }
}

onMounted(() => {
  userStore.loadUserFromStorage()
  load()
})
</script>

<style scoped>
.page-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.page-title { margin: 0; font-size: 20px; font-weight: 600; flex: 1; }
.head-actions { display: flex; gap: 8px; margin-left: auto; }
.desc-block { margin-bottom: 16px; }
.section-card { margin-bottom: 16px; border-radius: var(--sg-radius-lg); }
.card-head { display: flex; justify-content: space-between; align-items: center; }
.tag-item { margin-right: 8px; margin-bottom: 4px; }
.teacher-row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.pick-hint { margin: 0 0 12px; font-size: 13px; color: var(--sg-text-secondary); }
.pick-toolbar { display: flex; gap: 8px; margin-bottom: 12px; align-items: center; }
.pick-footer-meta { margin-top: 10px; font-size: 13px; color: var(--sg-text-secondary); }
</style>
