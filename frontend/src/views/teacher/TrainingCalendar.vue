<template>
  <div class="tw-page">
    <header class="tw-head">
      <div>
        <h1 class="tw-title">实训日历</h1>
        <p class="tw-subtitle">教学班级别的排课与实训安排，按周查看课表并关联已发布任务。</p>
      </div>
    </header>

    <section class="tw-panel tw-filter-bar">
      <el-form inline class="filter-form">
        <el-form-item label="教学班">
          <el-select v-model="teachingClassId" filterable style="width: 260px" @change="load">
            <el-option
              v-for="tc in teachingClasses"
              :key="tc.id"
              :label="[tc.class_name, tc.course_name].filter(Boolean).join(' · ')"
              :value="tc.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="周次">
          <el-input-number v-model="weekNo" :min="1" :max="20" @change="load" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="openAdd">添加安排</el-button>
        </el-form-item>
      </el-form>
    </section>

    <div v-loading="loading">
      <section v-if="!rows.length && !loading" class="tw-panel tw-empty-panel">
        <el-empty :image-size="88">
          <template #description>
            <h3 class="tw-empty-title">当前周暂无实训安排</h3>
            <p class="tw-empty-desc">可点击「添加安排」创建课表，或将已发布任务关联到具体课次。</p>
          </template>
          <el-button type="primary" @click="openAdd">添加安排</el-button>
        </el-empty>
      </section>

      <template v-else-if="rows.length">
        <section class="tw-panel">
          <div class="tw-panel__header">
            <h2 class="tw-panel__title">周课表</h2>
            <span class="tw-panel__meta">第 {{ weekNo }} 周 · 共 {{ rows.length }} 条安排</span>
          </div>
          <div class="tw-panel__body tw-panel__body--flush grid-body">
            <WeekScheduleGrid :rows="rows" :weekday-max="7" @select="openEdit" />
          </div>
        </section>

        <section class="tw-panel">
          <div class="tw-panel__header">
            <h2 class="tw-panel__title">安排明细</h2>
            <span class="tw-panel__meta">列表视图，便于编辑与管理</span>
          </div>
          <div class="tw-panel__body tw-panel__body--flush">
            <el-table :data="rows" stripe class="detail-table">
              <el-table-column label="星期" width="88">
                <template #default="{ row }">{{ weekdayLabel(row.weekday) }}</template>
              </el-table-column>
              <el-table-column label="节次" width="100">
                <template #default="{ row }">{{ periodLabel(row) }}</template>
              </el-table-column>
              <el-table-column prop="title" label="实训安排" min-width="140" show-overflow-tooltip />
              <el-table-column prop="location" label="地点" width="120" show-overflow-tooltip />
              <el-table-column label="关联任务" min-width="160">
                <template #default="{ row }">
                  <el-tag v-if="row.task_id" size="small" type="success" effect="plain">已关联</el-tag>
                  <el-tag v-else size="small" type="info" effect="plain">未关联</el-tag>
                  <span v-if="row.task_title" class="task-title">{{ row.task_title }}</span>
                </template>
              </el-table-column>
              <el-table-column label="操作" min-width="200" align="right" fixed="right">
                <template #default="{ row }">
                  <el-button type="primary" size="small" plain @click="openEdit(row)">编辑</el-button>
                  <el-button type="danger" size="small" plain @click="remove(row.id)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </section>
      </template>
    </div>

    <el-dialog v-model="showAdd" :title="editingId ? '编辑实训安排' : '添加实训安排'" width="520px" destroy-on-close>
      <el-form label-width="96px">
        <el-form-item label="星期">
          <el-select v-model="form.weekday" style="width: 100%">
            <el-option v-for="(d, i) in weekLabels" :key="i" :label="d" :value="i + 1" />
          </el-select>
        </el-form-item>
        <el-form-item label="节次">
          <el-input-number v-model="form.periodStart" :min="1" :max="12" /> —
          <el-input-number v-model="form.periodEnd" :min="1" :max="12" />
        </el-form-item>
        <el-form-item label="标题">
          <el-input v-model="form.title" placeholder="如 JAVA 实训" />
        </el-form-item>
        <el-form-item label="地点">
          <el-input v-model="form.location" />
        </el-form-item>
        <el-form-item label="关联任务">
          <el-select
            v-model="form.taskId"
            clearable
            filterable
            placeholder="选择本教学班已发布的任务（可选）"
            style="width: 100%"
          >
            <el-option v-for="t in taskOptions" :key="t.id" :label="t.title" :value="t.id" />
          </el-select>
          <p class="field-hint">
            若任务尚未发布：先到「我的教学班 → 发布任务」，再回来编辑本安排并选择任务；发布时也可选对应课次自动关联。
          </p>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAdd = false">取消</el-button>
        <el-button type="primary" @click="saveAdd">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { listCalendar, createSchedule, updateSchedule, deleteSchedule } from '../../api/schedule'
