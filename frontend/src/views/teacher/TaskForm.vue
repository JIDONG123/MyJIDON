<template>
  <div class="page-task-form">
    <header class="page-head">
      <div class="page-head-row">
        <el-button type="primary" plain @click="$router.back()">返回</el-button>
        <div>
          <h1 class="page-title">{{ isEdit ? '编辑任务' : '发布任务' }}</h1>
          <p class="page-desc">对照教学要求与可选企业标准发布实训任务，支撑校企协同场景下的成果评价</p>
        </div>
      </div>
    </header>

    <el-form :model="form" label-width="168px" class="form-root">
      <el-card class="section-card" shadow="never">
        <template #header>
          <span class="section-title">基本信息</span>
        </template>
        <el-form-item label="任务标题">
          <el-input v-model="form.title" placeholder="请输入任务标题" maxlength="120" show-word-limit />
        </el-form-item>
        <el-form-item label="任务描述">
          <el-input v-model="form.description" type="textarea" :rows="3" placeholder="请输入任务描述" />
        </el-form-item>
        <el-form-item label="任务要求">
          <el-input
            v-model="form.requirements"
            type="textarea"
            :rows="4"
            placeholder="用于智能核查：逐条描述实训要求与步骤"
          />
        </el-form-item>
        <el-form-item label="评分标准">
          <el-input v-model="form.scoringCriteria" type="textarea" :rows="3" placeholder="文字版评分说明（可选），可与维度表一并作为 AI 量规" />
        </el-form-item>
      </el-card>

      <el-card class="section-card" shadow="never">
        <template #header>
          <span class="section-title">校企合作与任务场景</span>
        </template>
        <el-form-item label="场景类型">
          <el-select v-model="form.scenarioType" placeholder="选择实训场景" style="width: 100%">
            <el-option label="校内教学实训" value="teaching" />
            <el-option label="校企协同实训" value="enterprise_collab" />
            <el-option label="综合（教学 + 企业标准）" value="mixed" />
          </el-select>
        </el-form-item>
        <el-form-item label="企业 / 岗位能力标准">
          <el-input
            v-model="form.enterpriseStandard"
            type="textarea"
            :rows="4"
            placeholder="可选：填写合作企业交付规范、岗位技能点、代码与文档规范等；将与「任务要求」一并送入大模型做核查与评分。"
          />
        </el-form-item>
        <p class="hint-text">用于衔接岗位需求：留空则仅按教学侧要求评价；填写后智能核查结果中会输出「校企标准对齐」结论。</p>
      </el-card>

      <el-card class="section-card" shadow="never">
        <template #header>
          <div class="card-head-split">
            <span class="section-title">自定义评价维度与权重</span>
            <div class="toolbar">
              <span class="toolbar-label">表格密度</span>
              <el-radio-group v-model="mode" size="small">
                <el-radio-button value="default">{{ labelMap.default }}</el-radio-button>
                <el-radio-button value="compact">{{ labelMap.compact }}</el-radio-button>
                <el-radio-button value="comfortable">{{ labelMap.comfortable }}</el-radio-button>
              </el-radio-group>
              <el-button type="primary" link @click="addMetric">添加维度</el-button>
            </div>
          </div>
        </template>
        <el-table :data="form.evaluationMetrics" border :size="tableSize">
          <el-table-column label="指标名称" min-width="140">
            <template #default="{ row }">
              <el-input v-model="row.name" placeholder="如：代码质量" />
            </template>
          </el-table-column>
          <el-table-column label="权重(%)" width="120">
            <template #default="{ row }">
              <el-input-number v-model="row.weight" :min="0" :max="100" :step="5" controls-position="right" />
            </template>
          </el-table-column>
          <el-table-column label="满分" width="120">
            <template #default="{ row }">
              <el-input-number v-model="row.maxScore" :min="0" :max="1000" :step="1" controls-position="right" />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="90" align="center">
            <template #default="{ $index }">
              <el-button type="danger" link @click="removeMetric($index)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div class="metrics-sum">权重合计：{{ weightSum }}%（建议 100；满分之和可与任务满分一致）</div>
      </el-card>

      <el-card class="section-card" shadow="never">
        <template #header>
          <span class="section-title">综合得分权重（AI / 教师）</span>
        </template>
        <el-form-item label-width="0">
          <el-switch
            v-model="form.useGlobalScoreWeights"
            active-text="使用系统默认权重"
            inactive-text="本任务自定义权重"
          />
        </el-form-item>
        <template v-if="!form.useGlobalScoreWeights">
          <el-row :gutter="16">
            <el-col :xs="24" :sm="12">
              <el-form-item label="AI 权重">
                <el-input-number v-model="form.scoreAiWeight" :min="0" :max="1" :step="0.05" style="width: 100%" />
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="12">
              <el-form-item label="教师权重">
                <el-input-number v-model="form.scoreHumanWeight" :min="0" :max="1" :step="0.05" style="width: 100%" />
              </el-form-item>
            </el-col>
          </el-row>
          <p class="metrics-sum">
            教师提交复核分后：综合分 = AI×AI权重 + 教师×教师权重。留空或开启「系统默认」则与「系统设置」一致。
          </p>
        </template>
      </el-card>

      <el-card class="section-card" shadow="never">
        <template #header>
          <span class="section-title">校企双轨评分权重（教师复核分 vs 企业导师分）</span>
        </template>
        <p class="hint-text">
          与上方「AI/教师」权重不同：此处决定<strong>校内综合分</strong>与<strong>企业导师分</strong>合成最终总分的比例，两者之和须为
          100%。企业导师仅批改企业分，不修改教师复核分。
        </p>
        <el-row :gutter="16">
          <el-col :xs="24" :sm="12">
            <el-form-item label="校内评分权重 %">
              <el-input-number v-model="form.campusGradeWeight" :min="0" :max="100" :step="5" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12">
            <el-form-item label="企业评分权重 %">
              <el-input-number v-model="form.enterpriseGradeWeight" :min="0" :max="100" :step="5" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <p class="metrics-sum">校内 + 企业 = {{ dualWeightSum }}%（须等于 100）</p>
      </el-card>

      <el-card class="section-card" shadow="never">
        <template #header>
          <div class="card-head-split">
            <span class="section-title">智能核查 · 步骤清单与任务难度</span>
            <el-button type="primary" link @click="addStep">添加步骤</el-button>
          </div>
        </template>
        <el-form-item label="任务难度">
          <div class="field-stack">
            <el-select v-model="form.difficultyLevel" placeholder="选择难度" style="width: 100%">
              <el-option label="基础巩固" value="basic" />
              <el-option label="标准实训" value="standard" />
              <el-option label="进阶 / 拓展" value="advanced" />
            </el-select>
            <p class="hint-text hint-text--tight">
              推荐填写。学生端「推荐任务」会结合历史均分、维度薄弱与难度标签，在本班已发布任务中筛选其<strong>尚未提交</strong>的对应档位任务；教师可在班级详情页调整分层分数线。
            </p>
          </div>
        </el-form-item>
        <el-table :data="form.stepChecklist" border size="small" class="step-table">
          <el-table-column label="步骤序号" width="100">
            <template #default="{ row }">
              <el-input-number v-model="row.id" :min="1" :step="1" controls-position="right" />
            </template>
          </el-table-column>
          <el-table-column label="步骤标题" min-width="160">
            <template #default="{ row }">
              <el-input v-model="row.title" placeholder="如：需求分析文档" />
            </template>
          </el-table-column>
          <el-table-column label="必做" width="80" align="center">
            <template #default="{ row }">
              <el-checkbox v-model="row.required" />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="80" align="center">
            <template #default="{ $index }">
              <el-button type="danger" link @click="removeStep($index)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
        <p class="hint-text">提交后由大模型对照清单输出步骤完成度；教师可在批改页手工修正核查项。</p>
      </el-card>

      <el-card class="section-card" shadow="never">
        <template #header>
          <span class="section-title">发布设置</span>
        </template>
        <el-form-item label="截止时间">
          <el-date-picker
            v-model="form.deadline"
            type="datetime"
            placeholder="选择截止时间"
            style="width: 100%"
            value-format="YYYY-MM-DD HH:mm:ss"
            format="YYYY-MM-DD HH:mm"
          />
          <p class="hint-text hint-text--tight">
            教师可随时修改并延长截止时间；提交为「年-月-日 时:分:秒」格式，与后端 MySQL 一致，避免 ISO 时间字符串导致更新失败。
          </p>
        </el-form-item>
        <el-form-item label="发布班级" required>
          <el-select v-model="form.classId" placeholder="必选：仅该班学生可见本任务" style="width: 100%">
            <el-option v-for="cls in classes" :key="cls.id" :label="cls.class_name" :value="cls.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="满分">
          <el-input v-model.number="form.maxScore" type="number" placeholder="默认100分" />
        </el-form-item>
        <el-form-item label="最大提交次数">
          <el-input-number
            v-model="form.maxSubmissions"
            :min="1"
            :max="9999"
            :step="1"
            :precision="0"
            controls-position="right"
            style="width: 200px"
          />
          <p class="hint-text hint-text--tight">
            学生最多可成功提交作业的次数（每次点击提交成功计 1 次，含修改重交）；达到上限后将无法再次提交。
          </p>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" size="large" @click="saveTask">保存</el-button>
        </el-form-item>
      </el-card>
    </el-form>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { createTask, updateTask, getTaskById } from '../../api/task'
