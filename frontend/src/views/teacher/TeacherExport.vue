<template>
  <div class="page-export">
    <header class="page-head">
      <h1 class="page-title">作业批量导出</h1>
      <p class="page-desc">按班级与任务筛选，导出成绩统计表（Excel）或打包下载学生提交附件（ZIP），便于打印与教务归档。</p>
    </header>

    <el-card shadow="never" class="panel">
      <el-form label-width="100px" class="form-row">
        <el-form-item label="班级">
          <el-select v-model="classId" placeholder="请选择班级" style="width: 100%" @change="onClassChange">
            <el-option
              v-for="c in classes"
              :key="c.id"
              :label="c.className || c.class_name"
              :value="c.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="任务">
          <el-select
            v-model="taskId"
            placeholder="请先选择班级"
            style="width: 100%"
            :disabled="!classId"
            filterable
          >
            <el-option v-for="t in tasks" :key="t.id" :label="t.title" :value="t.id" />
          </el-select>
        </el-form-item>
      </el-form>

      <div class="actions">
        <el-button type="primary" :disabled="!canExport" :loading="busyXlsx" @click="doXlsx">
          导出成绩统计表（Excel）
        </el-button>
        <el-button type="success" plain :disabled="!canExport" :loading="busyZip" @click="doZip">
          打包下载作业附件（ZIP）
        </el-button>
      </div>
      <p class="hint">导出范围受班级与任务数据隔离约束，仅包含您负责班级且由您发布的任务数据。</p>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useUserStore } from '../../stores/user'
import { getTasksByClass } from '../../api/task'
import { downloadScoresExcel, downloadSubmissionsZip } from '../../api/export'

const userStore = useUserStore()
const classId = ref(null)
const taskId = ref(null)
const tasks = ref([])
const busyXlsx = ref(false)
const busyZip = ref(false)

const classes = computed(() => {
  const raw = userStore.user?.managedClasses
  return Array.isArray(raw) ? raw : []
})

const canExport = computed(() => !!classId.value && !!taskId.value)

async function onClassChange() {
  taskId.value = null
  tasks.value = []
  if (!classId.value) return
  try {
    const res = await getTasksByClass(Number(classId.value))
    if (res.success) {
      const uid = userStore.user?.id
      const list = res.data || []
      tasks.value = uid ? list.filter((t) => Number(t.created_by) === Number(uid)) : list
    }
  } catch (_) {
    tasks.value = []
  }
}

async function doXlsx() {
  busyXlsx.value = true
  try {
    await downloadScoresExcel(classId.value, taskId.value)
    ElMessage.success('已开始下载')
  } catch (e) {
    ElMessage.error(e?.message || '导出失败')
  } finally {
    busyXlsx.value = false
  }
}

async function doZip() {
  busyZip.value = true
  try {
    await downloadSubmissionsZip(classId.value, taskId.value)
    ElMessage.success('已开始下载')
  } catch (e) {
    ElMessage.error(e?.message || '打包失败')
  } finally {
    busyZip.value = false
  }
}

onMounted(async () => {
  await userStore.fetchUserInfo()
  if (classes.value.length === 1) {
    classId.value = classes.value[0].id
    onClassChange()
  }
})
</script>

<style scoped>
.page-export {
  max-width: 720px;
  margin: 0 auto;
}

.page-title {
  margin: 0 0 8px;
  font-size: 22px;
  font-weight: 700;
}

.page-desc {
  margin: 0 0 20px;
  font-size: 14px;
  color: var(--sg-text-secondary);
}

.panel {
  border-radius: 14px;
}

.form-row {
  max-width: 520px;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 8px;
}

.hint {
  margin: 16px 0 0;
  font-size: 13px;
  color: var(--sg-text-secondary);
  line-height: 1.5;
}
</style>
