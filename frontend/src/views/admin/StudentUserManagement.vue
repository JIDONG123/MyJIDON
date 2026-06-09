<template>
  <div class="tw-page admin-student-page">
    <header class="tw-head">
      <div class="tw-head__left">
        <div>
          <h1 class="tw-title">学生账号管理</h1>
          <p class="tw-subtitle">
            维护学生登录账号、班级归属与基础信息，支持单个新增和 Excel 批量导入。
          </p>
        </div>
      </div>
      <div class="tw-head__actions">
        <el-button plain @click="importRecordsVisible = true">导入记录</el-button>
        <el-button plain @click="importVisible = true">批量导入</el-button>
        <el-button type="primary" @click="openCreate">
          <el-icon><Plus /></el-icon>
          添加学生
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
            placeholder="搜索用户名 / 姓名 / 学号 / 电话 / 邮箱"
            clearable
            class="filter-toolbar__search"
            @keyup.enter="runSearch"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
          <el-select
            v-model="filterClassId"
            placeholder="全部班级"
            clearable
            filterable
            class="filter-toolbar__select filter-toolbar__select--wide"
          >
            <el-option label="未分配班级" value="__none__" />
            <el-option v-for="c in classes" :key="c.id" :label="c.class_name" :value="String(c.id)" />
          </el-select>
          <el-select v-model="filterStatus" placeholder="全部状态" clearable class="filter-toolbar__select">
            <el-option label="正常（已分配班级）" value="assigned" />
            <el-option label="未分配班级" value="unassigned" />
            <el-option label="待首次改密" value="must_change" />
          </el-select>
          <el-button type="primary" plain @click="runSearch">筛选</el-button>
          <el-button v-if="hasActiveFilters" plain @click="resetFilters">重置</el-button>
        </div>
      </section>

      <section class="tw-panel">
        <div class="tw-panel__header">
          <h2 class="tw-panel__title">学生列表</h2>
          <span class="tw-panel__meta">共 {{ total }} 人</span>
        </div>

        <div v-if="!loading && !rows.length && !hasActiveFilters" class="tw-panel__body tw-empty-panel">
          <el-empty :image-size="96">
            <template #description>
              <h3 class="tw-empty-title">暂无学生账号</h3>
              <p class="tw-empty-desc">
                添加学生或通过 Excel 模板批量导入学生账号后，学生可登录系统参与实训任务、在线实训和测评。
              </p>
            </template>
          </el-empty>
          <div class="empty-actions">
            <el-button type="primary" @click="openCreate">添加学生</el-button>
            <el-button plain @click="importVisible = true">批量导入</el-button>
          </div>
        </div>

        <div v-else-if="!loading && !rows.length" class="tw-panel__body tw-empty-panel">
          <el-empty description="没有符合筛选条件的学生" :image-size="88" />
          <el-button plain @click="resetFilters">清除筛选</el-button>
        </div>

        <div v-else class="tw-panel__body tw-panel__body--flush table-wrap" v-loading="refreshing">
          <el-skeleton v-if="showSkeleton" animated :rows="8" />
          <template v-else>
            <el-table :data="rows" :size="tableSize" class="student-table" style="width: 100%">
              <el-table-column prop="username" label="用户名" min-width="120" show-overflow-tooltip />
              <el-table-column label="姓名 / 学号" min-width="150" show-overflow-tooltip>
                <template #default="{ row }">
                  <div class="name-cell">
                    <span class="name-cell__name">{{ row.real_name }}</span>
                    <span class="name-cell__no">{{ row.student_no || '—' }}</span>
                  </div>
                </template>
              </el-table-column>
              <el-table-column prop="phone" label="电话号码" min-width="120" show-overflow-tooltip>
                <template #default="{ row }">{{ row.phone || '—' }}</template>
              </el-table-column>
              <el-table-column prop="email" label="邮箱" min-width="160" show-overflow-tooltip />
              <el-table-column label="班级" min-width="130">
                <template #default="{ row }">
                  <el-tag v-if="row.class_name" type="primary" effect="plain" size="small">
                    {{ row.class_name }}
                  </el-tag>
                  <el-tag v-else type="warning" effect="plain" size="small">未分配班级</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="账号状态" width="110" align="center">
                <template #default="{ row }">
                  <el-tag
                    :type="row.class_id ? 'success' : 'warning'"
                    effect="plain"
                    size="small"
                  >
                    {{ row.class_id ? '正常' : '未分配班级' }}
                  </el-tag>
                </template>
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
      :title="editing ? '编辑学生' : '添加学生'"
      v-model="dialogVisible"
      destroy-on-close
      width="540px"
    >
      <el-alert
        v-if="!editing"
        type="info"
        :closable="false"
        show-icon
        title="初始密码默认为学号，学生首次登录必须修改密码。"
        class="form-alert"
      />
      <el-form :model="form" label-width="96px" class="student-form">
        <el-form-item label="用户名" required>
          <el-input v-model="form.username" autocomplete="off" :disabled="!!editing" />
        </el-form-item>
        <el-form-item label="真实姓名" required>
          <el-input v-model="form.realName" />
        </el-form-item>
        <el-form-item label="学号" required>
          <el-input v-model="form.studentNo" />
        </el-form-item>
        <el-form-item label="电话号码" required>
          <el-input v-model="form.phone" />
        </el-form-item>
        <el-form-item label="邮箱" required>
          <el-input v-model="form.email" />
        </el-form-item>
        <el-form-item label="班级">
          <el-select v-model="form.classId" placeholder="未分配班级可留空" clearable filterable style="width: 100%">
            <el-option v-for="c in classes" :key="c.id" :label="c.class_name" :value="c.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <StudentImportDialog
      v-model="importVisible"
      @success="onImportSuccess"
      @open-records="openRecordsFromImport"
    />
    <StudentImportRecordsDialog v-model="importRecordsVisible" />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onActivated } from 'vue'