import { getAllClasses } from '../../api/class'
import { ElMessage } from 'element-plus'
import { useTableDensity } from '../../composables/useTableDensity'

const route = useRoute()
const router = useRouter()
const classes = ref([])
const { mode, tableSize, labelMap } = useTableDensity()

const isEdit = computed(() => !!route.params.id)

const defaultMetrics = () => [
  { name: '代码质量', weight: 25, maxScore: 25 },
  { name: '文档规范性', weight: 25, maxScore: 25 },
  { name: '功能实现度', weight: 30, maxScore: 30 },
  { name: '综合表现', weight: 20, maxScore: 20 },
]

const form = reactive({
  title: '',
  description: '',
  requirements: '',
  scoringCriteria: '',
  scenarioType: 'mixed',
  enterpriseStandard: '',
  deadline: '',
  classId: '',
  maxScore: 100,
  maxSubmissions: 1,
  evaluationMetrics: defaultMetrics(),
  useGlobalScoreWeights: true,
  scoreAiWeight: 0.4,
  scoreHumanWeight: 0.6,
  campusGradeWeight: 50,
  enterpriseGradeWeight: 50,
  difficultyLevel: 'standard',
  stepChecklist: [],
})

const weightSum = computed(() =>
  form.evaluationMetrics.reduce((s, x) => s + (Number(x.weight) || 0), 0)
)

