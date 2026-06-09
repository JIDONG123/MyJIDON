<template>
  <div class="tw-page">
    <header class="tw-head">
      <div class="tw-head__left">
        <el-button type="primary" plain @click="goBackCourses">返回课程</el-button>
        <div>
          <h1 class="tw-title">实训项目模板</h1>
          <p class="tw-subtitle">定义任务要求、评价指标与企业岗位标准，支持一键发布到教学班。</p>
          <p v-if="courseFilterLabel" class="tw-sub">当前课程：{{ courseFilterLabel }}</p>
        </div>
      </div>
      <div class="tw-head__actions">
        <el-button type="primary" @click="openEdit()">新建模板</el-button>
      </div>
    </header>

    <section class="tw-panel tw-filter-bar">
      <el-select v-model="courseFilter" clearable placeholder="按课程筛选" style="width: 280px" @change="load">
        <el-option v-for="c in courses" :key="c.id" :label="c.course_name" :value="c.id" />
      </el-select>
    </section>

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

    <section class="tw-panel" v-loading="loading">
      <div class="tw-panel__header">
        <h2 class="tw-panel__title">模板库</h2>
        <span class="tw-panel__meta">模板为课程级资源，发布到教学班后生成具体实训任务</span>
      </div>
      <div class="tw-panel__body">
        <el-empty v-if="!rows.length && !loading" description="暂无项目模板，点击「新建模板」开始配置" :image-size="96" />
        <div v-else class="tw-entity-grid">
          <article v-for="row in enrichedRows" :key="row.id" class="tw-entity-card">
            <div class="tw-entity-card__top">
              <div>
                <h3 class="tw-entity-card__title">{{ row.project_name }}</h3>
                <p class="tw-entity-card__code">{{ row.course_name || '—' }}</p>
              </div>
              <el-tag v-if="row.isPublished" size="small" type="success" effect="plain">已发布</el-tag>
            </div>

            <div class="tw-entity-card__meta">
              <el-tag size="small" type="info" effect="plain">创建者：{{ row.creator_name || '—' }}</el-tag>
            </div>

            <div class="tw-config-tags">
              <el-tag size="small" :type="row.config.requirements ? 'success' : 'info'" effect="plain">
                任务要求 {{ row.config.requirements ? '已配置' : '未配置' }}
              </el-tag>
              <el-tag size="small" :type="row.config.metrics ? 'success' : 'info'" effect="plain">
                评价指标 {{ row.config.metrics ? '已配置' : '未配置' }}
              </el-tag>
              <el-tag size="small" :type="row.config.enterprise ? 'success' : 'info'" effect="plain">
                岗位标准 {{ row.config.enterprise ? '已配置' : '未配置' }}
              </el-tag>
              <el-tag size="small" :type="row.config.materials ? 'success' : 'info'" effect="plain">
                提交材料 {{ row.config.materials ? '已配置' : '未配置' }}
              </el-tag>
            </div>

            <p class="tw-entity-card__note">发布到教学班后，系统将依据模板生成可批改的实训任务。</p>

            <div class="tw-entity-card__actions">
              <el-button type="primary" plain @click="openEdit(row)">编辑</el-button>
              <el-button type="success" plain @click="goSpawn(row)">发布到教学班</el-button>
              <el-button type="danger" plain @click="remove(row.id)">删除</el-button>
            </div>
          </article>
        </div>
      </div>
    </section>

    <el-dialog
      v-model="showDlg"
      :title="editing ? '编辑实训项目模板' : '新建实训项目模板'"
      width="720px"
      destroy-on-close
      class="tpl-dialog"
      align-center
    >
      <div class="tpl-dialog__body">
        <el-form label-width="120px" label-position="top" class="tpl-form">
          <section class="tpl-section">
            <h3 class="tpl-section__title">A. 基础信息</h3>
            <el-form-item label="所属课程" required>
              <el-select v-model="form.courseId" style="width: 100%">
                <el-option v-for="c in courses" :key="c.id" :label="c.course_name" :value="c.id" />
              </el-select>
            </el-form-item>
            <el-form-item label="项目名称" required>
              <el-input v-model="form.projectName" placeholder="如：Java Web 综合实训项目" />
            </el-form-item>
            <el-form-item label="项目描述">
              <el-input
                v-model="form.description"
                type="textarea"
                :rows="3"
                placeholder="说明项目背景、应用场景和学习目标"
              />
            </el-form-item>
          </section>

          <section class="tpl-section">
            <h3 class="tpl-section__title">B. 任务设计</h3>
            <el-form-item label="任务要求">
              <el-input
                v-model="form.requirements"
                type="textarea"
                :rows="4"
                placeholder="说明学生需要完成的功能、页面、接口或文档"
              />
            </el-form-item>
            <el-form-item label="建议提交材料">
              <el-input
                v-model="form.suggestedMaterials"
                type="textarea"
                :rows="3"
                placeholder="如源码压缩包、运行截图、说明文档、数据库脚本等"
              />
            </el-form-item>
          </section>

          <section class="tpl-section">
            <h3 class="tpl-section__title">C. 评价设计</h3>
            <el-form-item label="企业岗位标准">
              <el-input
                v-model="form.enterpriseStandard"
                type="textarea"
                :rows="3"
                placeholder="说明对应岗位能力要求，如编码规范、测试意识、文档交付"
              />
            </el-form-item>
            <el-form-item label="评价指标">
              <el-input
                v-model="form.evaluationMetricsText"
                type="textarea"
                :rows="4"
                placeholder="如 JSON 数组：[{&quot;name&quot;:&quot;功能完整性&quot;,&quot;weight&quot;:30,&quot;maxScore&quot;:30}]；或简要描述评分维度"
              />
              <p class="field-hint">支持 JSON 格式的评价维度数组，与任务表单中的评价指标结构一致。</p>
            </el-form-item>
          </section>
        </el-form>
      </div>
      <template #footer>
        <div class="tpl-dialog__footer">
          <el-button @click="showDlg = false">取消</el-button>
          <el-button type="primary" @click="save">保存模板</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  listProjectTemplates,
  createProjectTemplate,
  updateProjectTemplate,
  deleteProjectTemplate,
} from '../../api/projectTemplate'
import { listMyCourses } from '../../api/course'
import { getAllTasks } from '../../api/task'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Document, Promotion, Collection } from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const rows = ref([])
const courses = ref([])
const allTasks = ref([])
const courseFilter = ref(route.query.courseId ? Number(route.query.courseId) : null)
const courseFilterLabel = computed(() => {
  const id = courseFilter.value
  if (!id) return ''
  const c = courses.value.find((x) => x.id === id)
  return c?.course_name || ''
})
const showDlg = ref(false)
const editing = ref(null)
const form = reactive({
  courseId: null,
  projectName: '',
  description: '',
  requirements: '',
  enterpriseStandard: '',
  suggestedMaterials: '',
  evaluationMetricsText: '',
})