import { Plus, Search, User, School, Warning, Calendar, Lock } from '@element-plus/icons-vue'
import {
  getStudentUsers,
  createStudent,
  updateUser,
  deleteUser as apiDeleteUser,
  resetStudentInitialPassword,
} from '../../api/user'
import { getStudentAdminSummary } from '../../api/studentImport'
import { getAllClasses } from '../../api/class'
import { useTableDensity } from '../../composables/useTableDensity'
import { formatDateTime } from '../../utils/format'
import { ElMessage, ElMessageBox } from 'element-plus'
import StudentImportDialog from '../../components/admin/StudentImportDialog.vue'
import StudentImportRecordsDialog from '../../components/admin/StudentImportRecordsDialog.vue'
import { usePageCacheStore } from '../../stores/pageCache'
import { useDelayedSkeleton } from '../../utils/useDelayedLoading'

const { tableSize } = useTableDensity()
const pageCache = usePageCacheStore()
const PAGE_CACHE_KEY = 'admin:student-users'

const cached = pageCache.get(PAGE_CACHE_KEY)
const rows = ref(cached?.rows ?? [])
const total = ref(cached?.total ?? 0)
const page = ref(1)
const pageSize = ref(10)
const keyword = ref('')
const appliedKeyword = ref('')
const filterClassId = ref('')
const appliedClassId = ref('')
const filterStatus = ref('')
const appliedStatus = ref('')
const loading = ref(!rows.value.length)
const refreshing = ref(false)
const showSkeleton = useDelayedSkeleton(computed(() => loading.value && !rows.value.length))
const classes = ref(cached?.classes ?? [])
const summary = ref(cached?.summary ?? null)

const importVisible = ref(false)
const importRecordsVisible = ref(false)

const dialogVisible = ref(false)
const editing = ref(null)
const form = reactive({
  username: '',
  realName: '',
  studentNo: '',
  phone: '',
  email: '',
  classId: '',
})

const hasActiveFilters = computed(
  () => !!(appliedKeyword.value || appliedClassId.value || appliedStatus.value)
)

const overviewCards = computed(() => {
  const s = summary.value || {}
  return [
    { key: 'total', label: '学生总数', value: s.total ?? 0, icon: User, tone: 'blue' },
    { key: 'assigned', label: '已分配班级', value: s.assigned ?? 0, icon: School, tone: 'teal' },
    { key: 'unassigned', label: '未分配班级', value: s.unassigned ?? 0, icon: Warning, tone: 'orange' },
    { key: 'monthNew', label: '本月新增', value: s.monthNew ?? 0, icon: Calendar, tone: 'indigo' },
    {
      key: 'mustChange',
      label: '待首次改密',
      value: s.mustChangePassword ?? 0,
      icon: Lock,
      tone: 'violet',
    },
  ]
})