const dualWeightSum = computed(
  () => (Number(form.campusGradeWeight) || 0) + (Number(form.enterpriseGradeWeight) || 0)
)

const addMetric = () => {
  form.evaluationMetrics.push({ name: '', weight: 10, maxScore: 10 })
}

const removeMetric = (idx) => {
  form.evaluationMetrics.splice(idx, 1)
}

const addStep = () => {
  const nextId =
    form.stepChecklist.length === 0
      ? 1
      : Math.max(...form.stepChecklist.map((s) => Number(s.id) || 0), 0) + 1
  form.stepChecklist.push({ id: nextId, title: '', required: true })
}

const removeStep = (idx) => {
  form.stepChecklist.splice(idx, 1)
}

/** 将接口返回的截止时间转为与 el-date-picker value-format 一致的字符串 */
function normalizeDeadlineForPicker(v) {
  if (v == null || v === '') return ''
  const s = String(v).trim()
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/)
  if (m) return `${m[1]} ${m[2]}`
  return s
}

const loadClasses = async () => {
  try {
    const response = await getAllClasses()
    if (response.success) {
      classes.value = response.data
    }
  } catch (error) {
    console.error('获取班级列表失败:', error)
  }
}

const loadTaskInfo = async () => {
  if (!isEdit.value) return

  try {
    const response = await getTaskById(route.params.id)
    if (response.success) {
      const task = response.data
      form.title = task.title
      form.description = task.description || ''
      form.requirements = task.requirements || ''
      form.scoringCriteria = task.scoring_criteria || ''
      form.scenarioType = task.scenario_type || 'mixed'
      form.enterpriseStandard = task.enterprise_standard || ''
      form.deadline = normalizeDeadlineForPicker(task.deadline)
      form.classId = task.class_id || ''
      form.maxScore = task.max_score || 100
      form.maxSubmissions =
        task.max_submissions != null && task.max_submissions !== '' ? Math.max(1, parseInt(String(task.max_submissions), 10) || 1) : 1
      const em = task.evaluation_metrics
      if (Array.isArray(em) && em.length) {
        form.evaluationMetrics = em.map((x) => ({
          name: x.name,
          weight: Number(x.weight) || 0,
          maxScore: Number(x.maxScore != null ? x.maxScore : x.weight) || 0,
        }))
      } else {
        form.evaluationMetrics = defaultMetrics()
      }

      const taw = task.score_ai_weight
      const thw = task.score_human_weight
      if (taw != null && thw != null && taw !== '' && thw !== '') {
        form.useGlobalScoreWeights = false
        form.scoreAiWeight = Number(taw)
        form.scoreHumanWeight = Number(thw)
      } else {
        form.useGlobalScoreWeights = true
        form.scoreAiWeight = 0.4
        form.scoreHumanWeight = 0.6
      }

      const cg = task.campus_grade_weight
      const eg = task.enterprise_grade_weight
      if (cg != null && cg !== '' && eg != null && eg !== '') {
        form.campusGradeWeight = Number(cg)
        form.enterpriseGradeWeight = Number(eg)
      } else {
        form.campusGradeWeight = 50
        form.enterpriseGradeWeight = 50
      }
      form.difficultyLevel = task.difficulty_level || 'standard'
      const sc = task.step_checklist
      let steps = sc
      if (typeof steps === 'string') {
        try {
          steps = JSON.parse(steps)
        } catch {
          steps = []
        }
      }
      if (Array.isArray(steps) && steps.length) {
        form.stepChecklist = steps.map((x, i) => ({
          id: x.id != null ? Number(x.id) : i + 1,
          title: x.title || x.name || '',
          required: Boolean(x.required),
        }))
      } else {
        form.stepChecklist = []
      }
    }
  } catch (error) {
    console.error('获取任务信息失败:', error)
  }
}

