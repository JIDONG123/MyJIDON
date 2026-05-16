<template>
  <div class="page-admin-list">
    <header class="page-head">
      <div class="page-head-row">
        <div>
          <h1 class="page-title">学生账号管理</h1>
          <p class="page-desc">学生账号增删改查；每人仅能归属一个班级</p>
        </div>
        <el-button type="primary" @click="openCreate">添加学生</el-button>
      </div>
    </header>

    <el-card class="panel-card" shadow="never">
      <div class="toolbar-row">
        <el-input
          v-model="keyword"
          placeholder="搜索用户名、姓名、邮箱"
          clearable
          class="search-inp"
          @keyup.enter="runSearch"
        />
        <el-button type="primary" @click="runSearch">搜索</el-button>
      </div>

      <el-skeleton v-if="loading" animated :rows="6" class="sk-main" />

      <template v-else>
        <div class="panel-header inner">
          <div>
            <span class="panel-title">学生列表</span>
            <span class="panel-sub">共 {{ total }} 人</span>
          </div>
          <div class="toolbar">
            <span class="toolbar-label">表格密度</span>
            <el-radio-group v-model="mode" size="small">
              <el-radio-button value="default">{{ labelMap.default }}</el-radio-button>
              <el-radio-button value="compact">{{ labelMap.compact }}</el-radio-button>
              <el-radio-button value="comfortable">{{ labelMap.comfortable }}</el-radio-button>
            </el-radio-group>
          </div>
        </div>

        <el-empty v-if="!rows.length" description="暂无学生数据" :image-size="100" />

        <template v-else>
          <el-table :data="rows" border :size="tableSize" stripe class="data-table" style="width: 100%">
            <el-table-column prop="username" label="用户名" min-width="120" show-overflow-tooltip />
            <el-table-column prop="real_name" label="真实姓名" min-width="100" show-overflow-tooltip />
            <el-table-column prop="email" label="邮箱" min-width="160" show-overflow-tooltip />
            <el-table-column prop="class_name" label="班级" min-width="120" show-overflow-tooltip />
            <el-table-column label="创建时间" width="180">
              <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="160" align="right" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
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
      </template>
    </el-card>

    <el-dialog :title="editing ? '编辑学生' : '添加学生'" v-model="dialogVisible" destroy-on-close width="520px">
      <el-form :model="form" label-width="96px">
        <el-form-item label="用户名">
          <el-input v-model="form.username" :disabled="!!editing" autocomplete="off" />
        </el-form-item>
        <el-form-item label="密码" v-if="!editing">
          <div>
            <el-input v-model="form.password" type="password" autocomplete="new-password" />
            <p class="admin-pwd-hint">{{ passwordHint }}</p>
          </div>
        </el-form-item>
        <el-form-item label="真实姓名">
          <el-input v-model="form.realName" />
        </el-form-item>
        <el-form-item label="邮箱">
          <el-input v-model="form.email" />
        </el-form-item>
        <el-form-item label="班级">
          <el-select v-model="form.classId" placeholder="未分班可留空" clearable filterable style="width: 100%">
            <el-option v-for="c in classes" :key="c.id" :label="c.class_name" :value="c.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import {
  getStudentUsers,
  createStudent,
  updateUser,
  deleteUser as apiDeleteUser,
} from '../../api/user'
import { getAllClasses } from '../../api/class'
import { useTableDensity } from '../../composables/useTableDensity'
import { formatDateTime } from '../../utils/format'
import { ElMessage, ElMessageBox } from 'element-plus'
import { PASSWORD_HINT, validatePasswordPlaintext } from '../../utils/passwordPolicy'

const passwordHint = PASSWORD_HINT

const { mode, tableSize, labelMap } = useTableDensity()

const rows = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const keyword = ref('')
const appliedKeyword = ref('')
const loading = ref(true)
const classes = ref([])

const dialogVisible = ref(false)
const editing = ref(null)
const form = reactive({
  username: '',
  password: '',
  realName: '',
  email: '',
  classId: '',
})

const load = async () => {
  loading.value = true
  try {
    const res = await getStudentUsers({
      page: page.value,
      pageSize: pageSize.value,
      q: appliedKeyword.value || undefined,
    })
    if (res.success) {
      rows.value = res.data || []
      total.value = res.total ?? 0
    }
  } catch (e) {
    console.error(e)
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

const runSearch = () => {
  appliedKeyword.value = keyword.value.trim()
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
  form.password = ''
  form.realName = ''
  form.email = ''
  form.classId = ''
  dialogVisible.value = true
}

const openEdit = (row) => {
  editing.value = row
  form.username = row.username
  form.realName = row.real_name
  form.email = row.email || ''
  form.classId = row.class_id || ''
  dialogVisible.value = true
}

const save = async () => {
  if (!form.username || !form.realName) {
    ElMessage.error('请填写用户名与真实姓名')
    return
  }
  try {
    if (editing.value) {
      await updateUser(editing.value.id, {
        realName: form.realName,
        email: form.email,
        classId: form.classId || null,
        department: null,
      })
      ElMessage.success('已更新')
    } else {
      const pv = validatePasswordPlaintext(form.password)
      if (!pv.ok) {
        ElMessage.error(pv.message)
        return
      }
      await createStudent({
        username: form.username,
        password: form.password,
        realName: form.realName,
        email: form.email,
        classId: form.classId || null,
      })
      ElMessage.success('已创建')
    }
    dialogVisible.value = false
    await load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '保存失败')
  }
}

const remove = async (row) => {
  try {
    await ElMessageBox.confirm(`确定删除学生「${row.real_name}」？`, '确认删除', { type: 'warning' })
    await apiDeleteUser(row.id)
    ElMessage.success('已删除')
    await load()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e?.response?.data?.message || '删除失败')
  }
}

onMounted(async () => {
  await loadClasses()
  await load()
})
</script>

<style scoped>
.page-admin-list {
  max-width: 1400px;
}

.page-head {
  margin-bottom: 20px;
}

.page-head-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.page-title {
  margin: 0 0 6px;
  font-size: 22px;
  font-weight: 600;
  color: var(--sg-text);
}

.page-desc {
  margin: 0;
  font-size: 14px;
  color: var(--sg-text-secondary);
}

.panel-card {
  border-radius: var(--sg-radius-lg);
  border: 1px solid var(--sg-border);
}

.toolbar-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
  align-items: center;
}

.search-inp {
  max-width: 320px;
  flex: 1;
  min-width: 200px;
}

.sk-main {
  padding: 12px 0;
}

.panel-header.inner {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.panel-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--sg-text);
  margin-right: 8px;
}

.panel-sub {
  font-size: 12px;
  color: var(--sg-text-placeholder);
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.toolbar-label {
  font-size: 12px;
  color: var(--sg-text-secondary);
}

.data-table {
  border-radius: var(--sg-radius-md);
}

.pager-wrap {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

.admin-pwd-hint {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--el-text-color-secondary);
}
</style>
