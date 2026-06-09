<template>
  <div class="task-wizard-page">
    <header class="page-head">
      <el-button class="back-btn" @click="router.back()">
        <el-icon><ArrowLeft /></el-icon>
        返回
      </el-button>
      <div class="head-text">
        <h1 class="page-title">{{ isEdit ? '编辑任务' : '发布任务' }}</h1>
        <p class="page-desc">分步骤填写实训任务信息，右侧可实时查看发布摘要与检查清单</p>
      </div>
    </header>

    <nav class="steps-bar" aria-label="发布任务步骤">
      <div class="wizard-steps">
        <template v-for="(s, i) in stepDefs" :key="s.key">
          <div
            v-if="i > 0"
            class="step-connector"
            :class="{ 'is-filled': i <= currentStep }"
            aria-hidden="true"
          />
          <button
            type="button"
            class="wizard-step"
            :class="stepItemClass(i)"
            :disabled="i > currentStep"
            @click="goToStep(i)"
          >
            <span class="step-node" :aria-current="i === currentStep ? 'step' : undefined">
              <el-icon v-if="i < currentStep" class="step-icon"><Check /></el-icon>
              <el-icon v-else-if="stepHasError(i)" class="step-icon"><Warning /></el-icon>
              <span v-else class="step-num">{{ i + 1 }}</span>
            </span>
            <span class="step-label">{{ s.title }}</span>
          </button>
        </template>
      </div>
      <div class="steps-meta">
        <span class="steps-counter">步骤 {{ currentStep + 1 }} / {{ stepDefs.length }}</span>
        <span class="steps-current">{{ stepDefs[currentStep]?.title }}</span>
      </div>
    </nav>

    <div class="page-layout">
      <!-- 左侧：当前步骤表单 -->
      <main class="col-main">
        <el-form :model="form" label-width="140px" class="wizard-form">
          <!-- Step 0：基础信息 -->
          <section v-show="currentStep === 0" class="panel-card">
            <h2 class="panel-title">基础信息</h2>
            <el-form-item label="任务标题" required>
              <el-input v-model="form.title" placeholder="请输入任务标题" maxlength="120" show-word-limit />
            </el-form-item>
            <el-form-item label="任务描述">
              <el-input v-model="form.description" type="textarea" :rows="3" placeholder="简要说明实训目标与背景" />
            </el-form-item>
            <el-form-item label="发布对象" required>
              <el-radio-group v-model="publishMode" :disabled="isEdit && !!form.teachingClassId">
                <el-radio value="class">行政班</el-radio>
                <el-radio value="teaching">教学班</el-radio>
              </el-radio-group>
            </el-form-item>
            <el-form-item v-if="publishMode === 'class'" label="行政班" required>
              <el-select v-model="form.classId" placeholder="选择行政班" filterable class="field-full">
                <el-option v-for="cls in classes" :key="cls.id" :label="cls.class_name" :value="cls.id" />
              </el-select>
            </el-form-item>
            <el-form-item v-else label="教学班 / 课程" required>
              <el-select v-model="form.teachingClassId" placeholder="选择教学班" filterable class="field-full">
                <el-option
                  v-for="tc in teachingClasses"
                  :key="tc.id"
                  :label="`${tc.class_name}（${tc.course_name || '课程'}）`"
                  :value="tc.id"
                />
              </el-select>
              <p v-if="selectedTeachingClass" class="field-hint">
                课程：{{ selectedTeachingClass.course_name || '—' }}
              </p>
            </el-form-item>
            <el-form-item label="实训场景">
              <el-select v-model="form.scenarioType" placeholder="选择实训场景" class="field-full">
                <el-option label="校内教学实训" value="teaching" />
                <el-option label="校企协同实训" value="enterprise_collab" />
                <el-option label="综合（教学 + 企业标准）" value="mixed" />
              </el-select>
            </el-form-item>
            <el-form-item label="截止时间" required>
              <el-date-picker
                v-model="form.deadline"
                type="datetime"
                placeholder="选择截止时间"
                class="field-full"
                value-format="YYYY-MM-DD HH:mm:ss"
                format="YYYY-MM-DD HH:mm"
              />
            </el-form-item>
            <el-row :gutter="16">
              <el-col :xs="24" :sm="12">
                <el-form-item label="满分" required>
                  <el-input v-model.number="form.maxScore" type="number" placeholder="默认 100" />
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="12">
                <el-form-item label="最大提交次数" required>
                  <el-input-number
                    v-model="form.maxSubmissions"
                    :min="1"
                    :max="9999"
                    :step="1"
                    controls-position="right"
                    class="field-full"
                  />
                </el-form-item>
              </el-col>
            </el-row>
          </section>

          <!-- Step 1：任务要求 -->
          <section v-show="currentStep === 1" class="panel-card">
            <h2 class="panel-title">任务要求</h2>
            <el-form-item label="完成要求">
              <el-input
                v-model="form.requirements"
                type="textarea"
                :rows="6"
                placeholder="逐条填写，每行一条。例如：&#10;完成用户登录&#10;完成学生信息 CRUD&#10;提交设计文档"
              />
              <p class="field-hint">用于智能核查：建议逐条描述实训要求与步骤，每行一条。</p>
            </el-form-item>
            <div v-if="requirementsLines.length" class="checklist-preview">
              <span class="checklist-label">要求预览</span>
              <ul class="check-list">
                <li v-for="(line, i) in requirementsLines" :key="i">
                  <span class="check-box" aria-hidden="true" />
                  <span>{{ line }}</span>
                </li>
              </ul>
            </div>
            <el-form-item label="提交材料要求">
              <el-input
                v-model="form.scoringCriteria"
                type="textarea"
                :rows="4"
                placeholder="例如：&#10;项目设计文档 docx/pdf&#10;源码压缩包 zip&#10;运行截图 png/jpg"
              />
            </el-form-item>
            <div v-if="materialsLines.length" class="checklist-preview">
              <span class="checklist-label">材料清单预览</span>
              <ul class="check-list check-list--material">
                <li v-for="(line, i) in materialsLines" :key="i">
                  <span class="check-box check-box--empty" aria-hidden="true" />
                  <span>{{ line }}</span>
                </li>
              </ul>
            </div>
            <el-collapse class="adv-collapse">
              <el-collapse-item title="企业 / 岗位能力标准（高级，可选）" name="enterprise">
                <el-form-item label-width="0">
                  <el-input
                    v-model="form.enterpriseStandard"
                    type="textarea"
                    :rows="4"
                    placeholder="合作企业交付规范、岗位技能点等；留空则仅按教学侧要求评价。"
                  />
                </el-form-item>
              </el-collapse-item>
            </el-collapse>
          </section>

          <!-- Step 2：评价规则 -->
          <section v-show="currentStep === 2" class="panel-card">
            <h2 class="panel-title">评价规则</h2>
            <el-form-item label="评价模板">
              <el-select v-model="evalTemplate" class="field-full" @change="applyEvalTemplate">
                <el-option label="Java Web 项目实训" value="java_web" />
                <el-option label="Vue3 前端实训" value="vue3" />
                <el-option label="大模型应用开发实训" value="llm" />
                <el-option label="自定义" value="custom" />
              </el-select>
            </el-form-item>
            <div class="metrics-toolbar">
              <span class="metrics-sum" :class="{ 'metrics-sum--warn': !weightValid }">
                维度权重合计：{{ weightSum }}%
                <template v-if="!weightValid">（须等于 100%）</template>
                <template v-else>（已通过）</template>
              </span>
              <el-button type="primary" link @click="addMetric">添加维度</el-button>
            </div>
            <el-table :data="form.evaluationMetrics" border size="small" class="metrics-table">
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
              <el-table-column label="操作" width="80" align="center">
                <template #default="{ $index }">
                  <el-button type="danger" link @click="removeMetric($index)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
            <el-form-item label="AI / 教师权重" class="mt-block">
              <el-switch
                v-model="form.useGlobalScoreWeights"
                active-text="使用系统默认"
                inactive-text="本任务自定义"
              />
            </el-form-item>
            <el-row v-if="!form.useGlobalScoreWeights" :gutter="16">
              <el-col :xs="24" :sm="12">
                <el-form-item label="AI 权重">
                  <el-input-number v-model="form.scoreAiWeight" :min="0" :max="1" :step="0.05" class="field-full" />
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="12">
                <el-form-item label="教师权重">
                  <el-input-number v-model="form.scoreHumanWeight" :min="0" :max="1" :step="0.05" class="field-full" />
                </el-form-item>
              </el-col>
            </el-row>
            <el-collapse class="adv-collapse">
              <el-collapse-item title="校企双轨评分权重（高级）" name="dual">
                <p class="field-hint">校内综合分与企业导师分合成最终总分，两者之和须为 100%。</p>
                <el-row :gutter="16">
                  <el-col :xs="24" :sm="12">
                    <el-form-item label="校内权重 %">
                      <el-input-number v-model="form.campusGradeWeight" :min="0" :max="100" :step="5" class="field-full" />
                    </el-form-item>
                  </el-col>
                  <el-col :xs="24" :sm="12">
                    <el-form-item label="企业权重 %">
                      <el-input-number v-model="form.enterpriseGradeWeight" :min="0" :max="100" :step="5" class="field-full" />
                    </el-form-item>
                  </el-col>
                </el-row>
                <p class="metrics-sum" :class="{ 'metrics-sum--warn': !dualWeightValid }">
                  校内 + 企业 = {{ dualWeightSum }}%（须等于 100%）
                </p>
              </el-collapse-item>
            </el-collapse>
          </section>

          <!-- Step 3：发布设置 -->
          <section v-show="currentStep === 3" class="panel-card">
            <h2 class="panel-title">发布设置</h2>
            <el-form-item label="任务难度">
              <el-select v-model="form.difficultyLevel" placeholder="选择难度" class="field-full">
                <el-option label="基础巩固" value="basic" />
                <el-option label="标准实训" value="standard" />
                <el-option label="进阶 / 拓展" value="advanced" />
              </el-select>
              <p class="field-hint">用于学生端「推荐任务」难度档位筛选。</p>
            </el-form-item>
            <el-form-item label="允许重复提交">
              <el-switch v-model="allowResubmit" active-text="允许多次提交" inactive-text="仅允许 1 次" />
            </el-form-item>
            <el-form-item label="企业导师评分">
              <el-switch
                v-model="enterpriseScoringEnabled"
                active-text="启用"
                inactive-text="不启用"
              />
              <p class="field-hint">启用后将使用校企双轨权重合成最终得分。</p>
            </el-form-item>
            <el-form-item label="AI 自动核查">
              <el-tag type="success" effect="plain">系统默认启用</el-tag>
              <p class="field-hint">提交后自动解析附件并对照任务要求进行智能核查。</p>
            </el-form-item>
            <template v-if="codeRunnerOn">
              <el-divider content-position="left">代码运行检查（可选）</el-divider>
              <el-form-item label="启用运行检查">
                <el-switch v-model="form.codeRunEnabled" active-text="启用" inactive-text="关闭" />
                <p class="field-hint">
                  学生提交对应语言源码（或含入口文件的 zip）后，Worker 自动运行并供 AI 参考。支持 Python / Node.js / C / C++ / Java。
                </p>
              </el-form-item>
              <template v-if="form.codeRunEnabled">
                <el-form-item label="运行语言">
                  <el-select
                    v-model="form.codeRunLanguage"
                    class="field-narrow"
                    @change="onCodeRunLanguageChange"
                  >
                    <el-option
                      v-for="opt in CODE_RUN_LANGUAGES"
                      :key="opt.value"
                      :label="opt.label"
                      :value="opt.value"
                    />
                  </el-select>
                </el-form-item>
                <el-form-item label="超时（秒）">
                  <el-input-number
                    v-model="form.codeRunTimeoutSec"
                    :min="2"
                    :max="60"
                    controls-position="right"
                    class="field-narrow"
                  />
                </el-form-item>
                <el-form-item label="入口文件名">
                  <el-input
                    v-model="form.codeRunEntryFile"
                    :placeholder="defaultEntryFile(form.codeRunLanguage)"
                    class="field-narrow"
                  />
                </el-form-item>
                <el-form-item label="AI 批改前等待">
                  <el-switch
                    v-model="form.codeRunGradeAfterRun"
                    active-text="须先完成运行"
                    inactive-text="不强制"
                  />
                </el-form-item>
              </template>
            </template>
            <el-form-item label="学生查看 AI 评语">
              <el-tag type="info" effect="plain">系统默认允许</el-tag>
              <p class="field-hint">学生可在成绩报告中查看 AI 评语与核查结果。</p>
            </el-form-item>
            <el-collapse class="adv-collapse">
              <el-collapse-item title="智能核查步骤清单（高级，可选）" name="steps">
                <div class="metrics-toolbar">
                  <span class="field-hint">对照清单输出步骤完成度；教师可在批改页修正。</span>
                  <el-button type="primary" link @click="addStep">添加步骤</el-button>
                </div>
                <el-table :data="form.stepChecklist" border size="small" class="step-table">
                  <el-table-column label="序号" width="90">
                    <template #default="{ row }">
                      <el-input-number v-model="row.id" :min="1" controls-position="right" />
                    </template>
                  </el-table-column>
                  <el-table-column label="步骤标题" min-width="160">
                    <template #default="{ row }">
                      <el-input v-model="row.title" placeholder="如：需求分析文档" />
                    </template>
                  </el-table-column>
                  <el-table-column label="必做" width="70" align="center">
                    <template #default="{ row }">
                      <el-checkbox v-model="row.required" />
                    </template>
                  </el-table-column>
                  <el-table-column label="操作" width="70" align="center">
                    <template #default="{ $index }">
                      <el-button type="danger" link @click="removeStep($index)">删</el-button>
                    </template>
                  </el-table-column>
                </el-table>
              </el-collapse-item>
            </el-collapse>
          </section>

          <!-- Step 4：确认发布 -->
          <section v-show="currentStep === 4" class="panel-card">
            <h2 class="panel-title">确认发布</h2>
            <p class="confirm-lead">请核对以下信息，确认无误后发布任务。</p>
            <dl class="confirm-grid">
              <div class="confirm-item"><dt>任务标题</dt><dd>{{ form.title || '—' }}</dd></div>
              <div class="confirm-item"><dt>发布对象</dt><dd>{{ publishTargetLabel }}</dd></div>
              <div class="confirm-item"><dt>截止时间</dt><dd>{{ form.deadline || '—' }}</dd></div>
              <div class="confirm-item"><dt>满分</dt><dd>{{ form.maxScore ?? '—' }} 分</dd></div>
              <div class="confirm-item"><dt>最大提交次数</dt><dd>{{ form.maxSubmissions }} 次</dd></div>
              <div class="confirm-item"><dt>评价维度</dt><dd>{{ form.evaluationMetrics.length }} 项</dd></div>
              <div class="confirm-item"><dt>权重合计</dt><dd :class="{ 'text-warn': !weightValid }">{{ weightSum }}%</dd></div>
              <div class="confirm-item"><dt>AI 核查</dt><dd>已启用</dd></div>
              <div class="confirm-item"><dt>企业评分</dt><dd>{{ enterpriseScoringEnabled ? '已启用' : '未启用' }}</dd></div>
            </dl>
            <div class="confirm-actions">
              <el-button @click="saveDraftLocal">保存草稿</el-button>
              <el-button @click="showPreview = true">预览学生端效果</el-button>
              <el-button type="primary" size="large" :disabled="!canPublish" @click="saveTask">
                {{ isEdit ? '保存修改' : '发布任务' }}
              </el-button>
            </div>
          </section>

          <!-- 步骤导航 -->
          <div v-if="currentStep < 4" class="step-nav">
            <el-button v-if="currentStep > 0" @click="prevStep">上一步</el-button>
            <el-button type="primary" @click="nextStep">下一步</el-button>
          </div>
        </el-form>
      </main>

      <!-- 右侧：发布摘要 -->
      <aside class="col-aside">
        <section class="summary-card">
          <h2 class="summary-title">发布摘要</h2>
          <dl class="summary-list">
            <div class="summary-row">
              <dt>当前步骤</dt>
              <dd>{{ stepDefs[currentStep]?.title || '—' }}</dd>
            </div>
            <div class="summary-row">
              <dt>任务标题</dt>
              <dd>{{ form.title || '—' }}</dd>
            </div>
            <div class="summary-row">
              <dt>发布对象</dt>
              <dd>{{ publishTargetLabel }}</dd>
            </div>
            <div class="summary-row">
              <dt>截止时间</dt>
              <dd>{{ form.deadline || '—' }}</dd>
            </div>
            <div class="summary-row">
              <dt>满分</dt>
              <dd>{{ form.maxScore ?? '—' }} 分</dd>
            </div>
            <div class="summary-row">
              <dt>权重合计</dt>
              <dd :class="{ 'text-warn': !weightValid, 'text-ok': weightValid }">{{ weightSum }}%</dd>
            </div>
            <div class="summary-row">
              <dt>AI 核查</dt>
              <dd><span class="tag-ok">已启用</span></dd>
            </div>
            <div class="summary-row">
              <dt>企业评分</dt>
              <dd>
                <span :class="enterpriseScoringEnabled ? 'tag-ok' : 'tag-muted'">
                  {{ enterpriseScoringEnabled ? '已启用' : '未启用' }}
                </span>
              </dd>
            </div>
          </dl>

          <h3 class="check-title">发布前检查</h3>
          <ul class="check-items">
            <li v-for="c in publishChecks" :key="c.label" :class="{ 'check-ok': c.ok, 'check-fail': !c.ok }">
              <el-icon><CircleCheck v-if="c.ok" /><Warning v-else /></el-icon>
              <span>{{ c.label }}</span>
            </li>
          </ul>
        </section>
      </aside>
    </div>

    <!-- 预览弹窗 -->
    <el-dialog v-model="showPreview" title="学生端效果预览" width="560px" destroy-on-close>
      <div class="preview-box">
        <h3>{{ form.title || '（未填写标题）' }}</h3>
        <p class="preview-meta">截止：{{ form.deadline || '—' }} · 满分 {{ form.maxScore ?? '—' }} 分</p>
        <p class="preview-desc">{{ form.description || '暂无任务描述' }}</p>
        <h4>任务要求</h4>
        <ul v-if="requirementsLines.length">
          <li v-for="(l, i) in requirementsLines" :key="i">{{ l }}</li>
        </ul>
        <p v-else class="preview-muted">暂无要求条目</p>
        <h4>评价维度</h4>
        <ul>
          <li v-for="m in form.evaluationMetrics" :key="m.name">{{ m.name }}（{{ m.weight }}%）</li>
        </ul>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Check, CircleCheck, Warning } from '@element-plus/icons-vue'
