<template>
  <div class="tw-page admin-teacher-page">
    <header class="tw-head">
      <div class="tw-head__left">
        <div>
          <h1 class="tw-title">教师账号管理</h1>
          <p class="tw-subtitle">
            维护教师登录账号、工号、学院部门与基础信息；教师负责班级关系请在「班级管理」中维护。
          </p>
        </div>
      </div>
      <div class="tw-head__actions">
        <el-button plain @click="importRecordsVisible = true">导入记录</el-button>
        <el-button plain @click="importVisible = true">批量导入</el-button>
        <el-button type="primary" @click="openCreate">
          <el-icon><Plus /></el-icon>
          添加教师
        </el-button>
      </div>
    </header>

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
            v-model="keyword"
            placeholder="搜索用户名 / 姓名 / 工号 / 邮箱 / 部门"
            clearable
            class="filter-toolbar__search"
            @keyup.enter="runSearch"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
          <el-select
            v-model="filterDepartment"
            placeholder="全部部门"
            clearable
            filterable
            class="filter-toolbar__select filter-toolbar__select--wide"
          >
            <el-option v-for="d in departmentOptions" :key="d" :label="d" :value="d" />
          </el-select>
          <el-select v-model="filterStatus" placeholder="全部状态" clearable class="filter-toolbar__select">
            <el-option label="正常" value="normal" />
            <el-option label="待首次改密" value="must_change" />
            <el-option label="缺少工号" value="missing_no" />
          </el-select>
          <el-button type="primary" plain @click="runSearch">筛选</el-button>
          <el-button v-if="hasActiveFilters" plain @click="resetFilters">重置</el-button>
        </div>
      </section>

      <section class="tw-panel">
        <div class="tw-panel__header">
          <h2 class="tw-panel__title">教师列表</h2>
          <span class="tw-panel__meta">共 {{ total }} 人</span>
        </div>

        <div v-if="!loading && !rows.length && !hasActiveFilters" class="tw-panel__body tw-empty-panel">
          <el-empty :image-size="96">
            <template #description>
              <h3 class="tw-empty-title">暂无教师账号</h3>
              <p class="tw-empty-desc">
                添加教师或通过 Excel 模板批量导入教师账号后，可在班级管理中为教师绑定负责班级，并在课程 / 教学班中配置任课关系。
              </p>
            </template>
          </el-empty>
          <div class="empty-actions">
            <el-button type="primary" @click="openCreate">添加教师</el-button>
            <el-button plain @click="importVisible = true">批量导入</el-button>
          </div>
        </div>

        <div v-else-if="!loading && !rows.length" class="tw-panel__body tw-empty-panel">
          <el-empty description="没有符合筛选条件的教师" :image-size="88" />
          <el-button plain @click="resetFilters">清除筛选</el-button>
        </div>

        <div v-else class="tw-panel__body tw-panel__body--flush table-wrap" v-loading="refreshing">
          <el-skeleton v-if="showSkeleton" animated :rows="8" />
          <template v-else>
            <el-table :data="rows" :size="tableSize" class="teacher-table" style="width: 100%">
              <el-table-column prop="username" label="用户名" min-width="120" show-overflow-tooltip />
              <el-table-column label="姓名 / 工号" min-width="150" show-overflow-tooltip>
                <template #default="{ row }">
                  <div class="name-cell">
                    <span class="name-cell__name">{{ row.real_name }}</span>
                    <span class="name-cell__no">{{ row.teacher_no || '—' }}</span>
                  </div>
                </template>
              </el-table-column>
              <el-table-column prop="email" label="邮箱" min-width="160" show-overflow-tooltip />
              <el-table-column prop="department" label="学院 / 部门" min-width="140" show-overflow-tooltip>
                <template #default="{ row }">{{ row.department || '—' }}</template>
              </el-table-column>
              <el-table-column prop="phone" label="电话号码" min-width="120" show-overflow-tooltip>
                <template #default="{ row }">{{ row.phone || '—' }}</template>
              </el-table-column>
              <el-table-column label="初始密码状态" width="120" align="center">
                <template #default="{ row }">
                  <el-tag
                    :type="Number(row.must_change_password) === 1 ? 'danger' : 'success'"
                    effect="plain"
                    size="small"
                  >
                    {{ Number(row.must_change_password) === 1 ? '待首次修改' : '已修改' }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="创建时间" width="168">
                <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
              </el-table-column>
              <el-table-column label="操作" width="200" align="right" fixed="right">
                <template #default="{ row }">
                  <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
                  <el-button link type="warning" @click="resetPassword(row)">重置密码</el-button>
                  <el-button link type="danger" @click="remove(row)">删除</el-button>
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
                @current-change="load"
                @size-change="onSizeChange"
              />
            </div>
          </template>
        </div>
      </section>

    <el-dialog
      :title="editing ? '编辑教师' : '添加教师'"
      v-model="dialogVisible"
      destroy-on-close
      width="540px"
    >
      <el-alert
        v-if="!editing"
        type="info"
        :closable="false"
        show-icon
        class="form-alert"
      >
        <template #title>
          <span>初始密码默认为工号，教师首次登录必须修改密码。</span>
        </template>
        <p class="form-alert-extra">教师负责班级关系请在「班级管理」中维护，不在此页面配置。</p>
      </el-alert>
      <el-form :model="form" label-width="96px" class="teacher-form">
        <el-form-item label="用户名" required>
          <el-input v-model="form.username" autocomplete="off" :disabled="!!editing" />
        </el-form-item>
        <el-form-item label="真实姓名" required>
          <el-input v-model="form.realName" />
        </el-form-item>
        <el-form-item label="工号" required>
          <el-input v-model="form.teacherNo" />
        </el-form-item>
        <el-form-item label="邮箱" required>
          <el-input v-model="form.email" />
        </el-form-item>
        <el-form-item label="学院 / 部门" required>
          <el-input v-model="form.department" />
        </el-form-item>
        <el-form-item label="电话号码">
          <el-input v-model="form.phone" placeholder="选填" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <TeacherImportDialog
      v-model="importVisible"
      @success="onImportSuccess"
      @open-records="openRecordsFromImport"
    />
    <TeacherImportRecordsDialog v-model="importRecordsVisible" />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onActivated } from 'vue'
