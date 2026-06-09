<template>
  <div class="page-op-form">
    <header class="form-topbar">
      <div class="form-topbar-left">
        <el-button text type="primary" @click="$router.push('/teacher/online-practice')">← 返回列表</el-button>
        <h1 class="form-title">{{ isEdit ? '编辑在线实训模板' : '新建在线实训模板' }}</h1>
      </div>
      <div class="form-topbar-actions">
        <el-button :loading="saving" @click="save">保存草稿</el-button>
        <el-button
          v-if="isEdit && templateStatus === 'draft'"
          type="success"
          :loading="publishing"
          @click="publishTemplate"
        >
          发布模板
        </el-button>
      </div>
    </header>

    <el-alert
      v-if="featureReady && !featureOn"
      type="warning"
      show-icon
      :closable="false"
      title="代码运行 Worker 未启用：可先保存模板，学生试运行需管理员开启 CODE_RUNNER_ENABLED。"
      class="mb16"
    />

    <div v-loading="loading" class="form-body">
      <div class="form-main">
        <el-card shadow="never" class="section-card">
          <template #header><span class="section-title">基础信息</span></template>
          <el-form label-width="96px" class="op-form">
            <el-form-item label="标题" required>
              <el-input v-model="form.title" maxlength="200" show-word-limit placeholder="学生可见的练习标题" />
            </el-form-item>
            <el-form-item label="教学班" required>
              <el-select v-model="form.teachingClassId" style="width: 100%" :disabled="isEdit" placeholder="选择教学班">
                <el-option
                  v-for="tc in teachingClasses"
                  :key="tc.id"
                  :label="`${tc.class_name}${tc.course_name ? ' · ' + tc.course_name : ''}`"
                  :value="tc.id"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="题目说明">
              <el-input
                v-model="form.description"
                type="textarea"
                :rows="4"
                placeholder="学生工作台左侧将展示此说明"
              />
            </el-form-item>
          </el-form>
        </el-card>

        <el-card shadow="never" class="section-card">
          <template #header><span class="section-title">代码模板</span></template>
          <el-form label-width="96px" class="op-form">
            <el-row :gutter="16">
              <el-col :xs="24" :sm="12">
                <el-form-item label="运行语言" required>
                  <el-select v-model="form.language" style="width: 100%" @change="onLanguageChange">
                    <el-option
                      v-for="opt in CODE_RUN_LANGUAGES"
                      :key="opt.value"
                      :label="opt.label"
                      :value="opt.value"
                    />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="12">
                <el-form-item label="入口文件">
                  <el-input v-model="form.entryFile" :placeholder="defaultEntryFile(form.language)" />
                </el-form-item>
              </el-col>
            </el-row>
            <el-form-item label="初始代码">
              <CodeEditor
                v-model="form.starterCode"
                :language="form.language"
                :entry-file="form.entryFile"
                :min-height="360"
                show-chrome
              />
            </el-form-item>
          </el-form>
        </el-card>

        <el-card shadow="never" class="section-card">
          <template #header><span class="section-title">测试输入</span></template>
          <el-form label-width="96px" class="op-form">
            <el-form-item label="stdin">
              <el-input
                v-model="form.stdinDefault"
                type="textarea"
                :rows="4"
                placeholder="可选：运行时的默认 stdin（学生端运行时会使用）"
              />
            </el-form-item>
            <el-form-item label="教师提示">
              <el-input
                v-model="form.solutionHint"
                type="textarea"
                :rows="2"
                placeholder="仅教师可见，学生端不展示"
              />
            </el-form-item>
          </el-form>
        </el-card>
      </div>

      <aside class="form-sidebar">
        <el-card shadow="never" class="section-card">
          <template #header><span class="section-title">运行配置</span></template>
          <el-form label-width="88px" class="sidebar-form">
            <el-form-item label="超时(秒)">
              <el-input-number v-model="form.codeRunTimeoutSec" :min="2" :max="60" style="width: 100%" />
            </el-form-item>
            <el-form-item label="语言">
              <span>{{ langLabel(form.language) }}</span>
            </el-form-item>
            <el-form-item label="入口文件">
              <code class="inline-code">{{ form.entryFile || defaultEntryFile(form.language) }}</code>
            </el-form-item>
            <el-form-item label="AI 点评">
              <el-switch v-model="form.aiReviewEnabled" active-text="启用" inactive-text="关闭" />
              <p class="field-hint">学生手动触发；输出为代码规范参考分，不计入正式成绩。</p>
            </el-form-item>
          </el-form>
        </el-card>

        <el-card shadow="never" class="section-card preview-card">
          <template #header><span class="section-title">学生端预览</span></template>
          <div class="preview-block">
            <div class="preview-label">题目标题</div>
            <div class="preview-value">{{ form.title || '（未填写标题）' }}</div>
          </div>
          <div class="preview-block">
            <div class="preview-label">语言 / 入口</div>
            <div class="preview-tags">
              <el-tag size="small" effect="plain">{{ langLabel(form.language) }}</el-tag>
              <el-tag size="small" type="info" effect="plain">
                {{ form.entryFile || defaultEntryFile(form.language) }}
              </el-tag>
            </div>
          </div>
          <div class="preview-block">
            <div class="preview-label">说明摘要</div>
            <div class="preview-desc">{{ form.description || '（无说明）' }}</div>
          </div>
        </el-card>

        <el-card shadow="never" class="section-card security-card">
          <template #header><span class="section-title">安全提示</span></template>
          <p class="security-text">
            学生提交的代码将通过独立 Code Runner Worker 在隔离环境中执行，与正式实训任务批改队列分离。
          </p>
        </el-card>
      </aside>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getOnlinePracticeTemplate,
  createOnlinePracticeTemplate,
  updateOnlinePracticeTemplate,
  publishOnlinePracticeTemplate,
} from '../../api/onlinePractice'
import { listMyTeachingClasses } from '../../api/teachingClass'
import { probeCodeRunnerEnabled } from '../../composables/useCodeRunnerFeature'
import CodeEditor from '../../components/codeRunner/CodeEditor.vue'
import {
  CODE_RUN_LANGUAGES,
  defaultEntryFile,
  defaultStarterCode,
  langLabel,
} from '../../utils/codeRunLanguages'