function isFieldConfigured(val) {
  if (val == null) return false
  if (typeof val === 'string') {
    const s = val.trim()
    if (!s) return false
    try {
      const parsed = JSON.parse(s)
      return Array.isArray(parsed) ? parsed.length > 0 : true
    } catch {
      return true
    }
  }
  if (Array.isArray(val)) return val.length > 0
  return Boolean(val)
}

function metricsToText(raw) {
  if (raw == null || raw === '') return ''
  if (typeof raw === 'string') {
    try {
      return JSON.stringify(JSON.parse(raw), null, 2)
    } catch {
      return raw
    }
  }
  return JSON.stringify(raw, null, 2)
}

function parseMetricsForSave(text) {
  const s = String(text || '').trim()
  if (!s) return undefined
  try {
    return JSON.parse(s)
  } catch {
    return s
  }
}

const publishedTemplateIds = computed(() => {
  const set = new Set()
  for (const t of allTasks.value) {
    if (t.project_template_id) set.add(Number(t.project_template_id))
  }
  return set
})

const enrichedRows = computed(() =>
  rows.value.map((row) => ({
    ...row,
    isPublished: publishedTemplateIds.value.has(Number(row.id)),
    config: {
      requirements: isFieldConfigured(row.requirements),
      metrics: isFieldConfigured(row.evaluation_metrics),
      enterprise: isFieldConfigured(row.enterprise_standard),
      materials: isFieldConfigured(row.suggested_materials),
    },
  }))
)

