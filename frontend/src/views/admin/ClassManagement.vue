<template>
  <div class="tw-page admin-class-page">
    <header class="tw-head">
      <div class="tw-head__left">
        <div>
          <h1 class="tw-title">班级管理</h1>
          <p class="tw-subtitle">
            维护行政班基础信息、专业年级与负责教师，为学生归属、任务发布和班级统计提供数据基础。
          </p>
          <p class="tw-sub">
            指定负责教师后，该教师可在教师工作台查看本班并进行公告、任务与班级管理。
          </p>
        </div>
      </div>
      <div class="tw-head__actions">
        <el-button type="primary" @click="openAddModal">
          <el-icon><Plus /></el-icon>
          添加班级
        </el-button>
      </div>
    </header>

    <el-skeleton v-if="loading" animated :rows="10" />

    <template v-else>
      <section class="tw-metric-grid">
        <div v-for="card in overviewCards" :key="card.key" class="tw-metric-card">
          <div class="tw-metric-card__icon" :class="`tw-metric-card__icon--${card.tone}`">
            <el-icon><component :is="card.icon" /></el-icon>
          </div>
          <div class="tw-metric-card__body">
            <span class="tw-metric-card__label">{{ card.label }}</span>
            <span class="tw-metric-card__value">{{ card.value }}</span>
          </div>
        </div>
      </section>

      <section class="tw-panel tw-filter-bar">
        <div class="filter-toolbar">
          <el-input
            v-model="filterKeyword"
            placeholder="搜索班级名称、专业、负责教师"
            clearable
            class="filter-toolbar__search"
            @keyup.enter="applyFilters"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
          <el-select v-model="filterMajor" placeholder="专业" clearable filterable class="filter-toolbar__select">
            <el-option v-for="m in majorOptions" :key="m" :label="m" :value="m" />
          </el-select>
          <el-select v-model="filterGrade" placeholder="年级" clearable filterable class="filter-toolbar__select">
            <el-option v-for="g in gradeOptions" :key="g" :label="g" :value="g" />
          </el-select>
          <el-select v-model="filterTeacher" placeholder="负责教师" clearable filterable class="filter-toolbar__select">
            <el-option label="未绑定负责教师" value="__none__" />
            <el-option
              v-for="t in teacherFilterOptions"
              :key="t.id"
              :label="t.name"
              :value="String(t.id)"
            />
          </el-select>
          <el-button type="primary" plain @click="applyFilters">筛选</el-button>
          <el-button v-if="hasActiveFilters" plain @click="resetFilters">重置</el-button>
        </div>
      </section>

      <section class="tw-panel">
        <div class="tw-panel__header">
          <h2 class="tw-panel__title">行政班列表</h2>
          <span class="tw-panel__meta">
            共 {{ classes.length }} 个行政班
            <template v-if="hasActiveFilters"> · 当前显示 {{ filteredClasses.length }} 个</template>
          </span>
        </div>

        <div v-if="!classes.length" class="tw-panel__body tw-empty-panel">
          <el-empty :image-size="96">
            <template #description>
              <h3 class="tw-empty-title">暂无行政班</h3>
              <p class="tw-empty-desc">
                添加行政班后，可为学生账号分配班级，并绑定负责教师开展班级管理。
              </p>
            </template>
          </el-empty>
          <el-button type="primary" @click="openAddModal">添加班级</el-button>
        </div>

        <div v-else-if="!filteredClasses.length" class="tw-panel__body tw-empty-panel">
          <el-empty description="没有符合筛选条件的行政班" :image-size="88" />
          <el-button plain @click="resetFilters">清除筛选</el-button>
        </div>

        <div v-else class="tw-panel__body tw-panel__body--flush table-wrap">
          <el-table :data="filteredClasses" :size="tableSize" class="class-table" style="width: 100%">
            <el-table-column prop="class_name" label="班级名称" min-width="150" show-overflow-tooltip>
              <template #default="{ row }">
                <span class="class-name">{{ row.class_name }}</span>
              </template>
            </el-table-column>
            <el-table-column label="专业 / 年级" min-width="160" show-overflow-tooltip>
              <template #default="{ row }">
                <span v-if="row.major || row.grade" class="major-grade">
                  {{ [row.major, row.grade].filter(Boolean).join(' · ') }}
                </span>
                <span v-else class="tw-text-muted">—</span>
              </template>
            </el-table-column>
            <el-table-column label="负责教师" min-width="140">
              <template #default="{ row }">
                <el-tag v-if="row.teacher_name" type="primary" effect="plain" size="small">
                  {{ row.teacher_name }}
                </el-tag>
                <el-tag v-else type="warning" effect="plain" size="small">未绑定负责教师</el-tag>
              </template>
            </el-table-column>
            <el-table-column v-if="hasStudentStats" label="学生数" width="96" align="center">
              <template #default="{ row }">
                {{ row.studentCount ?? 0 }}
              </template>
            </el-table-column>
            <el-table-column label="创建时间" width="176">
              <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
            </el-table-column>
            <el-table-column label="状态" width="88" align="center">
              <template #default>
                <el-tag type="success" effect="plain" size="small">正常</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="140" align="right" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" @click="editClass(row)">编辑</el-button>
                <el-button link type="danger" @click="deleteClass(row.id)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </section>
    </template>

    <el-dialog
      v-model="showAddModal"
      :title="editingClass ? '编辑行政班' : '添加行政班'"
      width="560px"
      destroy-on-close
      @closed="onDialogClosed"
    >
      <el-form :model="form" label-width="96px" class="class-form">
        <div class="form-section">
          <h3 class="form-section__title">基础信息</h3>
          <el-form-item label="班级名称" required>
            <el-input v-model="form.className" placeholder="如：软件2101班" />
          </el-form-item>
          <el-form-item label="专业">
            <el-input v-model="form.major" placeholder="如：软件工程" />
          </el-form-item>
          <el-form-item label="年级">
            <el-input v-model="form.grade" placeholder="如：2021" />
          </el-form-item>
        </div>
        <div class="form-section">
          <h3 class="form-section__title">管理配置</h3>
          <el-form-item label="负责教师">
            <el-select
              v-model="form.teacherId"
              placeholder="选择负责教师"
              filterable
              clearable
              style="width: 100%"
            >
              <el-option
                v-for="teacher in teachers"
                :key="teacher.id"
                :label="`${teacher.real_name}（${teacher.username}）`"
                :value="teacher.id"
              />
            </el-select>
            <p class="form-hint">
              指定后，该教师可在教师工作台查看本班，并进行公告、任务与班级管理。
            </p>
          </el-form-item>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="showAddModal = false">取消</el-button>
        <el-button type="primary" @click="saveClass">
          {{ editingClass ? '保存修改' : '保存班级' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import {
  OfficeBuilding,
  Collection,
  Calendar,
  User,
  Avatar,
  Plus,
  Search,
} from '@element-plus/icons-vue'
import { getAllClasses, createClass, updateClass, deleteClass as apiDeleteClass } from '../../api/class'
import { getAllClassStatistics } from '../../api/dashboard'
import { getAllUsers } from '../../api/user'
import { useTableDensity } from '../../composables/useTableDensity'
import { formatDateTime } from '../../utils/format'
import { ElMessage, ElMessageBox } from 'element-plus'

const { tableSize } = useTableDensity()

const classes = ref([])
const teachers = ref([])
const statsMap = ref({})
const hasStudentStats = ref(false)
const loading = ref(true)
const showAddModal = ref(false)
const editingClass = ref(null)

const filterKeyword = ref('')
const appliedKeyword = ref('')
const filterMajor = ref('')
const filterGrade = ref('')
const filterTeacher = ref('')

const form = reactive({
  className: '',
  major: '',
  grade: '',
  teacherId: '',
})

const majorOptions = computed(() =>
  [...new Set(classes.value.map((c) => c.major).filter(Boolean))].sort()
)

const gradeOptions = computed(() =>
  [...new Set(classes.value.map((c) => c.grade).filter(Boolean))].sort()
)

const teacherFilterOptions = computed(() => {
  const map = new Map()
  classes.value.forEach((c) => {
    if (c.teacher_id && c.teacher_name) {
      map.set(c.teacher_id, c.teacher_name)
    }
  })
  return [...map.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
})

const enrichedClasses = computed(() =>
  classes.value.map((c) => ({
    ...c,
    studentCount: hasStudentStats.value
      ? Number(statsMap.value[c.id]?.studentCount) || 0
      : null,
  }))
)

const filteredClasses = computed(() => {
  const kw = appliedKeyword.value.trim().toLowerCase()
  return enrichedClasses.value.filter((c) => {
    if (filterMajor.value && c.major !== filterMajor.value) return false
    if (filterGrade.value && c.grade !== filterGrade.value) return false
    if (filterTeacher.value) {
      if (filterTeacher.value === '__none__' && c.teacher_id) return false
      if (filterTeacher.value !== '__none__' && String(c.teacher_id) !== filterTeacher.value) {
        return false
      }
    }
    if (!kw) return true
    const hay = [c.class_name, c.major, c.grade, c.teacher_name]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return hay.includes(kw)
  })
})

const hasActiveFilters = computed(
  () =>
    Boolean(appliedKeyword.value.trim()) ||
    Boolean(filterMajor.value) ||
    Boolean(filterGrade.value) ||
    Boolean(filterTeacher.value)
)

const overviewStats = computed(() => {
  const list = classes.value
  const majors = new Set(list.map((c) => c.major).filter(Boolean))
  const grades = new Set(list.map((c) => c.grade).filter(Boolean))
  const boundTeachers = list.filter((c) => c.teacher_id).length
  let totalStudents = null
  if (hasStudentStats.value) {
    totalStudents = list.reduce(
      (sum, c) => sum + (Number(statsMap.value[c.id]?.studentCount) || 0),
      0
    )
  }
  return {
    total: list.length,
    majorCount: majors.size,
    gradeCount: grades.size,
    boundTeachers,
    totalStudents,
  }
})

const overviewCards = computed(() => {
  const s = overviewStats.value
  const cards = [
    { key: 'total', label: '行政班总数', value: s.total, icon: OfficeBuilding, tone: 'blue' },
    { key: 'major', label: '专业数量', value: s.majorCount, icon: Collection, tone: 'indigo' },
    { key: 'grade', label: '年级数量', value: s.gradeCount, icon: Calendar, tone: 'teal' },
    {
      key: 'teacher',
      label: '已绑定负责教师',
      value: s.boundTeachers,
      icon: User,
      tone: 'violet',
    },
  ]
  if (s.totalStudents != null) {
    cards.push({
      key: 'students',
      label: '学生总数',
      value: s.totalStudents,
      icon: Avatar,
      tone: 'orange',
    })
  }
  return cards
})

const applyFilters = () => {
  appliedKeyword.value = filterKeyword.value.trim()
}

const resetFilters = () => {
  filterKeyword.value = ''
  appliedKeyword.value = ''
  filterMajor.value = ''
  filterGrade.value = ''
  filterTeacher.value = ''
}

const loadClasses = async () => {
  try {
    const response = await getAllClasses()
    if (response.success) {
      classes.value = response.data || []
    }
  } catch (error) {
    console.error('获取班级列表失败:', error)
    ElMessage.error('加载班级列表失败')
  }
}

const loadClassStats = async () => {
  try {
    const res = await getAllClassStatistics()
    if (res.success) {
      const map = {}
      for (const row of res.data || []) {
        map[row.id] = row
      }
      statsMap.value = map
      hasStudentStats.value = true
    }
  } catch {
    hasStudentStats.value = false
  }
}

const loadTeachers = async () => {
  try {
    const response = await getAllUsers()
    if (response.success) {
      teachers.value = response.data.filter((u) => u.role === 'teacher')
    }
  } catch (error) {
    console.error('获取教师列表失败:', error)
  }
}

const openAddModal = () => {
  editingClass.value = null
  form.className = ''
  form.major = ''
  form.grade = ''
  form.teacherId = ''
  showAddModal.value = true
}

const onDialogClosed = () => {
  editingClass.value = null
}

const editClass = (cls) => {
  editingClass.value = cls
  form.className = cls.class_name
  form.major = cls.major || ''
  form.grade = cls.grade || ''
  form.teacherId = cls.teacher_id || ''
  showAddModal.value = true
}

const saveClass = async () => {
  if (!form.className.trim()) {
    ElMessage.error('请输入班级名称')
    return
  }
  if (!form.teacherId) {
    try {
      await ElMessageBox.confirm(
        '尚未选择负责教师，保存后该班级不会出现在任何教师工作台。是否仍要保存？',
        '提示',
        { type: 'warning', confirmButtonText: '仍要保存', cancelButtonText: '返回填写' }
      )
    } catch {
      return
    }
  }

  try {
    const payload = {
      className: form.className.trim(),
      major: form.major.trim(),
      grade: form.grade.trim(),
      teacherId: form.teacherId || null,
    }
    if (editingClass.value) {
      await updateClass(editingClass.value.id, payload)
      ElMessage.success('更新成功')
    } else {
      await createClass(payload)
      ElMessage.success('创建成功')
    }
    showAddModal.value = false
    editingClass.value = null
    form.className = ''
    form.major = ''
    form.grade = ''
    form.teacherId = ''
    await refreshData()
  } catch (error) {
    ElMessage.error('操作失败')
    console.error(error)
  }
}

const deleteClass = async (id) => {
  try {
    await ElMessageBox.confirm(
      '删除后可能影响学生归属、任务发布和统计数据。若班级已有学生或任务，建议谨慎操作。',
      '确认删除该班级？',
      {
        type: 'warning',
        confirmButtonText: '确认删除',
        cancelButtonText: '取消',
        confirmButtonClass: 'el-button--danger',
      }
    )
  } catch {
    return
  }

  try {
    await apiDeleteClass(id)
    ElMessage.success('删除成功')
    await refreshData()
  } catch (error) {
    ElMessage.error('删除失败')
    console.error(error)
  }
}

const refreshData = async () => {
  await Promise.all([loadClasses(), loadClassStats()])
}

onMounted(async () => {
  loading.value = true
  try {
    await Promise.all([loadClasses(), loadClassStats(), loadTeachers()])
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.admin-class-page {
  max-width: 1400px;
}

.filter-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.filter-toolbar__search {
  width: min(100%, 280px);
}

.filter-toolbar__select {
  width: 140px;
}

.table-wrap {
  overflow: hidden;
}

.class-table {
  --el-table-border-color: #eef2f7;
  --el-table-header-bg-color: #f8fafc;
}

.class-table :deep(.el-table__header th) {
  font-weight: 600;
  color: #475569;
}

.class-table :deep(.el-table__row td) {
  padding-top: 14px;
  padding-bottom: 14px;
}

.class-name {
  font-weight: 600;
  color: #0f172a;
}

.major-grade {
  color: #475569;
  font-size: 13px;
}

.form-section + .form-section {
  margin-top: 8px;
  padding-top: 16px;
  border-top: 1px solid #eef2f7;
}

.form-section__title {
  margin: 0 0 16px;
  font-size: 14px;
  font-weight: 700;
  color: #334155;
}

.form-hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.55;
}
</style>