import { Plus, Search, User, OfficeBuilding, Calendar, Lock, Warning } from '@element-plus/icons-vue'
import {
  getTeacherUsers,
  createTeacher,
  updateUser,
  deleteUser as apiDeleteUser,
  resetTeacherInitialPassword,
} from '../../api/user'
import { getTeacherAdminSummary } from '../../api/teacherImport'
import { useTableDensity } from '../../composables/useTableDensity'
import { formatDateTime } from '../../utils/format'
import { ElMessage, ElMessageBox } from 'element-plus'
import TeacherImportDialog from '../../components/admin/TeacherImportDialog.vue'
import TeacherImportRecordsDialog from '../../components/admin/TeacherImportRecordsDialog.vue'
import { usePageCacheStore } from '../../stores/pageCache'
import { useDelayedSkeleton } from '../../utils/useDelayedLoading'

const { tableSize } = useTableDensity()
const pageCache = usePageCacheStore()
const PAGE_CACHE_KEY = 'admin:teacher-users'

const cached = pageCache.get(PAGE_CACHE_KEY)
const rows = ref(cached?.rows ?? [])
const total = ref(cached?.total ?? 0)
const page = ref(1)
const pageSize = ref(10)
const keyword = ref('')
const appliedKeyword = ref('')
const filterDepartment = ref('')
const appliedDepartment = ref('')
const filterStatus = ref('')
const appliedStatus = ref('')
const loading = ref(!rows.value.length)
const refreshing = ref(false)
const showSkeleton = useDelayedSkeleton(computed(() => loading.value && !rows.value.length))
const summary = ref(cached?.summary ?? null)

const importVisible = ref(false)
const importRecordsVisible = ref(false)

const dialogVisible = ref(false)
const editing = ref(null)
const form = reactive({
  username: '',
  realName: '',
  teacherNo: '',
  email: '',
  department: '',
  phone: '',
})

const departmentOptions = computed(() => summary.value?.departments || [])

const hasActiveFilters = computed(
  () => !!(appliedKeyword.value || appliedDepartment.value || appliedStatus.value)
)

const overviewCards = computed(() => {
  const s = summary.value || {}
  return [
    { key: 'total', label: '教师总数', value: s.total ?? 0, icon: User, tone: 'blue' },
    {
      key: 'dept',
      label: '学院 / 部门数',
      value: s.departmentCount ?? 0,
      icon: OfficeBuilding,
      tone: 'teal',
    },
    { key: 'monthNew', label: '本月新增', value: s.monthNew ?? 0, icon: Calendar, tone: 'indigo' },
    {
      key: 'mustChange',
      label: '待首次改密',
      value: s.mustChangePassword ?? 0,
      icon: Lock,
      tone: 'violet',
    },
    {
      key: 'missingNo',
      label: '缺少工号',
      value: s.missingTeacherNo ?? 0,
      icon: Warning,
      tone: 'orange',
    },
  ]
})

const buildListParams = () => ({
  page: page.value,
  pageSize: pageSize.value,
  q: appliedKeyword.value || undefined,
  department: appliedDepartment.value || undefined,
  status: appliedStatus.value || undefined,
})

const loadSummary = async () => {
  try {
    const res = await getTeacherAdminSummary()
    if (res.success) summary.value = res.data
  } catch (e) {
    console.error(e)
  }
}

