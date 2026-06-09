<template>
  <div class="export-center">
    <header class="workbench-head">
      <div class="workbench-head__main">
        <h1 class="workbench-title">作业批量导出</h1>
        <p class="workbench-subtitle">
          按行政班或教学班导出成绩统计表、学生提交附件与批改结果，支持教学归档与答辩佐证
        </p>
      </div>
    </header>

    <el-skeleton v-if="pageLoading" animated :rows="8" class="workbench-skeleton" />

    <template v-else>
      <section class="metric-grid">
        <div v-for="card in overviewCards" :key="card.key" class="metric-card">
          <div class="metric-card__icon" :class="`metric-card__icon--${card.tone}`">
            <el-icon><component :is="card.icon" /></el-icon>
          </div>
          <div class="metric-card__body">
            <span class="metric-card__value">{{ card.value }}</span>
            <span class="metric-card__label">{{ card.label }}</span>
            <span class="metric-card__hint">{{ card.hint }}</span>
          </div>
        </div>
      </section>

      <el-row :gutter="16" class="config-row">
        <el-col :xs="24" :lg="14">
          <div class="panel">
            <div class="panel__header">
              <h2 class="panel__title">导出范围</h2>
              <span class="panel__meta">选择班级与任务后执行导出</span>
            </div>
            <div class="panel__body">
              <el-form label-position="top" class="export-form">
                <el-form-item label="发布对象">
                  <el-radio-group v-model="publishScope" @change="onScopeChange">
                    <el-radio value="class">行政班</el-radio>
                    <el-radio value="teaching">教学班</el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item :label="publishScope === 'teaching' ? '教学班' : '班级'">
                  <el-select
                    v-model="audienceId"
                    placeholder="请选择"
                    style="width: 100%"
                    filterable
                    @change="onAudienceChange"
                  >
                    <el-option v-for="c in audienceOptions" :key="c.id" :label="c.label" :value="c.id" />
                  </el-select>
                </el-form-item>
                <el-form-item label="任务">
                  <el-select
                    v-model="taskId"
                    placeholder="请先选择班级/教学班"
                    style="width: 100%"
                    :disabled="!audienceId"
                    filterable
                    @change="onTaskChange"
                  >
                    <el-option v-for="t in tasks" :key="t.id" :label="taskOptionLabel(t)" :value="t.id" />
                  </el-select>
                </el-form-item>
              </el-form>

              <div class="export-actions">
                <el-button
                  type="primary"
                  size="large"
                  :disabled="!canExport"
                  :loading="busyXlsx"
                  @click="doXlsx"
                >
                  <el-icon><Document /></el-icon>
                  导出成绩统计表（Excel）
                </el-button>
                <el-button
                  type="success"
                  plain
                  size="large"
                  :disabled="!canExport"
                  :loading="busyZip"
                  @click="doZip"
                >
                  <el-icon><FolderOpened /></el-icon>
                  打包下载作业附件（ZIP）
                </el-button>
              </div>
              <p v-if="!canExport" class="action-hint">请先选择班级/教学班与任务后再导出</p>
            </div>
          </div>
        </el-col>

        <el-col :xs="24" :lg="10">
          <div class="panel panel--info">
            <div class="panel__header">
              <h2 class="panel__title">导出内容说明</h2>
            </div>
            <div class="panel__body">
              <div class="info-block">
                <h3 class="info-block__title">
                  <el-icon><Document /></el-icon>
                  Excel 成绩统计表
                </h3>
                <p class="info-block__text">
                  包含学生信息、提交状态、AI 评分、教师评分、综合分、维度得分与批改评语等字段，便于成绩汇总与教学检查。
                </p>
              </div>
              <div class="info-block">
                <h3 class="info-block__title">
                  <el-icon><FolderOpened /></el-icon>
                  ZIP 作业附件包
                </h3>
                <p class="info-block__text">
                  包含学生提交附件、源文件、说明文档与截图材料，适用于答辩佐证与过程性材料归档。
                </p>
              </div>
              <div class="info-block info-block--perm">
                <h3 class="info-block__title">
                  <el-icon><Lock /></el-icon>
                  数据权限
                </h3>
                <p class="info-block__text">
                  仅可导出本人负责范围内、且由本人发布任务的数据；导出范围受系统数据隔离约束。
                </p>
              </div>
            </div>
          </div>
        </el-col>
      </el-row>

      <div class="panel">
        <div class="panel__header">
          <h2 class="panel__title">导出内容字段</h2>
          <span class="panel__meta">以下为导出文件包含的数据项（说明展示，暂不支持逐项勾选）</span>
        </div>
        <div class="panel__body">
          <div class="content-tags">
            <div v-for="item in exportContentItems" :key="item.key" class="content-tag">
              <el-icon class="content-tag__icon"><CircleCheck /></el-icon>
              <div class="content-tag__text">
                <span class="content-tag__label">{{ item.label }}</span>
                <span class="content-tag__desc">{{ item.desc }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="panel__header panel__header--row">
          <div>
            <h2 class="panel__title">最近导出记录</h2>
            <span class="panel__meta">本账号最近 20 条导出操作</span>
          </div>
          <el-checkbox v-model="filterLogsByTask" :disabled="!taskId" @change="loadExportLogs">
            仅当前任务
          </el-checkbox>
        </div>
        <div class="panel__body">
          <el-skeleton v-if="logsLoading" animated :rows="4" />
          <el-empty
            v-else-if="!exportLogs.length"
            description="暂无导出记录"
            :image-size="80"
            class="history-empty"
          >
            <p class="history-tip">完成导出后记录将显示在此处</p>
          </el-empty>
          <el-table v-else :data="exportLogs" stripe size="small" class="history-table">
            <el-table-column prop="createdAt" label="导出时间" width="168" />
            <el-table-column prop="exportTypeLabel" label="类型" width="140" />
            <el-table-column label="范围 / 任务" min-width="180" show-overflow-tooltip>
              <template #default="{ row }">
                {{ row.scopeLabel || row.taskTitle || '—' }}
              </template>
            </el-table-column>
            <el-table-column prop="fileName" label="文件名" min-width="160" show-overflow-tooltip />
            <el-table-column prop="rowCount" label="行数/附件" width="96" align="center">
              <template #default="{ row }">
                {{ row.rowCount != null ? row.rowCount : '—' }}
              </template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="88" align="center">
              <template #default="{ row }">
                <el-tag :type="row.status === 'success' ? 'success' : 'danger'" size="small">
                  {{ row.status === 'success' ? '成功' : '失败' }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import {
  CircleCheck,
  Document,
  FolderOpened,
  Lock,
  List,
  Upload,
  EditPen,
  Paperclip,
} from '@element-plus/icons-vue'
import { useUserStore } from '../../stores/user'
import { getAllTasks, getTasksByClass, getTasksByTeachingClass } from '../../api/task'
import { getSubmissionsByTask } from '../../api/submission'
import { getTeacherGradingWorkbench } from '../../api/submission'
import { listMyTeachingClasses } from '../../api/teachingClass'
import { downloadScoresExcel, downloadSubmissionsZip, getExportLogs } from '../../api/export'

const userStore = useUserStore()
const pageLoading = ref(true)
const publishScope = ref('class')
const audienceId = ref(null)
const taskId = ref(null)
const tasks = ref([])
const teachingClasses = ref([])
const allExportableTasks = ref([])
const workbenchRows = ref([])
const taskSubmissions = ref([])
const busyXlsx = ref(false)
const busyZip = ref(false)
const exportLogs = ref([])
const logsLoading = ref(false)
const filterLogsByTask = ref(false)

const exportContentItems = [
  { key: 'basic', label: '基本信息', desc: '学号、姓名、班级、提交时间' },
  { key: 'scores', label: '成绩数据', desc: 'AI 分、教师分、综合分' },
  { key: 'dims', label: '评价维度', desc: '各维度得分与权重' },
  { key: 'ai', label: 'AI 评语', desc: '智能批改反馈与建议' },
  { key: 'human', label: '教师复核评语', desc: '教师确认与补充说明' },
  { key: 'code', label: '代码运行结果', desc: '运行状态与输出摘要（如任务启用）' },
  { key: 'files', label: '提交附件', desc: '文档、源码、截图等原始材料' },
]

const legacyClasses = computed(() => {
  const raw = userStore.user?.managedClasses
  return Array.isArray(raw) ? raw : []
})

const audienceOptions = computed(() => {
  if (publishScope.value === 'teaching') {
    return teachingClasses.value.map((tc) => ({
      id: tc.id,
      label: [tc.class_name, tc.course_name].filter(Boolean).join(' · '),
    }))
  }
  return legacyClasses.value.map((c) => ({
    id: c.id,
    label: c.className || c.class_name,
  }))
})

const canExport = computed(() => !!audienceId.value && !!taskId.value)

const statsScopeTasks = computed(() => {
  let list = allExportableTasks.value
  if (audienceId.value) {
    if (publishScope.value === 'teaching') {
      list = list.filter((t) => Number(t.teaching_class_id) === Number(audienceId.value))
    } else {
      list = list.filter(
        (t) => Number(t.class_id) === Number(audienceId.value) && !t.teaching_class_id
      )
    }
  }
  if (taskId.value) {
    list = list.filter((t) => Number(t.id) === Number(taskId.value))
  }
  return list
})

const statTaskIds = computed(() => new Set(statsScopeTasks.value.map((t) => Number(t.id))))

function displayStat(num) {
  if (num == null || Number.isNaN(num)) return '--'
  return num
}

const statExportableTasks = computed(() => {
  const n = statsScopeTasks.value.length
  return n > 0 ? n : audienceId.value ? 0 : displayStat(null)
})

const statSubmitted = computed(() => {
  if (!statsScopeTasks.value.length) return taskId.value ? 0 : displayStat(null)
  if (taskId.value && taskSubmissions.value.length) return taskSubmissions.value.length
  return statsScopeTasks.value.reduce(
    (s, t) => s + (Number(t.submissionCount) || Number(t.submittedStudentCount) || 0),
    0
  )
})

const statGraded = computed(() => {
  if (!statTaskIds.value.size) return displayStat(null)
  const n = workbenchRows.value.filter(
    (r) =>
      statTaskIds.value.has(Number(r.task_id)) &&
      ['human_graded', 'human_reviewed', 'completed'].includes(r.grading_status)
  ).length
  return n
})

const statAttachments = computed(() => {
  if (taskId.value && taskSubmissions.value.length) return taskSubmissions.value.length
  if (!statsScopeTasks.value.length) return displayStat(null)
  return statsScopeTasks.value.reduce((s, t) => s + (Number(t.submissionCount) || 0), 0)
})

const overviewCards = computed(() => [
  {
    key: 'tasks',
    label: '可导出任务',
    value: statExportableTasks.value,
    hint: taskId.value ? '当前任务' : audienceId.value ? '当前班级范围' : '全部可导出',
    icon: List,
    tone: 'blue',
  },
  {
    key: 'submitted',
    label: '已提交作业',
    value: statSubmitted.value,
    hint: '含重复提交计次',
    icon: Upload,
    tone: 'teal',
  },
  {
    key: 'graded',
    label: '已批改记录',
    value: statGraded.value,
    hint: '教师已确认/复核',
    icon: EditPen,
    tone: 'indigo',
  },
  {
    key: 'files',
    label: '附件数量',
    value: statAttachments.value,
    hint: '按提交条目统计',
    icon: Paperclip,
    tone: 'slate',
  },
])

function taskOptionLabel(t) {
  const extra = [t.course_name, t.teaching_class_name, t.template_project_name].filter(Boolean).join(' · ')
  return extra ? `${t.title}（${extra}）` : t.title
}

async function loadTeachingClasses() {
  try {
    const res = await listMyTeachingClasses()
    if (res.success) teachingClasses.value = res.data || []
  } catch {
    teachingClasses.value = []
  }
}

async function loadOverviewData() {
  const uid = userStore.user?.id
  try {
    const [tasksRes, wbRes] = await Promise.all([
      getAllTasks(),
      getTeacherGradingWorkbench({ status: 'all' }),
    ])
    if (tasksRes.success) {
      const list = tasksRes.data || []
      allExportableTasks.value = uid
        ? list.filter((t) => Number(t.created_by) === Number(uid))
        : list
    }
    if (wbRes.success) workbenchRows.value = wbRes.data || []
  } catch {
    allExportableTasks.value = []
    workbenchRows.value = []
  }
}

function onScopeChange() {
  audienceId.value = audienceOptions.value[0]?.id ?? null
  onAudienceChange()
}

async function onAudienceChange() {
  taskId.value = null
  tasks.value = []
  taskSubmissions.value = []
  if (!audienceId.value) return
  try {
    const res =
      publishScope.value === 'teaching'
        ? await getTasksByTeachingClass(Number(audienceId.value))
        : await getTasksByClass(Number(audienceId.value))
    if (res.success) {
      const uid = userStore.user?.id
      const list = res.data || []
      tasks.value = uid ? list.filter((t) => Number(t.created_by) === Number(uid)) : list
    }
  } catch {
    tasks.value = []
  }
}

async function onTaskChange() {
  taskSubmissions.value = []
  if (!taskId.value) {
    if (filterLogsByTask.value) {
      filterLogsByTask.value = false
      loadExportLogs()
    }
    return
  }
  try {
    const res = await getSubmissionsByTask(taskId.value)
    if (res.success) taskSubmissions.value = res.data || []
  } catch {
    taskSubmissions.value = []
  }
  if (filterLogsByTask.value) loadExportLogs()
}

async function loadExportLogs() {
  logsLoading.value = true
  try {
    const opts = { limit: 20 }
    if (filterLogsByTask.value && taskId.value) opts.taskId = taskId.value
    const res = await getExportLogs(opts)
    exportLogs.value = res.success ? res.data || [] : []
  } catch {
    exportLogs.value = []
  } finally {
    logsLoading.value = false
  }
}

const exportOpts = () =>
  publishScope.value === 'teaching'
    ? { scope: 'teaching', teachingClassId: audienceId.value }
    : { scope: 'class' }

async function doXlsx() {
  if (!canExport.value) return
  busyXlsx.value = true
  try {
    await downloadScoresExcel(audienceId.value, taskId.value, exportOpts())
    ElMessage.success('导出任务已生成，请查看浏览器下载')
    loadExportLogs()
  } catch (e) {
    ElMessage.error(e?.message || '导出失败，请检查网络或稍后重试')
  } finally {
    busyXlsx.value = false
  }
}

async function doZip() {
  if (!canExport.value) return
  busyZip.value = true
  try {
    await downloadSubmissionsZip(audienceId.value, taskId.value, exportOpts())
    ElMessage.success('导出任务已生成，请查看浏览器下载')
    loadExportLogs()
  } catch (e) {
    ElMessage.error(e?.message || '打包下载失败，请检查网络或稍后重试')
  } finally {
    busyZip.value = false
  }
}

onMounted(async () => {
  pageLoading.value = true
  try {
    await userStore.fetchUserInfo()
    await Promise.all([loadTeachingClasses(), loadOverviewData(), loadExportLogs()])
    audienceId.value = audienceOptions.value[0]?.id ?? null
    if (audienceId.value) await onAudienceChange()
  } finally {
    pageLoading.value = false
  }
})
</script>

<style scoped>
.export-center {
  max-width: 1360px;
  margin: 0 auto;
  padding: 20px 4px 32px;
  min-height: calc(100vh - 120px);
}

.workbench-head {
  margin-bottom: 24px;
}

.workbench-title {
  margin: 0 0 8px;
  font-size: 24px;
  font-weight: 700;
  color: #0f172a;
  letter-spacing: -0.02em;
}

.workbench-subtitle {
  margin: 0;
  max-width: 44rem;
  font-size: 14px;
  line-height: 1.65;
  color: #64748b;
}

.workbench-skeleton {
  padding: 12px 0;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 14px;
  margin-bottom: 20px;
}

.metric-card {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 18px 16px;
  background: #fff;
  border: 1px solid #e8edf3;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
}

.metric-card__icon {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
}

.metric-card__icon--slate { background: #f1f5f9; color: #475569; }
.metric-card__icon--blue { background: #eff6ff; color: #1677ff; }
.metric-card__icon--teal { background: #f0fdfa; color: #0d9488; }
.metric-card__icon--indigo { background: #eef2ff; color: #4f46e5; }

.metric-card__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.metric-card__value {
  font-size: 26px;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
}

.metric-card__label {
  font-size: 13px;
  font-weight: 600;
  color: #475569;
}

.metric-card__hint {
  font-size: 11px;
  color: #94a3b8;
}

.config-row {
  margin-bottom: 20px;
}

.panel {
  background: #fff;
  border: 1px solid #e8edf3;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
  margin-bottom: 20px;
  height: 100%;
}

.panel--info {
  margin-bottom: 0;
}

.panel__header {
  padding: 16px 20px 14px;
  border-bottom: 1px solid #eef2f7;
  background: #fafbfc;
}

.panel__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #0f172a;
}

.panel__meta {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: #94a3b8;
}

.panel__body {
  padding: 20px;
}

.export-form :deep(.el-form-item__label) {
  font-weight: 600;
  color: #475569;
}

.export-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #f1f5f9;
}

.export-actions .el-button {
  border-radius: 10px;
  font-weight: 600;
}

.action-hint {
  margin: 12px 0 0;
  font-size: 12px;
  color: #94a3b8;
}

.info-block {
  padding: 14px 0;
  border-bottom: 1px solid #f1f5f9;
}

.info-block:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.info-block--perm {
  background: #f8fafc;
  margin: 8px -20px -20px;
  padding: 16px 20px;
  border-radius: 0 0 12px 12px;
  border-bottom: none;
}

.info-block__title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
}

.info-block__text {
  margin: 0;
  font-size: 13px;
  line-height: 1.65;
  color: #64748b;
}

.content-tags {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
}

.content-tag {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 14px 16px;
  border: 1px solid #e8edf3;
  border-radius: 10px;
  background: #fafbfc;
}

.content-tag__icon {
  flex-shrink: 0;
  font-size: 18px;
  color: #16a34a;
  margin-top: 2px;
}

.content-tag__text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.content-tag__label {
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
}

.content-tag__desc {
  font-size: 12px;
  color: #64748b;
  line-height: 1.5;
}

.panel__header--row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.history-table {
  width: 100%;
}

.history-empty {
  padding: 12px 0 8px;
}

.history-tip {
  margin: 8px 0 0;
  font-size: 13px;
  color: #94a3b8;
}

@media (max-width: 992px) {
  .panel--info {
    margin-bottom: 20px;
  }
}
</style>