const route = useRoute()
const router = useRouter()
const editId = computed(() => (route.params.id ? Number(route.params.id) : null))
const isEdit = computed(() => Number.isFinite(editId.value))

const loading = ref(false)
const saving = ref(false)
const publishing = ref(false)
const teachingClasses = ref([])
const featureReady = ref(false)
const featureOn = ref(false)
const templateStatus = ref('draft')

const form = reactive({
  title: '',
  teachingClassId: null,
  description: '',
  language: 'python',
  entryFile: 'main.py',
  codeRunTimeoutSec: 10,
  starterCode: defaultStarterCode('python'),
  stdinDefault: '',
  solutionHint: '',
  aiReviewEnabled: true,
})

function onLanguageChange(lang) {
  form.entryFile = defaultEntryFile(lang)
  form.starterCode = defaultStarterCode(lang)
}

const buildBody = () => ({
  title: form.title,
  teachingClassId: form.teachingClassId,
  description: form.description,
  language: form.language,
  entryFile: form.entryFile || defaultEntryFile(form.language),
  codeRunTimeoutSec: form.codeRunTimeoutSec,
  starterCode: form.starterCode,
  stdinDefault: form.stdinDefault,
  solutionHint: form.solutionHint,
  aiReviewEnabled: form.aiReviewEnabled,
})

const validate = () => {
  if (!form.title.trim()) {
    ElMessage.warning('请填写标题')
    return false
  }
  if (!form.teachingClassId) {
    ElMessage.warning('请选择教学班')
    return false
  }
  return true
}

