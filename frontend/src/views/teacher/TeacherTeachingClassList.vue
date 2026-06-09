<template>
  <div class="tw-page">
    <header class="tw-head">
      <div class="tw-head__left">
        <el-button v-if="fromCourse" type="primary" plain @click="goBackCourses">返回课程</el-button>
        <div>
          <h1 class="tw-title">我的教学班</h1>
          <p class="tw-subtitle">管理课程下的教学班、成员与实训安排。</p>
          <p v-if="fromCourse && courseFilterLabel" class="tw-sub">当前课程：{{ courseFilterLabel }}</p>
        </div>
      </div>
      <div class="tw-head__actions">
        <el-button type="primary" @click="openCreate">新建教学班</el-button>
      </div>
    </header>

    <el-skeleton v-if="loading" animated :rows="8" />

    <template v-else>
      <section class="tw-metric-grid">
        <div v-for="card in summaryCards" :key="card.key" class="tw-metric-card">
          <div class="tw-metric-card__icon" :class="`tw-metric-card__icon--${card.tone}`">
            <el-icon><component :is="card.icon" /></el-icon>
          </div>
          <div class="tw-metric-card__body">
            <span class="tw-metric-card__value">{{ card.value }}</span>
            <span class="tw-metric-card__label">{{ card.label }}</span>
          </div>
        </div>
      </section>

      <section class="tw-panel">
        <div class="tw-panel__header">
          <h2 class="tw-panel__title">教学班列表</h2>
          <span class="tw-panel__meta">共 {{ enrichedRows.length }} 个教学班</span>
        </div>
        <div class="tw-panel__body">
          <el-empty v-if="!enrichedRows.length" description="暂无教学班，可点击「新建教学班」创建" :image-size="96" />
          <div v-else class="tw-entity-grid">
            <article v-for="row in enrichedRows" :key="row.id" class="tw-entity-card">
              <div class="tw-entity-card__top">
                <div>
                  <h3 class="tw-entity-card__title">{{ row.class_name }}</h3>
                  <p class="tw-entity-card__code">{{ row.class_code || '—' }}</p>
                </div>
                <el-tag v-if="row.pendingCount > 0" size="small" type="warning" effect="plain">
                  {{ row.pendingCount }} 待批改
                </el-tag>
              </div>

              <div class="tw-entity-card__meta">
                <el-tag size="small" effect="plain">{{ row.course_name }}</el-tag>
                <el-tag size="small" type="info" effect="plain">{{ row.term_name || '—' }}</el-tag>
                <el-tag
                  v-for="label in courseRoleLabels(row.my_roles)"
                  :key="label"
                  size="small"
                  :type="roleTagType(row.my_roles, label)"
                  class="tw-role-tag"
                >
                  {{ label }}
                </el-tag>
              </div>

              <div class="tw-entity-card__stats">
                <span><strong>{{ row.student_count ?? 0 }}</strong> 学生</span>
                <span><strong>{{ row.taskCount }}</strong> 已发布任务</span>
                <span class="tw-entity-card__note-span">最近实训：{{ row.recentScheduleLabel }}</span>
              </div>

              <p class="tw-entity-card__note">具体授课班级：在此管理学生、课表、发布任务与查看成绩。</p>

              <div class="tw-entity-card__actions">
                <el-button type="primary" @click="goDetail(row.id)">进入班级工作台</el-button>
                <el-button plain @click="goCalendar(row.id)">课表</el-button>
                <el-button plain type="success" @click="spawnTask(row)">发布任务</el-button>
              </div>
            </article>
          </div>
        </div>
      </section>
    </template>

    <el-dialog v-model="showCreate" title="新建教学班" width="520px" destroy-on-close>
      <el-form label-width="100px">
        <el-form-item label="课程" required>
          <el-select v-model="form.courseId" filterable style="width: 100%">
            <el-option v-for="c in courses" :key="c.id" :label="`${c.course_code} ${c.course_name}`" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="学期" required>
          <el-select v-model="form.termId" filterable style="width: 100%">
            <el-option v-for="t in terms" :key="t.id" :label="t.name" :value="t.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="班代码" required>
          <el-input v-model="form.classCode" placeholder="如 SE2025-01" />
        </el-form-item>
        <el-form-item label="班名称" required>
          <el-input v-model="form.className" />
        </el-form-item>
        <el-form-item label="地点">
          <el-input v-model="form.location" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreate = false">取消</el-button>
        <el-button type="primary" @click="saveCreate">创建</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showSpawn" title="从模板一键发布任务" width="520px" destroy-on-close>
      <p class="spawn-hint">模板发布后将在本教学班生成具体实训任务，学生可在实训中心提交。</p>
      <el-form label-width="100px">
        <el-form-item label="项目模板" required>
          <el-select v-model="spawnForm.templateId" filterable style="width: 100%">
            <el-option v-for="tpl in templates" :key="tpl.id" :label="tpl.project_name" :value="tpl.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="截止时间" required>
          <el-date-picker
            v-model="spawnForm.deadline"
            type="datetime"
            value-format="YYYY-MM-DD HH:mm:ss"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="关联课次">
          <el-select
            v-model="spawnForm.scheduleId"
            clearable
            filterable
            placeholder="可选：发布后自动写入实训日历"
            style="width: 100%"
          >
            <el-option
              v-for="s in scheduleOptions"
              :key="s.id"
              :label="formatScheduleLabel(s)"
              :value="s.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showSpawn = false">取消</el-button>
        <el-button type="primary" :loading="spawnLoading" @click="doSpawn">发布</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { listMyTeachingClasses, createTeachingClass } from '../../api/teachingClass'