import { createTask, updateTask, getTaskById } from '../../api/task'
import { getAllClasses } from '../../api/class'
import { listMyTeachingClasses } from '../../api/teachingClass'
import { ElMessage } from 'element-plus'
import { probeCodeRunnerEnabled } from '../../composables/useCodeRunnerFeature'
import { CODE_RUN_LANGUAGES, defaultEntryFile } from '../../utils/codeRunLanguages'

const route = useRoute()
const router = useRouter()
const classes = ref([])
const teachingClasses = ref([])
const codeRunnerOn = ref(false)

function onCodeRunLanguageChange(lang) {
  form.codeRunEntryFile = defaultEntryFile(lang)
}
const publishMode = ref('class')
const currentStep = ref(0)
const stepTouched = ref({})
const evalTemplate = ref('java_web')
const showPreview = ref(false)

const stepDefs = [
  { key: 'basic', title: '基础信息' },
  { key: 'requirements', title: '任务要求' },
  { key: 'evaluation', title: '评价规则' },
  { key: 'publish', title: '发布设置' },
  { key: 'confirm', title: '确认发布' },
]

const isEdit = computed(() => !!route.params.id)

const defaultMetrics = () => [
  { name: '代码质量', weight: 25, maxScore: 25 },
  { name: '文档规范性', weight: 25, maxScore: 25 },
  { name: '功能实现度', weight: 30, maxScore: 30 },
  { name: '综合表现', weight: 20, maxScore: 20 },
]