const save = async () => {
  if (!validate()) return
  saving.value = true
  try {
    const body = buildBody()
    const res = isEdit.value
      ? await updateOnlinePracticeTemplate(editId.value, body)
      : await createOnlinePracticeTemplate(body)
    if (res.success) {
      ElMessage.success('草稿已保存')
      if (!isEdit.value && res.data?.id) {
        router.replace(`/teacher/online-practice/${res.data.id}/edit`)
      }
    }
  } catch (e) {
    ElMessage.error(e.response?.data?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

const publishTemplate = async () => {
  if (!validate()) return
  await ElMessageBox.confirm('发布后对应教学班学生可见，确认发布？', '发布模板')
  publishing.value = true
  try {
    await updateOnlinePracticeTemplate(editId.value, buildBody())
    const res = await publishOnlinePracticeTemplate(editId.value)
    if (res.success) {
      ElMessage.success('模板已发布')
      router.push('/teacher/online-practice')
    }
  } catch (e) {
    ElMessage.error(e.response?.data?.message || '发布失败')
  } finally {
    publishing.value = false
  }
}

const loadDetail = async () => {
  if (!isEdit.value) return
  loading.value = true
  try {
    const res = await getOnlinePracticeTemplate(editId.value)
    if (res.success) {
      const d = res.data
      templateStatus.value = d.status || 'draft'
      form.title = d.title || ''
      form.teachingClassId = d.teachingClassId
      form.description = d.description || ''
      form.language = d.language || 'python'
      form.entryFile = d.entryFile || defaultEntryFile(form.language)
      form.codeRunTimeoutSec = d.codeRunTimeoutSec || 10
      form.starterCode = d.starterCode || defaultStarterCode(form.language)
      form.stdinDefault = d.stdinDefault || ''
      form.solutionHint = d.solutionHint || ''
      form.aiReviewEnabled = d.aiReviewEnabled !== false
    }
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  featureOn.value = await probeCodeRunnerEnabled()
  featureReady.value = true
  const tcRes = await listMyTeachingClasses()
  if (tcRes.success) {
    teachingClasses.value = tcRes.data || []
    if (!isEdit.value && teachingClasses.value.length) {
      form.teachingClassId = teachingClasses.value[0].id
    }
  }
  await loadDetail()
})
</script>

<style scoped>
.page-op-form {
  max-width: var(--sg-content-max, 1480px);
}

.form-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
  padding: 12px 16px;
  background: #fff;
  border-radius: 12px;
  box-shadow: var(--sg-shadow-card);
  flex-wrap: wrap;
}

.form-topbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.form-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
}

.form-topbar-actions {
  display: flex;
  gap: 8px;
}

.mb16 {
  margin-bottom: 16px;
}

.form-body {
  display: grid;
  grid-template-columns: minmax(0, 65%) minmax(280px, 35%);
  gap: 16px;
  align-items: start;
}

.section-card {
  border-radius: 12px;
  box-shadow: var(--sg-shadow-card);
  margin-bottom: 16px;
}

.section-card :deep(.el-card__header) {
  padding: 12px 16px;
  border-bottom: 1px solid var(--sg-border);
}

.section-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--sg-text);
}

.op-form {
  max-width: none;
}

.sidebar-form :deep(.el-form-item) {
  margin-bottom: 14px;
}

.inline-code {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 12px;
  background: var(--sg-fill-muted);
  padding: 2px 6px;
  border-radius: 4px;
}

.preview-block {
  margin-bottom: 14px;
}

.preview-block:last-child {
  margin-bottom: 0;
}

.preview-label {
  font-size: 12px;
  color: var(--sg-text-placeholder);
  margin-bottom: 6px;
}

.preview-value {
  font-size: 15px;
  font-weight: 600;
  color: var(--sg-text);
}

.preview-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.preview-desc {
  font-size: 13px;
  color: var(--sg-text-secondary);
  line-height: 1.55;
  white-space: pre-wrap;
  max-height: 120px;
  overflow: auto;
}

.security-text {
  margin: 0;
  font-size: 13px;
  color: var(--sg-text-secondary);
  line-height: 1.6;
}

.field-hint {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--sg-text-placeholder);
  line-height: 1.5;
}

@media (max-width: 960px) {
  .form-body {
    grid-template-columns: 1fr;
  }
}
</style>
