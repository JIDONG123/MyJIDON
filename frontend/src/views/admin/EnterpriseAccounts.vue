<template>
  <div class="page-admin-list">
    <header class="page-head">
      <div class="page-head-row">
        <div>
          <h1 class="page-title">企业导师账号</h1>
          <p class="page-desc">创建企业账号并授权可访问的班级；企业侧仅查看与批改关联任务作业。</p>
        </div>
        <el-button type="primary" @click="openCreate">添加企业账号</el-button>
      </div>
    </header>

    <el-card shadow="never">
      <el-skeleton v-if="loading" :rows="5" animated />
      <el-table v-else :data="rows" border stripe size="small">
        <el-table-column prop="username" label="用户名" min-width="110" />
        <el-table-column prop="real_name" label="姓名" width="100" />
        <el-table-column prop="email" label="邮箱" min-width="140" />
        <el-table-column prop="department" label="部门" width="120" />
        <el-table-column label="禁用" width="72" align="center">
          <template #default="{ row }">
            <el-tag :type="row.is_disabled ? 'danger' : 'success'" size="small">{{ row.is_disabled ? '是' : '否' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right" align="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openClasses(row)">授权班级</el-button>
            <el-button link @click="toggle(row)">{{ row.is_disabled ? '启用' : '禁用' }}</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dlg" title="添加企业账号" width="480px" destroy-on-close>
      <el-form :model="form" label-width="88px">
        <el-form-item label="用户名"><el-input v-model="form.username" /></el-form-item>
        <el-form-item label="密码">
          <div>
            <el-input v-model="form.password" type="password" />
            <p class="ent-pwd-hint">{{ passwordHint }}</p>
          </div>
        </el-form-item>
        <el-form-item label="姓名"><el-input v-model="form.realName" /></el-form-item>
        <el-form-item label="邮箱"><el-input v-model="form.email" /></el-form-item>
        <el-form-item label="部门"><el-input v-model="form.department" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg = false">取消</el-button>
        <el-button type="primary" @click="create">创建</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="clsDlg" title="授权班级" width="520px" destroy-on-close>
      <el-checkbox-group v-model="selectedClassIds">
        <el-checkbox v-for="c in allClasses" :key="c.id" :value="c.id">{{ c.class_name }}</el-checkbox>
      </el-checkbox-group>
      <template #footer>
        <el-button @click="clsDlg = false">取消</el-button>
        <el-button type="primary" @click="saveClasses">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import {
  listEnterpriseUsers,
  createEnterpriseUser,
  getEnterpriseUserClasses,
  setEnterpriseUserClasses,
  updateUser,
} from '../../api/user'
import { getAllClasses } from '../../api/class'
import { ElMessage, ElMessageBox } from 'element-plus'
import { PASSWORD_HINT, validatePasswordPlaintext } from '../../utils/passwordPolicy'

const passwordHint = PASSWORD_HINT

const loading = ref(true)
const rows = ref([])
const dlg = ref(false)
const clsDlg = ref(false)
const allClasses = ref([])
const selectedClassIds = ref([])
const currentEnt = ref(null)
const form = reactive({
  username: '',
  password: '',
  realName: '',
  email: '',
  department: '',
})

const load = async () => {
  loading.value = true
  try {
    const res = await listEnterpriseUsers()
    if (res.success) rows.value = res.data || []
  } finally {
    loading.value = false
  }
}

const openCreate = () => {
  Object.assign(form, { username: '', password: '', realName: '', email: '', department: '' })
  dlg.value = true
}

const create = async () => {
  const pv = validatePasswordPlaintext(form.password)
  if (!pv.ok) {
    ElMessage.error(pv.message)
    return
  }
  try {
    const res = await createEnterpriseUser({
      username: form.username,
      password: form.password,
      realName: form.realName,
      email: form.email,
      department: form.department,
    })
    if (res.success) {
      ElMessage.success('已创建')
      dlg.value = false
      load()
    }
  } catch (e) {
    const d = e?.response?.data
    ElMessage.error(d?.message || d?.error || e?.message || '创建失败')
  }
}

const openClasses = async (row) => {
  currentEnt.value = row
  const [cRes, aRes] = await Promise.all([getEnterpriseUserClasses(row.id), getAllClasses()])
  if (aRes.success) allClasses.value = aRes.data || []
  selectedClassIds.value = cRes.success ? (cRes.data || []).map((x) => x.id) : []
  clsDlg.value = true
}

const saveClasses = async () => {
  if (!currentEnt.value) return
  try {
    const res = await setEnterpriseUserClasses(currentEnt.value.id, selectedClassIds.value)
    if (res.success) {
      ElMessage.success('已保存')
      clsDlg.value = false
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || e?.message || '失败')
  }
}

const toggle = async (row) => {
  try {
    await ElMessageBox.confirm(row.is_disabled ? '确定启用该账号？' : '确定禁用该账号？', '提示', {
      type: 'warning',
    })
    await updateUser(row.id, {
      realName: row.real_name,
      email: row.email || null,
      classId: null,
      department: row.department || null,
      is_disabled: row.is_disabled ? 0 : 1,
    })
    ElMessage.success('已更新')
    load()
  } catch (_) {}
}

onMounted(load)
</script>

<style scoped>
.page-head-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 16px;
}
.page-title {
  margin: 0 0 6px;
  font-size: 20px;
}
.page-desc {
  margin: 0;
  color: var(--sg-text-secondary);
  font-size: 13px;
}

.ent-pwd-hint {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--el-text-color-secondary);
}
</style>