const metricTemplates = {
  java_web: defaultMetrics,
  vue3: () => [
    { name: '组件规范', weight: 25, maxScore: 25 },
    { name: '交互体验', weight: 25, maxScore: 25 },
    { name: '功能实现', weight: 30, maxScore: 30 },
    { name: '文档交付', weight: 20, maxScore: 20 },
  ],
  llm: () => [
    { name: 'Prompt 设计', weight: 25, maxScore: 25 },
    { name: '应用完整性', weight: 30, maxScore: 30 },
    { name: '代码质量', weight: 25, maxScore: 25 },
    { name: '文档说明', weight: 20, maxScore: 20 },
  ],
}

const form = reactive({
  title: '',
  description: '',
  requirements: '',
  scoringCriteria: '',
  scenarioType: 'mixed',
  enterpriseStandard: '',
  deadline: '',
  classId: '',
  teachingClassId: null,
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
  codeRunEnabled: false,
  codeRunLanguage: 'python',
  codeRunTimeoutSec: 10,
  codeRunGradeAfterRun: true,
  codeRunEntryFile: 'main.py',
})

const weightSum = computed(() =>
  form.evaluationMetrics.reduce((s, x) => s + (Number(x.weight) || 0), 0)
)

const dualWeightSum = computed(
  () => (Number(form.campusGradeWeight) || 0) + (Number(form.enterpriseGradeWeight) || 0)
)