const buildListParams = () => {
  const params = {
    page: page.value,
    pageSize: pageSize.value,
    q: appliedKeyword.value || undefined,
  }
  if (appliedClassId.value === '__none__') {
    if (appliedStatus.value === 'must_change') {
      params.status = 'must_change'
    } else {
      params.status = 'unassigned'
    }
  } else if (appliedClassId.value) {
    params.classId = appliedClassId.value
    if (appliedStatus.value === 'must_change') params.status = 'must_change'
  } else if (appliedStatus.value) {
    params.status = appliedStatus.value
  }
  return params
}

const loadSummary = async () => {
  try {
    const res = await getStudentAdminSummary()
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
    const res = await getStudentUsers(buildListParams())
    if (res.success) {
      rows.value = res.data || []
      total.value = res.total ?? 0
      pageCache.set(PAGE_CACHE_KEY, {
        rows: rows.value,
        total: total.value,
        classes: classes.value,
        summary: summary.value,
      })
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
  appliedClassId.value = filterClassId.value
  appliedStatus.value = filterStatus.value
  page.value = 1
  load()
}

const resetFilters = () => {
  keyword.value = ''
  filterClassId.value = ''
  filterStatus.value = ''
  appliedKeyword.value = ''
  appliedClassId.value = ''
  appliedStatus.value = ''
  page.value = 1
  load()
}

const onSizeChange = () => {
  page.value = 1
  load()
}

const loadClasses = async () => {
  try {
    const res = await getAllClasses()
    if (res.success) classes.value = res.data || []
  } catch (e) {
    console.error(e)
  }
}

const openCreate = () => {
  editing.value = null
  form.username = ''
  form.realName = ''
  form.studentNo = ''
  form.phone = ''
  form.email = ''
  form.classId = ''
  dialogVisible.value = true
}

const openEdit = (row) => {
  editing.value = row
  form.username = row.username
  form.realName = row.real_name
  form.studentNo = row.student_no || ''
  form.phone = row.phone || ''
  form.email = row.email || ''
  form.classId = row.class_id || ''
  dialogVisible.value = true
}

const save = async () => {
  if (!form.username || !form.realName || !form.studentNo || !form.phone || !form.email) {
    ElMessage.error('请填写用户名、真实姓名、学号、电话号码和邮箱')
    return
  }
  try {
    if (editing.value) {
      await updateUser(editing.value.id, {
        username: form.username.trim(),
        realName: form.realName,
        studentNo: form.studentNo,
        phone: form.phone,
        email: form.email,
        classId: form.classId || null,
        department: null,
      })
      ElMessage.success('已更新')
    } else {
      await createStudent({
        username: form.username.trim(),
        realName: form.realName,
        studentNo: form.studentNo.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        classId: form.classId || null,
      })
      ElMessage.success('已创建，初始密码为学号')
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
      `将把「${row.real_name}」的密码重置为学号，并标记为待首次修改密码。确定继续？`,
      '重置初始密码',
      { type: 'warning' }
    )
    await resetStudentInitialPassword(row.id)
    ElMessage.success('已重置为学号初始密码')
    await Promise.all([load(), loadSummary()])
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e?.response?.data?.message || '重置失败')
  }
}

const remove = async (row) => {
  try {
    await ElMessageBox.confirm(`确定删除学生「${row.real_name}」？`, '确认删除', { type: 'warning' })
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
  await Promise.all([loadClasses(), loadSummary()])
  await load({ background: pageCache.has(PAGE_CACHE_KEY) })
})

onActivated(() => {
  load({ background: true })
})
</script>

<style scoped>
.admin-student-page {
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

.student-table {
  --el-table-border-color: #eef2f7;
  --el-table-header-bg-color: #f8fafc;
}

.student-table :deep(.el-table__header th) {
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

.student-form {
  margin-top: 4px;
}
</style>