const relatedCourseCount = computed(() => {
  const ids = new Set(rows.value.map((r) => Number(r.course_id)).filter(Boolean))
  return ids.size
})

const publishedCount = computed(() =>
  enrichedRows.value.filter((r) => r.isPublished).length
)

const summaryCards = computed(() => [
  { key: 'total', label: '模板数', value: rows.value.length, icon: Document, tone: 'blue' },
  { key: 'pub', label: '已发布模板数', value: publishedCount.value, icon: Promotion, tone: 'teal' },
  { key: 'course', label: '关联课程数', value: relatedCourseCount.value, icon: Collection, tone: 'indigo' },
])

const load = async () => {
  loading.value = true
  try {
    const params = {}
    if (courseFilter.value) params.courseId = courseFilter.value
    const [tplRes, tasksRes] = await Promise.all([listProjectTemplates(params), getAllTasks()])
    if (tplRes.success) rows.value = tplRes.data || []
    if (tasksRes.success) allTasks.value = tasksRes.data || []
  } finally {
    loading.value = false
  }
}

const openEdit = (row) => {
  editing.value = row || null
  form.courseId = row?.course_id || courseFilter.value || courses.value[0]?.id || null
  form.projectName = row?.project_name || ''
  form.description = row?.description || ''
  form.requirements = row?.requirements || ''
  form.enterpriseStandard = row?.enterprise_standard || ''
  form.suggestedMaterials = row?.suggested_materials || ''
  form.evaluationMetricsText = metricsToText(row?.evaluation_metrics)
  showDlg.value = true
}

const save = async () => {
  if (!form.courseId || !form.projectName) {
    ElMessage.warning('请填写课程与项目名称')
    return
  }
  const payload = {
    courseId: form.courseId,
    projectName: form.projectName,
    description: form.description,
    requirements: form.requirements,
    enterpriseStandard: form.enterpriseStandard,
    suggestedMaterials: form.suggestedMaterials,
  }
  const metrics = parseMetricsForSave(form.evaluationMetricsText)
  if (metrics !== undefined) payload.evaluationMetrics = metrics

  try {
    if (editing.value) {
      await updateProjectTemplate(editing.value.id, payload)
    } else {
      await createProjectTemplate(payload)
    }
    ElMessage.success('保存成功')
    showDlg.value = false
    load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '保存失败')
  }
}

const remove = async (id) => {
  await ElMessageBox.confirm('确定删除该模板？', '提示', { type: 'warning' })
  await deleteProjectTemplate(id)
  ElMessage.success('已删除')
  load()
}

const goSpawn = (row) => {
  router.push({
    path: '/teacher/teaching-classes',
    query: { courseId: String(row.course_id), templateId: String(row.id), action: 'spawn' },
  })
}

const goBackCourses = () => {
  router.push('/teacher/courses')
}

onMounted(async () => {
  const cRes = await listMyCourses()
  if (cRes.success) courses.value = cRes.data
  load()
})
</script>

<style scoped>
.tpl-dialog__body {
  max-height: min(68vh, 640px);
  overflow-y: auto;
  padding-right: 4px;
}

.tpl-section {
  margin-bottom: 20px;
  padding-bottom: 8px;
  border-bottom: 1px solid #eef2f7;
}

.tpl-section:last-child {
  border-bottom: none;
  margin-bottom: 0;
}

.tpl-section__title {
  margin: 0 0 14px;
  font-size: 14px;
  font-weight: 700;
  color: #334155;
  letter-spacing: 0.02em;
}

.tpl-form :deep(.el-form-item__label) {
  font-weight: 600;
  color: #475569;
}

.field-hint {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: #94a3b8;
}

.tpl-dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>

<style>
.tpl-dialog .el-dialog__body {
  padding-top: 8px;
  padding-bottom: 8px;
}

.tpl-dialog .el-dialog__footer {
  border-top: 1px solid #eef2f7;
  padding-top: 14px;
}
</style>