const weightValid = computed(() => Math.abs(weightSum.value - 100) <= 0.01)
const dualWeightValid = computed(() => Math.abs(dualWeightSum.value - 100) <= 0.01)

const requirementsLines = computed(() =>
  form.requirements.split('\n').map((s) => s.trim()).filter(Boolean)
)

const materialsLines = computed(() =>
  form.scoringCriteria.split('\n').map((s) => s.trim()).filter(Boolean)
)

const selectedTeachingClass = computed(() =>
  teachingClasses.value.find((t) => Number(t.id) === Number(form.teachingClassId))
)

const publishTargetLabel = computed(() => {
  if (publishMode.value === 'teaching') {
    const tc = selectedTeachingClass.value
    return tc ? `教学班 · ${tc.class_name}` : '—'
  }
  const cls = classes.value.find((c) => Number(c.id) === Number(form.classId))
  return cls ? `行政班 · ${cls.class_name}` : '—'
})

const allowResubmit = computed({
  get: () => form.maxSubmissions > 1,
  set: (v) => {
    form.maxSubmissions = v ? Math.max(3, form.maxSubmissions || 3) : 1
  },
})

const enterpriseScoringEnabled = computed({
  get: () => Number(form.enterpriseGradeWeight) > 0,
  set: (v) => {
    if (v) {
      if (form.scenarioType === 'teaching') form.scenarioType = 'enterprise_collab'
      form.campusGradeWeight = 50
      form.enterpriseGradeWeight = 50
    } else {
      form.campusGradeWeight = 100
      form.enterpriseGradeWeight = 0
    }
  },
})