import { listMyCourses } from '../../api/course'
import { listTerms } from '../../api/term'
import { listProjectTemplates, spawnTaskFromTemplate } from '../../api/projectTemplate'
import { listCalendar } from '../../api/schedule'
import { getAllTasks } from '../../api/task'
import { getTeacherGradingWorkbench } from '../../api/submission'
import { COURSE_ROLE_LABELS, COURSE_ROLE_TAG_TYPE, courseRoleLabels } from '../../utils/courseRoleDisplay'
import { weekdayLabel, periodLabel } from '../../utils/trainingCalendarDisplay'
import { ElMessage } from 'element-plus'
import { OfficeBuilding, User, Document, EditPen } from '@element-plus/icons-vue'

const roleTagType = (myRoles, label) => {
  const code = (myRoles || []).find((c) => COURSE_ROLE_LABELS[c] === label)
  return COURSE_ROLE_TAG_TYPE[code] || 'info'
}

const route = useRoute()
const router = useRouter()
const loading = ref(true)
const rows = ref([])
const allTasks = ref([])
const pendingByTc = ref(new Map())
const scheduleByTc = ref(new Map())
const courses = ref([])
const terms = ref([])
const showCreate = ref(false)
const showSpawn = ref(false)
const spawnLoading = ref(false)
const spawnTcId = ref(null)
const templates = ref([])
const scheduleOptions = ref([])

const form = reactive({ courseId: null, termId: null, classCode: '', className: '', location: '' })
const spawnForm = reactive({ templateId: null, deadline: '', scheduleId: null })

const fromCourse = computed(() => Boolean(route.query.courseId))
const courseFilterLabel = computed(() => {
  const id = route.query.courseId ? Number(route.query.courseId) : null
  if (!id) return ''
  const row = rows.value.find((x) => x.course_id === id)
  return row?.course_name || courses.value.find((x) => x.id === id)?.course_name || ''
})

const weekLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const formatScheduleLabel = (s) => {
  const day = weekLabels[(s.weekday || 1) - 1] || `周${s.weekday}`
  const period = s.period_start != null ? `第${s.period_start}-${s.period_end}节` : ''
  const title = s.title || '实训安排'
  return `第${s.week_no}周 ${day} ${period} · ${title}`.replace(/\s+/g, ' ').trim()
}

function formatRecentSchedule(schedules) {
  if (!schedules?.length) return '暂无安排'
  const sorted = [...schedules].sort((a, b) => {
    const w = Number(b.week_no) - Number(a.week_no)
    if (w !== 0) return w
    const d = Number(a.weekday) - Number(b.weekday)
    if (d !== 0) return d
    return Number(a.period_start) - Number(b.period_start)
  })
  const s = sorted[0]
  return `第${s.week_no}周 ${weekdayLabel(s.weekday)} ${periodLabel(s)} · ${s.title || '实训'}`
}

const enrichedRows = computed(() =>
  rows.value.map((row) => {
    const tcId = Number(row.id)
    const tasks = allTasks.value.filter((t) => Number(t.teaching_class_id) === tcId)
    return {
      ...row,
      taskCount: tasks.length,
      pendingCount: pendingByTc.value.get(tcId) || 0,
      recentScheduleLabel: formatRecentSchedule(scheduleByTc.value.get(tcId)),
    }
  })
)

const totalStudents = computed(() =>
  rows.value.reduce((s, r) => s + (Number(r.student_count) || 0), 0)
)

const totalTasks = computed(() =>
  enrichedRows.value.reduce((s, r) => s + (Number(r.taskCount) || 0), 0)
)

const totalPending = computed(() =>
  enrichedRows.value.reduce((s, r) => s + (Number(r.pendingCount) || 0), 0)
)

const summaryCards = computed(() => [
  { key: 'tc', label: '教学班数', value: rows.value.length, icon: OfficeBuilding, tone: 'slate' },
  { key: 'stu', label: '学生总数', value: totalStudents.value, icon: User, tone: 'blue' },
  { key: 'task', label: '已发布任务', value: totalTasks.value, icon: Document, tone: 'teal' },
  { key: 'pending', label: '待批改', value: totalPending.value, icon: EditPen, tone: 'orange' },
])