const load = async ({ background = false } = {}) => {
  const hasRows = rows.value.length > 0
  if (background && hasRows) refreshing.value = true
  else if (!hasRows) loading.value = true
  else refreshing.value = true
  try {
    const res = await getTeacherUsers(buildListParams())
    if (res.success) {
      rows.value = res.data || []
      total.value = res.total ?? 0
      pageCache.set(PAGE_CACHE_KEY, { rows: rows.value, total: total.value, summary: summary.value })
    }
  } catch (e) {
    console.error(e)
    if (!hasRows) ElMessage.error('加载失败')
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

const runSearch = () => {
  appliedKeyword.value = keyword.value.trim()
  appliedDepartment.value = filterDepartment.value
  appliedStatus.value = filterStatus.value
  page.value = 1
  load()
}

const resetFilters = () => {
  keyword.value = ''
  filterDepartment.value = ''
  filterStatus.value = ''
  appliedKeyword.value = ''
  appliedDepartment.value = ''
  appliedStatus.value = ''
  page.value = 1
  load()
}

const onSizeChange = () => {
  page.value = 1
  load()
}

const openCreate = () => {
  editing.value = null
  form.username = ''
  form.realName = ''
  form.teacherNo = ''
  form.email = ''
  form.department = ''
  form.phone = ''
  dialogVisible.value = true
}

const openEdit = (row) => {
  editing.value = row
  form.username = row.username
  form.realName = row.real_name
  form.teacherNo = row.teacher_no || ''
  form.email = row.email || ''
  form.department = row.department || ''
  form.phone = row.phone || ''
  dialogVisible.value = true
}

const save = async () => {
  if (!form.username || !form.realName || !form.teacherNo || !form.email || !form.department) {
    ElMessage.error('请填写用户名、真实姓名、工号、邮箱和学院 / 部门')
    return
  }
  try {
    if (editing.value) {
      await updateUser(editing.value.id, {
        username: form.username.trim(),
        realName: form.realName,
        teacherNo: form.teacherNo,
        email: form.email,
        department: form.department,
        phone: form.phone || null,
        classId: null,
      })
      ElMessage.success('已更新')
    } else {
      await createTeacher({
        username: form.username.trim(),
        realName: form.realName,
        teacherNo: form.teacherNo.trim(),
        email: form.email.trim(),
        department: form.department.trim(),
        phone: form.phone.trim() || null,
      })
      ElMessage.success('已创建，初始密码为工号')
    }
    dialogVisible.value = false
    await Promise.all([load(), loadSummary()])
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '保存失败')
  }
}

const resetPassword = async (row) => {
  try {
    await ElMessageBox.confirm(
      `将把「${row.real_name}」的密码重置为工号，并标记为待首次修改密码。确定继续？`,
      '重置初始密码',
      { type: 'warning' }
    )
    await resetTeacherInitialPassword(row.id)
    ElMessage.success('已重置为工号初始密码')
    await Promise.all([load(), loadSummary()])
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e?.response?.data?.message || '重置失败')
  }
}

const remove = async (row) => {
  try {
    await ElMessageBox.confirm(`确定删除教师「${row.real_name}」？`, '确认删除', { type: 'warning' })
    await apiDeleteUser(row.id)
    ElMessage.success('已删除')
    await Promise.all([load(), loadSummary()])
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e?.response?.data?.message || '删除失败')
  }
}

const onImportSuccess = async () => {
  await Promise.all([load(), loadSummary()])
}

const openRecordsFromImport = () => {
  importVisible.value = false
  importRecordsVisible.value = true
}

onMounted(async () => {
  await Promise.all([loadSummary(), load({ background: pageCache.has(PAGE_CACHE_KEY) })])
})

onActivated(() => {
  Promise.all([loadSummary(), load({ background: true })])
})
</script>

<style scoped>
.admin-teacher-page {
  max-width: 1400px;
}

.filter-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.filter-toolbar__search {
  width: min(100%, 320px);
}

.filter-toolbar__select {
  width: 140px;
}

.filter-toolbar__select--wide {
  width: 180px;
}

.table-wrap {
  overflow: hidden;
}

.teacher-table {
  --el-table-border-color: #eef2f7;
  --el-table-header-bg-color: #f8fafc;
}

.teacher-table :deep(.el-table__header th) {
  font-weight: 600;
}

.name-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.name-cell__name {
  font-weight: 500;
  color: #1e293b;
}

.name-cell__no {
  font-size: 12px;
  color: #94a3b8;
}

.pager-wrap {
  margin-top: 16px;
  padding: 0 16px 16px;
  display: flex;
  justify-content: flex-end;
}

.empty-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
}

.form-alert {
  margin-bottom: 16px;
}

.form-alert-extra {
  margin: 6px 0 0;
  font-size: 13px;
  color: #64748b;
}

.teacher-form {
  margin-top: 4px;
}
</style>