const publishChecks = computed(() => [
  { label: '已填写任务标题', ok: !!form.title?.trim() },
  {
    label: '已选择发布对象',
    ok: publishMode.value === 'class' ? !!form.classId : !!form.teachingClassId,
  },
  { label: '已设置截止时间', ok: !!form.deadline },
  { label: '已设置满分', ok: form.maxScore != null && form.maxScore !== '' },
  { label: '权重合计为 100%', ok: weightValid.value },
  { label: '已设置提交次数', ok: form.maxSubmissions >= 1 },
])

const canPublish = computed(() => publishChecks.value.every((c) => c.ok) && dualWeightValid.value)

function stepHasError(index) {
  if (!stepTouched.value[index]) return false
  return !!validateStep(index, false)
}

function stepItemClass(index) {
  return {
    'is-done': index < currentStep.value,
    'is-active': index === currentStep.value,
    'is-wait': index > currentStep.value,
    'is-error': stepHasError(index),
  }
}

function goToStep(index) {
  if (index <= currentStep.value) currentStep.value = index
}

function validateStep(step, showMessage = true) {
  let msg = ''
  if (step === 0) {
    if (!form.title?.trim()) msg = '请填写任务标题'
    else if (!form.deadline) msg = '请设置截止时间'
    else if (publishMode.value === 'class' && !form.classId) msg = '请选择行政班'
    else if (publishMode.value === 'teaching' && !form.teachingClassId) msg = '请选择教学班'
    else if (form.maxScore == null || form.maxScore === '') msg = '请设置满分'
    else if (!form.maxSubmissions || form.maxSubmissions < 1) msg = '请设置最大提交次数'
  } else if (step === 2) {
    if (!weightValid.value) msg = '评价维度权重合计须为 100%'
    else if (!dualWeightValid.value) msg = '校内评分权重与企业评分权重之和须为 100%'
  }
  if (msg && showMessage) ElMessage.error(msg)
  return msg
}

function nextStep() {
  stepTouched.value = { ...stepTouched.value, [currentStep.value]: true }
  const err = validateStep(currentStep.value)
  if (err) return
  if (currentStep.value < stepDefs.length - 1) currentStep.value += 1
}

function prevStep() {
  if (currentStep.value > 0) currentStep.value -= 1
}

function applyEvalTemplate(key) {
  if (key === 'custom') return
  const fn = metricTemplates[key]
  if (fn) {
    form.evaluationMetrics = fn().map((m) => ({ ...m }))
  }
}

const addMetric = () => {
  form.evaluationMetrics.push({ name: '', weight: 10, maxScore: 10 })
  evalTemplate.value = 'custom'
}

const removeMetric = (idx) => {
  form.evaluationMetrics.splice(idx, 1)
  evalTemplate.value = 'custom'
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

function normalizeDeadlineForPicker(v) {
  if (v == null || v === '') return ''
  const s = String(v).trim()
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/)
  if (m) return `${m[1]} ${m[2]}`
  return s
}