const saveTask = async () => {
  if (!form.title || !form.deadline) {
    ElMessage.error('请填写必填字段')
    return
  }
  if (!form.classId) {
    ElMessage.error('请选择发布班级')
    return
  }

  if (Math.abs(dualWeightSum.value - 100) > 0.01) {
    ElMessage.error('校内评分权重与企业评分权重之和须为 100%')
    return
  }

  const maxSub = Math.max(1, parseInt(String(form.maxSubmissions), 10) || 1)
  if (!Number.isFinite(maxSub) || maxSub < 1) {
    ElMessage.error('最大提交次数须为不小于 1 的整数')
    return
  }

  const stepsPayload = form.stepChecklist
    .filter((s) => String(s.title || '').trim())
    .map((s, i) => ({
      id: s.id != null ? Number(s.id) : i + 1,
      title: String(s.title).trim(),
      required: Boolean(s.required),
    }))

  const payload = {
    title: form.title,
    description: form.description,
    requirements: form.requirements,
    scoringCriteria: form.scoringCriteria,
    scenarioType: form.scenarioType,
    enterpriseStandard: form.enterpriseStandard,
    evaluationMetrics: form.evaluationMetrics.filter((x) => x.name && x.maxScore > 0),
    deadline: form.deadline,
    classId: form.classId || null,
    maxScore: form.maxScore,
    maxSubmissions: maxSub,
    scoreAiWeight: form.useGlobalScoreWeights ? null : form.scoreAiWeight,
    scoreHumanWeight: form.useGlobalScoreWeights ? null : form.scoreHumanWeight,
    campusGradeWeight: form.campusGradeWeight,
    enterpriseGradeWeight: form.enterpriseGradeWeight,
    difficultyLevel: form.difficultyLevel,
    stepChecklist: stepsPayload.length ? stepsPayload : null,
  }

  const tasksHome = route.path.startsWith('/admin') ? '/admin/tasks' : '/teacher/tasks'

  try {
    if (isEdit.value) {
      await updateTask(route.params.id, payload)
      ElMessage.success('更新成功')
    } else {
      await createTask(payload)
      ElMessage.success('创建成功')
    }
    router.push(tasksHome)
  } catch (error) {
    const msg =
      error?.response?.data?.message ||
      error?.response?.data?.error ||
      error?.message ||
      '操作失败'
    ElMessage.error(msg)
    console.error(error)
  }
}

onMounted(async () => {
  await loadClasses()
  await loadTaskInfo()
  if (!isEdit.value && route.query.classId) {
    const cid = Number(route.query.classId)
    const ok = classes.value.some((c) => Number(c.id) === cid)
    if (ok) form.classId = cid
  }
})
</script>

<style scoped>
.page-task-form {
  max-width: 960px;
}

.page-head {
  margin-bottom: 20px;
}

.page-head-row {
  display: flex;
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

.form-root {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 长标签换行时与右侧内容顶部对齐，避免与下方说明文字叠在一起 */
.form-root :deep(.el-form-item) {
  align-items: flex-start;
}

.form-root :deep(.el-form-item__label) {
  line-height: 1.45;
  white-space: normal;
  height: auto !important;
  padding-top: 2px;
}

.form-root :deep(.el-form-item__content) {
  align-self: stretch;
}

.field-stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.hint-text--tight {
  margin: 0;
}

.section-card {
  border-radius: var(--sg-radius-lg);
  border: 1px solid var(--sg-border);
}

.section-title {
  font-weight: 600;
  color: var(--sg-text);
}

.card-head-split {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.toolbar-label {
  font-size: 12px;
  color: var(--sg-text-secondary);
}

.metrics-sum {
  margin-top: 12px;
  font-size: 12px;
  color: var(--sg-text-secondary);
}

.hint-text {
  margin: 0;
  font-size: 12px;
  color: var(--sg-text-placeholder);
  line-height: 1.6;
}

.step-table {
  margin-top: 12px;
}
</style>