import { listMyTeachingClasses } from '../../api/teachingClass'
import { getTasksByTeachingClass } from '../../api/task'
import { weekdayLabel, periodLabel } from '../../utils/trainingCalendarDisplay'
import WeekScheduleGrid from '../../components/student/schedule/WeekScheduleGrid.vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const route = useRoute()
const weekLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const loading = ref(false)
const rows = ref([])
const teachingClasses = ref([])
const teachingClassId = ref(null)
const weekNo = ref(1)
const showAdd = ref(false)
const editingId = ref(null)
const taskOptions = ref([])
const form = reactive({
  weekday: 1,
  periodStart: 1,
  periodEnd: 2,
  title: '',
  location: '',
  taskId: null,
})

const loadTasks = async () => {
  if (!teachingClassId.value) {
    taskOptions.value = []
    return
  }
  try {
    const res = await getTasksByTeachingClass(teachingClassId.value)
    taskOptions.value = res.success ? res.data || [] : []
  } catch {
    taskOptions.value = []
  }
}

const load = async () => {
  if (!teachingClassId.value) return
  loading.value = true
  try {
    await loadTasks()
    const res = await listCalendar({ teachingClassId: teachingClassId.value, weekNo: weekNo.value })
    if (res.success) rows.value = res.data
  } finally {
    loading.value = false
  }
}

const resetForm = () => {
  editingId.value = null
  form.weekday = 1
  form.periodStart = 1
  form.periodEnd = 2
  form.title = ''
  form.location = ''
  form.taskId = null
}

const openAdd = () => {
  resetForm()
  showAdd.value = true
}

const openEdit = (row) => {
  editingId.value = row.id
  form.weekday = row.weekday
  form.periodStart = row.period_start
  form.periodEnd = row.period_end
  form.title = row.title || ''
  form.location = row.location || ''
  form.taskId = row.task_id || null
  showAdd.value = true
}

const saveAdd = async () => {
  const payload = {
    teachingClassId: teachingClassId.value,
    weekNo: weekNo.value,
    weekday: form.weekday,
    periodStart: form.periodStart,
    periodEnd: form.periodEnd,
    title: form.title,
    location: form.location,
    taskId: form.taskId || null,
  }
  try {
    if (editingId.value) {
      await updateSchedule(editingId.value, payload)
      ElMessage.success('已更新')
    } else {
      await createSchedule(payload)
      ElMessage.success('已添加')
    }
    showAdd.value = false
    load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '失败')
  }
}

const remove = async (id) => {
  await ElMessageBox.confirm('删除该安排？', '提示', { type: 'warning' })
  await deleteSchedule(id)
  load()
}

onMounted(async () => {
  const res = await listMyTeachingClasses()
  if (res.success) {
    teachingClasses.value = res.data
    teachingClassId.value = route.query.teachingClassId
      ? Number(route.query.teachingClassId)
      : res.data[0]?.id || null
    load()
  }
})
</script>

<style scoped>
.filter-form {
  margin: 0;
}

.grid-body {
  padding: 16px 18px 18px;
  overflow-x: auto;
}

.detail-table {
  width: 100%;
}

.task-title {
  margin-left: 8px;
  font-size: 13px;
  color: #475569;
}

.field-hint {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: #64748b;
}
</style>