const DRAFT_KEY = 'sg:task-form-draft'

function saveDraftLocal() {
  try {
    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        form: { ...form, evaluationMetrics: [...form.evaluationMetrics], stepChecklist: [...form.stepChecklist] },
        publishMode: publishMode.value,
        currentStep: currentStep.value,
        evalTemplate: evalTemplate.value,
      })
    )
    ElMessage.success('草稿已保存到浏览器（未提交服务器）')
  } catch {
    ElMessage.error('草稿保存失败')
  }
}

function loadDraftLocal() {
  if (isEdit.value) return
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY)
    if (!raw) return
    const d = JSON.parse(raw)
    if (d.form) Object.assign(form, d.form)
    if (d.publishMode) publishMode.value = d.publishMode
    if (d.evalTemplate) evalTemplate.value = d.evalTemplate
  } catch {
    /* ignore */
  }
}

const loadClasses = async () => {
  try {
    const response = await getAllClasses()
    if (response.success) classes.value = response.data
  } catch (error) {
    console.error('获取班级列表失败:', error)
  }
}

const loadTeachingClasses = async () => {
  try {
    const res = await listMyTeachingClasses()
    if (res.success) teachingClasses.value = res.data
  } catch (e) {
    console.error(e)
  }
}

function applyTaskToForm(task, { asCopy = false } = {}) {
  form.title = asCopy ? `${task.title}（副本）` : task.title
  form.description = task.description || ''
  form.requirements = task.requirements || ''
  form.scoringCriteria = task.scoring_criteria || ''
  form.scenarioType = task.scenario_type || 'mixed'
  form.enterpriseStandard = task.enterprise_standard || ''
  form.deadline = asCopy ? '' : normalizeDeadlineForPicker(task.deadline)
  if (task.teaching_class_id) {
    publishMode.value = 'teaching'
    form.teachingClassId = task.teaching_class_id
    form.classId = ''
  } else {
    publishMode.value = 'class'
    form.classId = task.class_id || ''
    form.teachingClassId = null
  }
  form.maxScore = task.max_score || 100
  form.maxSubmissions =
    task.max_submissions != null && task.max_submissions !== ''
      ? Math.max(1, parseInt(String(task.max_submissions), 10) || 1)
      : 1
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
  evalTemplate.value = 'custom'

  const taw = task.score_ai_weight
  const thw = task.score_human_weight
  if (taw != null && thw != null && taw !== '' && thw !== '') {
    form.useGlobalScoreWeights = false
    form.scoreAiWeight = Number(taw)
    form.scoreHumanWeight = Number(thw)
  } else {
    form.useGlobalScoreWeights = true
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
  form.codeRunEnabled = Boolean(Number(task.code_run_enabled))
  form.codeRunLanguage = task.code_run_language || 'python'
  const crc = task.codeRunConfig || task.code_run_config || {}
  form.codeRunTimeoutSec = crc.timeoutSec ?? crc.timeout_sec ?? 10
  form.codeRunGradeAfterRun = Boolean(crc.gradeAfterRun ?? crc.grade_after_run ?? true)
  form.codeRunEntryFile = crc.entryFile ?? crc.entry_file ?? 'main.py'
}

const loadTaskInfo = async () => {
  if (!isEdit.value) return
  try {
    const response = await getTaskById(route.params.id)
    if (response.success) {
      applyTaskToForm(response.data)
    }
  } catch (error) {
    console.error('获取任务信息失败:', error)
  }
}

const loadCopyFromQuery = async () => {
  const copyFrom = route.query.copyFrom
  if (!copyFrom || isEdit.value) return false
  try {
    const response = await getTaskById(copyFrom)
    if (response.success) {
      applyTaskToForm(response.data, { asCopy: true })
      ElMessage.info('已载入原任务配置，请确认截止日期后发布')
      return true
    }
  } catch (error) {
    console.error('复制任务失败:', error)
  }
  return false
}

const saveTask = async () => {
  if (!form.title || !form.deadline) {
    ElMessage.error('请填写必填字段')
    return
  }
  if (publishMode.value === 'class' && !form.classId) {
    ElMessage.error('请选择发布班级')
    return
  }
  if (publishMode.value === 'teaching' && !form.teachingClassId) {
    ElMessage.error('请选择教学班')
    return
  }

  if (!weightValid.value) {
    ElMessage.error('评价维度权重合计须为 100%')
    currentStep.value = 2
    return
  }

  if (Math.abs(dualWeightSum.value - 100) > 0.01) {
    ElMessage.error('校内评分权重与企业评分权重之和须为 100%')
    currentStep.value = 2
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
    classId: publishMode.value === 'class' ? form.classId || null : null,
    teachingClassId: publishMode.value === 'teaching' ? form.teachingClassId : null,
    maxScore: form.maxScore,
    maxSubmissions: maxSub,
    scoreAiWeight: form.useGlobalScoreWeights ? null : form.scoreAiWeight,
    scoreHumanWeight: form.useGlobalScoreWeights ? null : form.scoreHumanWeight,
    campusGradeWeight: form.campusGradeWeight,
    enterpriseGradeWeight: form.enterpriseGradeWeight,
    difficultyLevel: form.difficultyLevel,
    stepChecklist: stepsPayload.length ? stepsPayload : null,
    codeRunEnabled: codeRunnerOn.value && form.codeRunEnabled,
    codeRunLanguage: form.codeRunLanguage,
    codeRunTimeoutSec: form.codeRunTimeoutSec,
    codeRunGradeAfterRun: form.codeRunGradeAfterRun,
    codeRunEntryFile: form.codeRunEntryFile,
  }

  const tasksHome = route.path.startsWith('/admin') ? '/admin/tasks' : '/teacher/tasks'

  try {
    if (isEdit.value) {
      await updateTask(route.params.id, payload)
      ElMessage.success('更新成功')
    } else {
      await createTask(payload)
      ElMessage.success('创建成功')
      sessionStorage.removeItem(DRAFT_KEY)
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
  codeRunnerOn.value = await probeCodeRunnerEnabled()
  await Promise.all([loadClasses(), loadTeachingClasses()])
  await loadTaskInfo()
  if (!isEdit.value) {
    const copied = await loadCopyFromQuery()
    if (!copied) loadDraftLocal()
    if (route.query.teachingClassId) {
      const tcid = Number(route.query.teachingClassId)
      if (teachingClasses.value.some((t) => Number(t.id) === tcid)) {
        publishMode.value = 'teaching'
        form.teachingClassId = tcid
      }
    } else if (route.query.classId) {
      const cid = Number(route.query.classId)
      if (classes.value.some((c) => Number(c.id) === cid)) form.classId = cid
    }
  }
})
</script>

<style scoped>
.task-wizard-page {
  min-height: 100%;
  padding: 20px 24px 32px;
  background: #f5f7fa;
}

.page-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 20px;
}

.back-btn {
  border: 1px solid #e5eaf2;
  background: #fff;
  color: #1d5fd6;
  flex-shrink: 0;
}

.head-text {
  flex: 1;
}

.page-title {
  margin: 0 0 4px;
  font-size: 22px;
  font-weight: 600;
  color: #1f2d3d;
}

.page-desc {
  margin: 0;
  font-size: 13px;
  color: #6b7280;
}

.steps-bar {
  background: #fff;
  border: 1px solid #e5eaf2;
  border-radius: 12px;
  padding: 22px 28px 18px;
  margin-bottom: 16px;
  box-shadow: 0 1px 4px rgba(15, 45, 61, 0.04);
}

.wizard-steps {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: 0;
  max-width: 880px;
  margin: 0 auto;
}

.wizard-step {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 0 4px;
  border: none;
  background: transparent;
  cursor: default;
  font: inherit;
  color: inherit;
}

.wizard-step:not(:disabled) {
  cursor: pointer;
}

.wizard-step:not(:disabled):hover .step-label {
  color: #1d5fd6;
}

.step-connector {
  flex: 0 0 48px;
  height: 2px;
  margin-top: 19px;
  background: #e5eaf2;
  border-radius: 1px;
  transition: background 0.25s ease;
}

.step-connector.is-filled {
  background: linear-gradient(90deg, #1d5fd6, #4d8ef0);
}

.step-node {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 2px solid #d1d9e6;
  background: #fff;
  color: #9ca3af;
  font-size: 15px;
  font-weight: 600;
  transition: all 0.2s ease;
  box-shadow: 0 1px 2px rgba(15, 45, 61, 0.06);
}

.step-num {
  line-height: 1;
}

.step-icon {
  font-size: 18px;
}

.step-label {
  font-size: 13px;
  font-weight: 500;
  color: #9ca3af;
  text-align: center;
  line-height: 1.35;
  transition: color 0.2s ease;
  white-space: nowrap;
}

.wizard-step.is-wait .step-node {
  background: #f8fafc;
}

.wizard-step.is-active .step-node {
  border-color: #1d5fd6;
  background: #1d5fd6;
  color: #fff;
  box-shadow: 0 0 0 4px rgba(29, 95, 214, 0.12);
}

.wizard-step.is-active .step-label {
  color: #1d5fd6;
  font-weight: 600;
}

.wizard-step.is-done .step-node {
  border-color: #1d5fd6;
  background: #eef4ff;
  color: #1d5fd6;
}

.wizard-step.is-done .step-label {
  color: #374151;
}

.wizard-step.is-error .step-node {
  border-color: #f56c6c;
  background: #fef2f2;
  color: #dc2626;
  box-shadow: 0 0 0 4px rgba(245, 108, 108, 0.12);
}

.wizard-step.is-error.is-active .step-node {
  background: #f56c6c;
  color: #fff;
}

.wizard-step.is-error .step-label {
  color: #dc2626;
}

.steps-meta {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid #f0f2f5;
  font-size: 13px;
}

.steps-counter {
  color: #9ca3af;
}

.steps-current {
  color: #1f2d3d;
  font-weight: 600;
}

@media (max-width: 768px) {
  .steps-bar {
    padding: 16px 12px 14px;
  }

  .wizard-steps {
    flex-wrap: wrap;
    row-gap: 12px;
  }

  .step-connector {
    display: none;
  }

  .wizard-step {
    flex: 0 0 calc(20% - 4px);
  }

  .step-node {
    width: 34px;
    height: 34px;
    font-size: 13px;
  }

  .step-label {
    font-size: 11px;
    white-space: normal;
  }
}

.page-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 16px;
  align-items: start;
}

.col-aside {
  position: sticky;
  top: 16px;
}

.panel-card {
  background: #fff;
  border: 1px solid #e5eaf2;
  border-radius: 12px;
  padding: 20px 22px;
  box-shadow: 0 1px 4px rgba(15, 45, 61, 0.04);
}

.panel-title {
  margin: 0 0 18px;
  font-size: 16px;
  font-weight: 600;
  color: #1f2d3d;
  padding-bottom: 10px;
  border-bottom: 1px solid #f0f2f5;
}

.wizard-form :deep(.el-form-item) {
  align-items: flex-start;
  margin-bottom: 18px;
}

.wizard-form :deep(.el-form-item__label) {
  color: #374151;
  font-weight: 500;
  line-height: 1.45;
  white-space: normal;
  height: auto !important;
}

.field-full {
  width: 100%;
}

.field-narrow {
  width: 100%;
  max-width: 280px;
}

.field-hint {
  margin: 6px 0 0;
  font-size: 12px;
  color: #9ca3af;
  line-height: 1.5;
}

.checklist-preview {
  margin: -8px 0 16px;
  padding: 12px 14px;
  background: #f9fafb;
  border: 1px solid #eef1f6;
  border-radius: 8px;
}

.checklist-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  margin-bottom: 8px;
}