const load = async () => {
  loading.value = true
  try {
    const params = {}
    if (route.query.courseId) params.courseId = route.query.courseId
    const [tcRes, tasksRes, pendingRes] = await Promise.all([
      listMyTeachingClasses(params),
      getAllTasks(),
      getTeacherGradingWorkbench({ status: 'pending' }).catch(() => ({ success: false, data: [] })),
    ])
    if (tcRes.success) rows.value = tcRes.data || []
    if (tasksRes.success) allTasks.value = tasksRes.data || []

    const pendingMap = new Map()
    for (const item of pendingRes.success ? pendingRes.data || [] : []) {
      const tcId = Number(item.teaching_class_id)
      if (tcId) pendingMap.set(tcId, (pendingMap.get(tcId) || 0) + 1)
    }
    pendingByTc.value = pendingMap

    if (rows.value.length) {
      const calResults = await Promise.all(
        rows.value.map((r) =>
          listCalendar({ teachingClassId: r.id }).catch(() => ({ success: false, data: [] }))
        )
      )
      const schedMap = new Map()
      rows.value.forEach((r, i) => {
        schedMap.set(Number(r.id), calResults[i]?.success ? calResults[i].data || [] : [])
      })
      scheduleByTc.value = schedMap
    } else {
      scheduleByTc.value = new Map()
    }
  } finally {
    loading.value = false
  }
}

const openCreate = async () => {
  const [cRes, tRes] = await Promise.all([listMyCourses(), listTerms()])
  if (cRes.success) courses.value = cRes.data
  if (tRes.success) terms.value = tRes.data
  form.courseId = route.query.courseId ? Number(route.query.courseId) : courses.value[0]?.id || null
  form.termId = terms.value.find((t) => t.is_current)?.id || terms.value[0]?.id || null
  showCreate.value = true
}

const saveCreate = async () => {
  if (!form.courseId || !form.termId || !form.classCode || !form.className) {
    ElMessage.warning('请填写必填项')
    return
  }
  try {
    await createTeachingClass({
      courseId: form.courseId,
      termId: form.termId,
      classCode: form.classCode,
      className: form.className,
      location: form.location,
    })
    ElMessage.success('创建成功')
    showCreate.value = false
    load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '创建失败')
  }
}

const goDetail = (id) => router.push(`/teacher/teaching-classes/${id}`)
const goCalendar = (id) => router.push({ path: '/teacher/training-calendar', query: { teachingClassId: String(id) } })
const goBackCourses = () => router.push('/teacher/courses')

const spawnTask = async (row) => {
  spawnTcId.value = row.id
  const [tplRes, calRes] = await Promise.all([
    listProjectTemplates({ courseId: row.course_id }),
    listCalendar({ teachingClassId: row.id }),
  ])
  templates.value = tplRes.success ? tplRes.data : []
  scheduleOptions.value = (calRes.success ? calRes.data : []).filter((s) => !s.task_id)
  if (!templates.value.length) {
    ElMessage.warning('该课程暂无项目模板，请先创建模板')
    router.push({ path: '/teacher/project-templates', query: { courseId: String(row.course_id) } })
    return
  }
  spawnForm.templateId = templates.value[0].id
  spawnForm.deadline = ''
  spawnForm.scheduleId = null
  showSpawn.value = true
}

const doSpawn = async () => {
  if (!spawnForm.templateId || !spawnForm.deadline) {
    ElMessage.warning('请选择模板并设置截止时间')
    return
  }
  spawnLoading.value = true
  try {
    const res = await spawnTaskFromTemplate(spawnForm.templateId, {
      teachingClassId: spawnTcId.value,
      deadline: spawnForm.deadline,
      scheduleId: spawnForm.scheduleId || undefined,
    })
    ElMessage.success('任务已发布')
    showSpawn.value = false
    if (res.success) router.push(`/teacher/submissions/${res.taskId}`)
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '发布失败')
  } finally {
    spawnLoading.value = false
  }
}

onMounted(async () => {
  await load()
  if (route.query.action === 'spawn' && route.query.templateId) {
    const courseId = route.query.courseId ? Number(route.query.courseId) : null
    const tid = Number(route.query.templateId)
    const tcRow =
      (courseId ? rows.value.find((r) => r.course_id === courseId) : null) || rows.value[0]
    if (tcRow) {
      await spawnTask(tcRow)
      spawnForm.templateId = tid
    }
  }
})
</script>

<style scoped>
.spawn-hint {
  margin: 0 0 16px;
  padding: 10px 12px;
  font-size: 13px;
  line-height: 1.55;
  color: #64748b;
  background: #f8fafc;
  border-radius: 8px;
  border: 1px solid #eef2f7;
}

.tw-entity-card__stats .tw-entity-card__note-span {
  grid-column: 1 / -1;
  font-size: 12px;
  color: #64748b;
}
</style>
