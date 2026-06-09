<template>
  <div class="tw-page admin-enterprise-page">
    <header class="tw-head">
      <div class="tw-head__left">
        <div>
          <h1 class="tw-title">企业导师账号</h1>
          <p class="tw-subtitle">
            维护企业导师账号、企业/部门信息与评价授权范围，支持按行政班和教学班进行访问授权。
          </p>
        </div>
      </div>
    </header>

    <el-skeleton v-if="initialLoading" animated :rows="10" />

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
            v-model="keyword"
            placeholder="搜索用户名 / 姓名 / 邮箱 / 企业部门"
            clearable
            class="filter-toolbar__search"
            @keyup.enter="applyFilters"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
          <el-select v-model="filterStatus" placeholder="账号状态" clearable class="filter-toolbar__select">
            <el-option label="已启用" value="enabled" />
            <el-option label="已禁用" value="disabled" />
          </el-select>
          <el-select v-model="filterAuth" placeholder="授权状态" clearable class="filter-toolbar__select">
            <el-option label="已授权" value="authorized" />
            <el-option label="未授权" value="unauthorized" />
          </el-select>
          <el-button type="primary" plain @click="applyFilters">筛选</el-button>
          <el-button v-if="hasActiveFilters" plain @click="resetFilters">重置</el-button>
          <div class="filter-toolbar__spacer" />
          <el-button type="primary" @click="openCreate">
            <el-icon><Plus /></el-icon>
            添加企业账号
          </el-button>
        </div>
      </section>

      <section class="tw-panel">
        <div class="tw-panel__header">
          <h2 class="tw-panel__title">企业导师列表</h2>
          <span class="tw-panel__meta">共 {{ displayRows.length }} 人</span>
        </div>

        <div
          v-if="!loading && !allRows.length && !hasActiveFilters"
          class="tw-panel__body tw-empty-panel"
        >
          <el-empty :image-size="96">
            <template #description>
              <h3 class="tw-empty-title">暂无企业导师账号</h3>
              <p class="tw-empty-desc">
                添加企业导师账号后，可为其授权行政班或教学班，用于参与实训评价与企业导师评分。
              </p>
            </template>
          </el-empty>
          <div class="empty-actions">
            <el-button type="primary" @click="openCreate">添加企业账号</el-button>
          </div>
        </div>

        <div
          v-else-if="!loading && !displayRows.length"
          class="tw-panel__body tw-empty-panel"
        >
          <el-empty description="没有符合筛选条件的企业导师" :image-size="88" />
          <el-button plain @click="resetFilters">清除筛选</el-button>
        </div>

        <div v-else class="tw-panel__body tw-panel__body--flush table-wrap">
          <el-skeleton v-if="loading" animated :rows="8" />
          <template v-else>
            <el-table :data="displayRows" :size="tableSize" class="enterprise-table" style="width: 100%">
              <el-table-column label="导师信息" min-width="150" show-overflow-tooltip>
                <template #default="{ row }">
                  <div class="name-cell">
                    <span class="name-cell__name">{{ row.real_name }}</span>
                    <span class="name-cell__sub">{{ row.username }}</span>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="企业 / 部门" min-width="140" show-overflow-tooltip>
                <template #default="{ row }">
                  <span :class="{ 'text-muted': !row.department }">
                    {{ row.department || '未填写' }}
                  </span>
                </template>
              </el-table-column>
              <el-table-column label="联系方式" min-width="180" show-overflow-tooltip>
                <template #default="{ row }">
                  <div class="contact-cell">
                    <span>{{ row.email || '—' }}</span>
                    <span v-if="row.phone" class="contact-cell__phone">{{ row.phone }}</span>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="授权范围" min-width="180">
                <template #default="{ row }">
                  <div v-if="hasAuthorization(row)" class="auth-tags">
                    <el-tag v-if="row._adminClassCount > 0" type="primary" effect="plain" size="small">
                      行政班 {{ row._adminClassCount }} 个
                    </el-tag>
                    <el-tag v-if="row._teachingClassCount > 0" type="success" effect="plain" size="small">
                      教学班 {{ row._teachingClassCount }} 个
                    </el-tag>
                  </div>
                  <el-tag v-else type="info" effect="plain" size="small">未授权</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="账号状态" width="96" align="center">
                <template #default="{ row }">
                  <el-tag
                    :type="row.is_disabled ? 'danger' : 'success'"
                    effect="plain"
                    size="small"
                  >
                    {{ row.is_disabled ? '已禁用' : '已启用' }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="创建时间" width="168">
                <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
              </el-table-column>
              <el-table-column label="操作" min-width="280" align="right" fixed="right">
                <template #default="{ row }">
                  <div class="table-row-actions">
                    <el-button type="primary" size="small" plain @click="openAuth(row)">授权</el-button>
                    <el-button size="small" plain @click="openView(row)">查看</el-button>
                    <el-button size="small" plain @click="openEdit(row)">编辑</el-button>
                    <el-dropdown trigger="click" @command="(cmd) => handleMore(cmd, row)">
                      <el-button size="small">
                        更多
                        <el-icon class="el-icon--right"><ArrowDown /></el-icon>
                      </el-button>
                      <template #dropdown>
                        <el-dropdown-menu>
                          <el-dropdown-item command="toggle">
                            {{ row.is_disabled ? '启用' : '禁用' }}
                          </el-dropdown-item>
                          <el-dropdown-item command="delete" divided>
                            <span class="danger-text">删除</span>
                          </el-dropdown-item>
                        </el-dropdown-menu>
                      </template>
                    </el-dropdown>
                  </div>
                </template>
              </el-table-column>
            </el-table>
          </template>
        </div>
      </section>
    </template>

    <!-- 添加 / 编辑 -->
    <el-dialog
      v-model="formVisible"
      :title="editing ? '编辑企业导师' : '添加企业账号'"
      width="520px"
      destroy-on-close
    >
      <el-alert
        v-if="!editing"
        type="info"
        :closable="false"
        show-icon
        class="form-alert"
      >
        <template #title>
          <span>请设置符合安全策略的初始密码；列表中不展示明文密码。</span>
        </template>
      </el-alert>
      <el-form :model="form" label-width="96px" class="enterprise-form">
        <el-form-item label="用户名" required>
          <el-input v-model="form.username" autocomplete="off" :disabled="!!editing" />
        </el-form-item>
        <el-form-item v-if="!editing" label="密码" required>
          <div class="field-block">
            <el-input v-model="form.password" type="password" show-password autocomplete="new-password" />
            <p class="field-hint">{{ passwordHint }}</p>
          </div>
        </el-form-item>
        <el-form-item label="姓名" required>
          <el-input v-model="form.realName" />
        </el-form-item>
        <el-form-item label="邮箱" required>
          <el-input v-model="form.email" />
        </el-form-item>
        <el-form-item label="企业 / 部门" required>
          <el-input v-model="form.department" placeholder="企业名称或部门" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" :loading="formSaving" @click="saveForm">
          {{ editing ? '保存' : '创建' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 查看详情 -->
    <el-dialog v-model="viewVisible" title="企业导师详情" width="560px" destroy-on-close>
      <template v-if="viewRow">
        <section class="detail-section">
          <h3 class="detail-section__title">基础信息</h3>
          <dl class="detail-dl">
            <div class="detail-dl__row">
              <dt>用户名</dt>
              <dd>{{ viewRow.username }}</dd>
            </div>
            <div class="detail-dl__row">
              <dt>姓名</dt>
              <dd>{{ viewRow.real_name }}</dd>
            </div>
            <div class="detail-dl__row">
              <dt>邮箱</dt>
              <dd>{{ viewRow.email || '—' }}</dd>
            </div>
            <div class="detail-dl__row">
              <dt>企业 / 部门</dt>
              <dd>{{ viewRow.department || '未填写' }}</dd>
            </div>
            <div v-if="viewRow.phone" class="detail-dl__row">
              <dt>手机号</dt>
              <dd>{{ viewRow.phone }}</dd>
            </div>
            <div class="detail-dl__row">
              <dt>账号状态</dt>
              <dd>
                <el-tag
                  :type="viewRow.is_disabled ? 'danger' : 'success'"
                  effect="plain"
                  size="small"
                >
                  {{ viewRow.is_disabled ? '已禁用' : '已启用' }}
                </el-tag>
              </dd>
            </div>
            <div class="detail-dl__row">
              <dt>创建时间</dt>
              <dd>{{ formatDateTime(viewRow.created_at) }}</dd>
            </div>
          </dl>
        </section>
        <section class="detail-section">
          <h3 class="detail-section__title">授权信息</h3>
          <div v-if="hasAuthorization(viewRow)" class="detail-auth">
            <div v-if="viewRow._adminClasses?.length" class="detail-auth__block">
              <span class="detail-auth__label">已授权行政班</span>
              <ul class="detail-auth__list">
                <li v-for="c in viewRow._adminClasses" :key="c.id">{{ c.class_name }}</li>
              </ul>
            </div>
            <div v-if="viewRow._teachingClasses?.length" class="detail-auth__block">
              <span class="detail-auth__label">已授权教学班</span>
              <ul class="detail-auth__list">
                <li v-for="tc in viewRow._teachingClasses" :key="tc.id">
                  {{ [tc.class_name, tc.course_name, tc.term_name].filter(Boolean).join(' · ') }}
                </li>
              </ul>
            </div>
          </div>
          <p v-else class="detail-empty">暂无授权范围</p>
        </section>
      </template>
      <template #footer>
        <el-button @click="viewVisible = false">关闭</el-button>
        <el-button type="primary" plain @click="openAuthFromView">管理授权</el-button>
      </template>
    </el-dialog>

    <EnterpriseAuthDrawer
      v-model="authVisible"
      :mentor="authMentor"
      @saved="onAuthSaved"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import {
  Plus,
  Search,
  User,
  CircleCheck,
  CircleClose,
  Key,
  Warning,
  ArrowDown,
} from '@element-plus/icons-vue'
import {
  listEnterpriseUsers,
  createEnterpriseUser,
  getEnterpriseUserClasses,
  getEnterpriseUserTeachingClasses,
  updateUser,
  deleteUser as apiDeleteUser,
} from '../../api/user'
import { useTableDensity } from '../../composables/useTableDensity'
import { formatDateTime } from '../../utils/format'
import { ElMessage, ElMessageBox } from 'element-plus'
import { PASSWORD_HINT, validatePasswordPlaintext } from '../../utils/passwordPolicy'
import EnterpriseAuthDrawer from '../../components/admin/EnterpriseAuthDrawer.vue'

const passwordHint = PASSWORD_HINT
const { tableSize } = useTableDensity()

const allRows = ref([])
const loading = ref(true)
const initialLoading = ref(true)

const keyword = ref('')
const appliedKeyword = ref('')
const filterStatus = ref('')
const appliedStatus = ref('')
const filterAuth = ref('')
const appliedAuth = ref('')

const formVisible = ref(false)
const formSaving = ref(false)
const editing = ref(null)
const form = reactive({
  username: '',
  password: '',
  realName: '',
  email: '',
  department: '',
})

const viewVisible = ref(false)
const viewRow = ref(null)

const authVisible = ref(false)
const authMentor = ref(null)

const hasAuthorization = (row) =>
  (row._adminClassCount || 0) + (row._teachingClassCount || 0) > 0

const hasActiveFilters = computed(
  () => !!(appliedKeyword.value || appliedStatus.value || appliedAuth.value)
)

const displayRows = computed(() => {
  let list = allRows.value
  const kw = appliedKeyword.value.toLowerCase()
  if (kw) {
    list = list.filter(
      (r) =>
        (r.username || '').toLowerCase().includes(kw) ||
        (r.real_name || '').toLowerCase().includes(kw) ||
        (r.email || '').toLowerCase().includes(kw) ||
        (r.department || '').toLowerCase().includes(kw)
    )
  }
  if (appliedStatus.value === 'enabled') {
    list = list.filter((r) => !r.is_disabled)
  } else if (appliedStatus.value === 'disabled') {
    list = list.filter((r) => r.is_disabled)
  }
  if (appliedAuth.value === 'authorized') {
    list = list.filter((r) => hasAuthorization(r))
  } else if (appliedAuth.value === 'unauthorized') {
    list = list.filter((r) => !hasAuthorization(r))
  }
  return list
})

const overviewCards = computed(() => {
  const list = allRows.value
  const total = list.length
  const enabled = list.filter((r) => !r.is_disabled).length
  const disabled = list.filter((r) => r.is_disabled).length
  const authorized = list.filter((r) => hasAuthorization(r)).length
  const unauthorized = total - authorized
  return [
    { key: 'total', label: '企业导师总数', value: total, icon: User, tone: 'blue' },
    { key: 'enabled', label: '已启用', value: enabled, icon: CircleCheck, tone: 'teal' },
    { key: 'disabled', label: '已禁用', value: disabled, icon: CircleClose, tone: 'orange' },
    { key: 'authorized', label: '已授权导师', value: authorized, icon: Key, tone: 'indigo' },
    {
      key: 'unauthorized',
      label: '未授权导师',
      value: unauthorized,
      icon: Warning,
      tone: 'violet',
    },
  ]
})

const enrichUser = async (user) => {
  const [cRes, tcRes] = await Promise.all([
    getEnterpriseUserClasses(user.id),
    getEnterpriseUserTeachingClasses(user.id),
  ])
  const adminClasses = cRes.success ? cRes.data || [] : []
  const teachingClasses = tcRes.success ? tcRes.data || [] : []
  return {
    ...user,
    _adminClasses: adminClasses,
    _teachingClasses: teachingClasses,
    _adminClassCount: adminClasses.length,
    _teachingClassCount: teachingClasses.length,
  }
}

const load = async () => {
  loading.value = true
  try {
    const res = await listEnterpriseUsers()
    const users = res.success ? res.data || [] : []
    allRows.value = await Promise.all(users.map(enrichUser))
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

const applyFilters = () => {
  appliedKeyword.value = keyword.value.trim()
  appliedStatus.value = filterStatus.value
  appliedAuth.value = filterAuth.value
}

const resetFilters = () => {
  keyword.value = ''
  filterStatus.value = ''
  filterAuth.value = ''
  appliedKeyword.value = ''
  appliedStatus.value = ''
  appliedAuth.value = ''
}

const openCreate = () => {
  editing.value = null
  Object.assign(form, {
    username: '',
    password: '',
    realName: '',
    email: '',
    department: '',
  })
  formVisible.value = true
}

const openEdit = (row) => {
  editing.value = row
  Object.assign(form, {
    username: row.username,
    password: '',
    realName: row.real_name,
    email: row.email || '',
    department: row.department || '',
  })
  formVisible.value = true
}

const saveForm = async () => {
  if (!form.username?.trim() || !form.realName?.trim() || !form.email?.trim() || !form.department?.trim()) {
    ElMessage.warning('请填写所有必填项')
    return
  }
  formSaving.value = true
  try {
    if (editing.value) {
      const res = await updateUser(editing.value.id, {
        realName: form.realName.trim(),
        email: form.email.trim(),
        department: form.department.trim(),
      })
      if (res.success) {
        ElMessage.success('已保存')
        formVisible.value = false
        await load()
      }
    } else {
      const pv = validatePasswordPlaintext(form.password)
      if (!pv.ok) {
        ElMessage.error(pv.message)
        return
      }
      const res = await createEnterpriseUser({
        username: form.username.trim(),
        password: form.password,
        realName: form.realName.trim(),
        email: form.email.trim(),
        department: form.department.trim(),
      })
      if (res.success) {
        ElMessage.success('企业账号创建成功')
        formVisible.value = false
        await load()
      }
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || e?.message || '保存失败')
  } finally {
    formSaving.value = false
  }
}

const openView = (row) => {
  viewRow.value = row
  viewVisible.value = true
}

const openAuthFromView = () => {
  if (!viewRow.value) return
  viewVisible.value = false
  openAuth(viewRow.value)
}

const openAuth = (row) => {
  authMentor.value = row
  authVisible.value = true
}

const onAuthSaved = async () => {
  await load()
}

const toggleStatus = async (row) => {
  try {
    if (row.is_disabled) {
      await ElMessageBox.confirm('确认启用该企业导师账号？', '启用账号', {
        type: 'info',
        confirmButtonText: '确认启用',
      })
    } else {
      await ElMessageBox.confirm(
        '禁用后该账号将无法登录，也无法查看授权班级和评价任务。',
        '确认禁用该企业导师账号？',
        {
          type: 'warning',
          confirmButtonText: '确认禁用',
        }
      )
    }
    await updateUser(row.id, {
      realName: row.real_name,
      email: row.email || null,
      classId: null,
      department: row.department || null,
      is_disabled: row.is_disabled ? 0 : 1,
    })
    ElMessage.success(row.is_disabled ? '已启用' : '已禁用')
    await load()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e?.response?.data?.message || '操作失败')
  }
}

const remove = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确定删除企业导师「${row.real_name}」？删除后不可恢复。`,
      '确认删除',
      { type: 'warning', confirmButtonText: '删除' }
    )
    await apiDeleteUser(row.id)
    ElMessage.success('已删除')
    await load()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e?.response?.data?.message || '删除失败')
  }
}

const handleMore = (cmd, row) => {
  if (cmd === 'toggle') toggleStatus(row)
  else if (cmd === 'delete') remove(row)
}

onMounted(async () => {
  try {
    await load()
  } finally {
    initialLoading.value = false
  }
})
</script>

<style scoped>
.admin-enterprise-page {
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

.filter-toolbar__spacer {
  flex: 1;
  min-width: 8px;
}

.table-wrap {
  overflow: hidden;
}

.enterprise-table {
  --el-table-border-color: #eef2f7;
  --el-table-header-bg-color: #f8fafc;
}

.enterprise-table :deep(.el-table__header th) {
  font-weight: 600;
}

.enterprise-table :deep(.el-table__row) {
  height: 56px;
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

.name-cell__sub {
  font-size: 12px;
  color: #94a3b8;
}

.contact-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 13px;
}

.contact-cell__phone {
  font-size: 12px;
  color: #64748b;
}

.auth-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.text-muted {
  color: #94a3b8;
}

.danger-text {
  color: #dc2626;
}

.empty-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
}

.form-alert {
  margin-bottom: 16px;
}

.field-block {
  width: 100%;
}

.field-hint {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--el-text-color-secondary);
}

.enterprise-form {
  margin-top: 4px;
}

.detail-section {
  margin-bottom: 20px;
}

.detail-section:last-child {
  margin-bottom: 0;
}

.detail-section__title {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 600;
  color: #334155;
}

.detail-dl__row {
  display: grid;
  grid-template-columns: 96px 1fr;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid #f1f5f9;
  font-size: 14px;
}

.detail-dl__row dt {
  margin: 0;
  color: #64748b;
}

.detail-dl__row dd {
  margin: 0;
  color: #1e293b;
}

.detail-auth__block {
  margin-bottom: 14px;
}

.detail-auth__label {
  display: block;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #475569;
}

.detail-auth__list {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  color: #334155;
  line-height: 1.7;
}

.detail-empty {
  margin: 0;
  font-size: 13px;
  color: #94a3b8;
}
</style>