.check-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.check-list li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 0;
  font-size: 13px;
  color: #374151;
  border-bottom: 1px solid #f3f4f6;
}

.check-list li:last-child {
  border-bottom: none;
}

.check-box {
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  margin-top: 2px;
  border-radius: 3px;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  position: relative;
}

.check-box::after {
  content: '';
  position: absolute;
  left: 3px;
  top: 1px;
  width: 4px;
  height: 7px;
  border: solid #16a34a;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

.check-box--empty {
  background: #fff;
  border-color: #d1d5db;
}

.check-box--empty::after {
  display: none;
}

.adv-collapse {
  margin-top: 8px;
  border: none;
}

.adv-collapse :deep(.el-collapse-item__header) {
  font-size: 13px;
  color: #6b7280;
  border: 1px solid #eef1f6;
  border-radius: 8px;
  padding: 0 12px;
  background: #f9fafb;
  margin-bottom: 8px;
}

.adv-collapse :deep(.el-collapse-item__wrap) {
  border: none;
}

.metrics-toolbar {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.metrics-sum {
  font-size: 13px;
  color: #6b7280;
}

.metrics-sum--warn {
  color: #d97706;
  font-weight: 600;
}

.metrics-table,
.step-table {
  border-radius: 8px;
}

.mt-block {
  margin-top: 16px;
}

.step-nav {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
  padding: 16px 0;
}

.confirm-lead {
  margin: 0 0 16px;
  font-size: 14px;
  color: #6b7280;
}

.confirm-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px 20px;
  margin: 0 0 24px;
}

.confirm-item dt {
  margin: 0 0 2px;
  font-size: 12px;
  color: #9ca3af;
}

.confirm-item dd {
  margin: 0;
  font-size: 14px;
  color: #1f2d3d;
  font-weight: 500;
}

.confirm-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding-top: 8px;
  border-top: 1px solid #f0f2f5;
}

