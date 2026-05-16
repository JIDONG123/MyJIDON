<template>
  <div class="page-admin-list">
    <header class="page-head">
      <div class="page-head-row">
        <div>
          <h1 class="page-title">班级管理</h1>
          <p class="page-desc">维护班级与「负责教师」：只有指定教师后，该教师工作台才会出现本班并可发布任务。</p>
        </div>
        <el-button type="primary" @click="openAddModal">添加班级</el-button>
      </div>
    </header>

    <el-skeleton v-if="loading" animated :rows="6" class="sk-main" />

    <el-card v-else class="panel-card" shadow="never">
      <template #header>
        <div class="panel-header">
          <div>
            <span class="panel-title">班级列表</span>
            <span class="panel-sub">共 {{ classes.length }} 个</span>
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
      </template>

      <el-empty v-if="!classes.length" description="暂无班级，请点击右上角添加" :image-size="120">
        <template #image>
          <div class="empty-illus">
            <el-icon><OfficeBuilding /></el-icon>
          </div>
        </template>
        <el-button type="primary" @click="openAddModal">添加班级</el-button>
      </el-empty>

      <el-table
        v-else
        :data="classes"
        border
        :size="tableSize"
        stripe
        class="data-table"
        style="width: 100%"
      >
        <el-table-column prop="class_name" label="班级名称" min-width="140" show-overflow-tooltip />
        <el-table-column prop="major" label="专业" min-width="120" show-overflow-tooltip />
        <el-table-column prop="grade" label="年级" width="100" />
        <el-table-column label="负责教师" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">
            <template v-if="row.teacher_name">
              {{ row.teacher_name }}
            </template>
            <el-tag v-else type="warning" effect="plain" size="small">未设置</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="180">
          <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="160" align="right" fixed="right">
          <template #default="scope">
            <el-button link type="primary" @click="editClass(scope.row)">编辑</el-button>
            <el-button link type="danger" @click="deleteClass(scope.row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog :title="editingClass ? '编辑班级' : '添加班级'" v-model="showAddModal" destroy-on-close @closed="onDialogClosed">
      <el-form :model="form" label-width="100px">
        <el-form-item label="班级名称">
          <el-input v-model="form.className" />
        </el-form-item>
        <el-form-item label="专业">
          <el-input v-model="form.major" />
        </el-form-item>
        <el-form-item label="年级">
          <el-input v-model="form.grade" />
        </el-form-item>
        <el-form-item label="负责教师" required>
          <el-select v-model="form.teacherId" placeholder="必选：对应教师登录后可管理本班" filterable style="width: 100%">
            <el-option v-for="teacher in teachers" :key="teacher.id" :label="`${teacher.real_name}（${teacher.username}）`" :value="teacher.id" />
          </el-select>
          <p class="form-hint">决定哪位教师能在工作台管理该班并发布任务；留空保存时会二次确认。</p>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddModal = false">取消</el-button>
        <el-button type="primary" @click="saveClass">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { OfficeBuilding } from '@element-plus/icons-vue'
import { getAllClasses, createClass, updateClass, deleteClass as apiDeleteClass } from '../../api/class'
import { getAllUsers } from '../../api/user'
import { useTableDensity } from '../../composables/useTableDensity'
import { formatDateTime } from '../../utils/format'
import { ElMessage, ElMessageBox } from 'element-plus'

const { mode, tableSize, labelMap } = useTableDensity()

const classes = ref([])
const teachers = ref([])
const loading = ref(true)
const showAddModal = ref(false)
const editingClass = ref(null)

const form = reactive({
  className: '',
  major: '',
  grade: '',
  teacherId: '',
})

const loadClasses = async () => {
  try {
    const response = await getAllClasses()
    if (response.success) {
      classes.value = response.data
    }
  } catch (error) {
    console.error('获取班级列表失败:', error)
  } finally {
    loading.value = false
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
  form.major = cls.major
  form.grade = cls.grade
  form.teacherId = cls.teacher_id || ''
  showAddModal.value = true
}

const saveClass = async () => {
  if (!form.className) {
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
    if (editingClass.value) {
      await updateClass(editingClass.value.id, {
        className: form.className,
        major: form.major,
        grade: form.grade,
        teacherId: form.teacherId || null,
      })
      ElMessage.success('更新成功')
    } else {
      await createClass({
        className: form.className,
        major: form.major,
        grade: form.grade,
        teacherId: form.teacherId || null,
      })
      ElMessage.success('创建成功')
    }
    showAddModal.value = false
    editingClass.value = null
    form.className = ''
    form.major = ''
    form.grade = ''
    form.teacherId = ''
    loadClasses()
  } catch (error) {
    ElMessage.error('操作失败')
    console.error(error)
  }
}

const deleteClass = async (id) => {
  if (!confirm('确定要删除这个班级吗？')) return

  try {
    await apiDeleteClass(id)
    ElMessage.success('删除成功')
    loadClasses()
  } catch (error) {
    ElMessage.error('删除失败')
    console.error(error)
  }
}

onMounted(() => {
  loading.value = true
  loadClasses()
  loadTeachers()
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

.sk-main {
  padding: 12px 0;
}

.panel-card {
  border-radius: var(--sg-radius-lg);
  border: 1px solid var(--sg-border);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
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

.form-hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--sg-text-placeholder);
  line-height: 1.5;
}

.empty-illus {
  width: 120px;
  height: 120px;
  margin: 0 auto;
  border-radius: 50%;
  background: linear-gradient(145deg, #f0f5ff 0%, #e6f4ff 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 48px;
  color: var(--sg-primary);
}
</style>