.text-warn {
  color: #d97706 !important;
}

.text-ok {
  color: #16a34a !important;
}

.summary-card {
  background: #fff;
  border: 1px solid #e5eaf2;
  border-radius: 12px;
  padding: 18px;
  box-shadow: 0 2px 8px rgba(15, 45, 61, 0.06);
}

.summary-title {
  margin: 0 0 14px;
  font-size: 15px;
  font-weight: 600;
  color: #1f2d3d;
}

.summary-list {
  margin: 0 0 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid #f0f2f5;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 5px 0;
  font-size: 13px;
}

.summary-row dt {
  color: #6b7280;
  flex-shrink: 0;
}

.summary-row dd {
  margin: 0;
  color: #1f2d3d;
  font-weight: 500;
  text-align: right;
  word-break: break-all;
}

.check-title {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}

.check-items {
  list-style: none;
  margin: 0;
  padding: 0;
}

.check-items li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  font-size: 13px;
  color: #6b7280;
}

.check-items li.check-ok {
  color: #16a34a;
}

.check-items li.check-fail {
  color: #9ca3af;
}

.tag-ok {
  color: #16a34a;
  font-weight: 500;
}

.tag-muted {
  color: #9ca3af;
}

.preview-box h3 {
  margin: 0 0 8px;
  font-size: 16px;
  color: #1f2d3d;
}

.preview-meta {
  margin: 0 0 12px;
  font-size: 13px;
  color: #6b7280;
}

.preview-desc {
  margin: 0 0 16px;
  font-size: 14px;
  color: #374151;
  line-height: 1.6;
}

.preview-box h4 {
  margin: 12px 0 6px;
  font-size: 13px;
  color: #374151;
}

.preview-box ul {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  color: #4b5563;
}

.preview-muted {
  font-size: 13px;
  color: #9ca3af;
}

@media (max-width: 992px) {
  .page-layout {
    grid-template-columns: 1fr;
  }

  .col-aside {
    position: static;
    order: -1;
  }

  .confirm-grid {
    grid-template-columns: 1fr;
  }
}
</style>
