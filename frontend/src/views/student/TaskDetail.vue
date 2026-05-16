<template>
  <div class="task-detail">
    <div class="header">
      <el-button type="primary" @click="$router.push('/student/tasks')">返回任务列表</el-button>
      <h2>{{ pageTitle }}</h2>
    </div>

    <el-skeleton v-if="loading" :rows="8" animated />

    <el-alert
      v-else-if="errorMsg"
      type="error"
      :title="errorMsg"
      show-icon
      :closable="false"
    />

    <template v-else-if="task">
      <el-alert
        class="tip-banner"
        type="info"
        show-icon
        :closable="false"
        title="在本页上传实训成果后，系统将自动解析文档/PDF/图片说明中的文本；教师发起 AI 批改后，可在侧栏「成绩查询」查看 AI 评分、智能核查与个人报告。"
      />

      <el-alert
        v-if="task?.deadline"
        class="deadline-banner"
        :type="deadlinePassed ? 'warning' : 'success'"
        show-icon
        :closable="false"
        :title="deadlinePassed ? '已超过截止时间，提交入口已关闭（不可提交或修改）。' : `距离截止还有 ${countdownText || '计算中…'}`"
      />

      <el-alert
        v-if="task && !deadlinePassed"
        class="deadline-banner"
        type="info"
        show-icon
        :closable="false"
      >
        <template #title>
          <span>
            最大提交次数：{{ maxSubmissions }} 次；已提交：{{ submitCount }} 次；剩余可提交：{{ submitRemaining }} 次
          </span>
        </template>
      </el-alert>

      <el-alert
        v-if="task && submitLimitReached && !deadlinePassed"
        class="deadline-banner"
        type="error"
        show-icon
        :closable="false"
        title="已达到最大提交次数，无法再次提交。"
      />

      <div class="scenario-strip">
        <span class="scenario-label">实训场景</span>
        <el-tag type="primary" effect="plain">{{ scenarioLabel(task.scenario_type) }}</el-tag>
        <span class="scenario-label">完成状态</span>
        <el-tag :type="task.completed ? 'success' : 'warning'" effect="plain">
          {{ task.completed ? '已完成' : '未完成' }}
        </el-tag>
      </div>

      <div class="content">
        <div class="info-section">
          <h3>任务描述</h3>
          <p>{{ task.description || '—' }}</p>
        </div>

        <div v-if="task.enterprise_standard" class="info-section info-section--enterprise">
          <h3>企业 / 岗位能力标准（校企协同）</h3>
          <p>{{ task.enterprise_standard }}</p>
        </div>

        <div class="info-section">
          <h3>任务要求（用于智能核查对照）</h3>
          <ul v-if="requirementsList.length">
            <li v-for="(req, index) in requirementsList" :key="index">{{ req }}</li>
          </ul>
          <p v-else class="muted">暂无逐条要求，请联系教师补充。</p>
        </div>

        <div class="info-section">
          <div class="section-head">
            <h3>评价维度</h3>
            <div v-if="metricsRows.length" class="mini-toolbar">
              <span class="mini-toolbar-label">表格密度</span>
              <el-radio-group v-model="mode" size="small">
                <el-radio-button value="default">{{ labelMap.default }}</el-radio-button>
                <el-radio-button value="compact">{{ labelMap.compact }}</el-radio-button>
                <el-radio-button value="comfortable">{{ labelMap.comfortable }}</el-radio-button>
              </el-radio-group>
            </div>
          </div>
          <el-table v-if="metricsRows.length" :data="metricsRows" border :size="tableSize" class="dim-table">
            <el-table-column prop="name" label="指标" min-width="120" />
            <el-table-column prop="weight" label="权重(%)" width="110" align="center" />
            <el-table-column prop="maxScore" label="满分" width="110" align="center" />
          </el-table>
          <p v-else class="muted">使用教师/管理员配置的默认维度。</p>
        </div>

        <div class="info-section">
          <h3>评分标准</h3>
          <ul v-if="criteriaList.length">
            <li v-for="(criteria, index) in criteriaList" :key="index">{{ criteria }}</li>
          </ul>
          <p v-else class="muted">—</p>
        </div>

        <div class="info-section">
          <h3>基本信息</h3>
          <div class="info-row">
            <span class="label">截止时间：</span>
            <span>{{ formatDateTime(task.deadline) }}</span>
          </div>
          <div class="info-row">
            <span class="label">满分：</span>
            <span>{{ task.max_score }}分</span>
          </div>
          <div class="info-row">
            <span class="label">创建者：</span>
            <span>{{ task.creator_name || '—' }}</span>
          </div>
        </div>

        <div class="upload-section">
          <h3>实训成果上传</h3>
          <p class="upload-hint">
            支持 Word（docx）、PDF、图片（png/jpg 等）、文本/Markdown、以及<strong>源码压缩包 .zip</strong>（自动解压并提取文本类文件）；单文件 ≤ 50MB。提交后由后端自动解析，供大模型批改与<strong>智能核查</strong>（对照要求、逻辑问题、步骤完整性等）。
          </p>
          <el-form :model="submitForm" class="submit-form" label-width="100px">
            <el-form-item label="文字说明">
              <el-input
                v-model="submitForm.content"
                type="textarea"
                :rows="4"
                :disabled="submitBlocked"
                placeholder="建议写清：完成步骤、环境说明、自测结果等。此处文字会单独展示给教师；附件内容仍参与 AI 批改，但不在「作业正文」中展开。"
              />
            </el-form-item>
            <el-form-item label="上传文件">
              <el-upload
                class="upload-block"
                :auto-upload="false"
                :limit="1"
                :disabled="submitBlocked"
                :on-change="onFileChange"
                :on-remove="onFileRemove"
                :file-list="fileList"
                drag
              >
                <el-icon class="el-icon--upload"><upload-filled /></el-icon>
                <div class="el-upload__text">将文件拖到此处，或<em>点击选择</em></div>
                <template #tip>
                  <div class="el-upload__tip">
                    单次提交一个附件（与文字说明至少填一项）；多文件请打成 <strong>.zip</strong> 上传，系统将自动解压并提取源码与文档文本。
                  </div>
                </template>
              </el-upload>
            </el-form-item>
            <el-form-item>
              <el-button
                type="primary"
                size="large"
                :loading="parsingZip"
                :disabled="submitBlocked || parsingZip"
                @click="submitAssignment"
              >
                {{ parsingZip ? '正在解析压缩包…' : '提交成果' }}
              </el-button>
              <el-button @click="$router.push('/student/results')">查看我的成绩与报告</el-button>
            </el-form-item>
          </el-form>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { UploadFilled } from '@element-plus/icons-vue'
import { getTaskById } from '../../api/task'
import { submitAssignment as submitApi } from '../../api/submission'
import { useTableDensity } from '../../composables/useTableDensity'
import { formatDateTime } from '../../utils/format'
import { ElMessage } from 'element-plus'
import { useRtOnDomains } from '../../composables/useRtOnDomains'

const { mode, tableSize, labelMap } = useTableDensity()

const route = useRoute()

function scenarioLabel(type) {
  const m = {
    teaching: '校内教学实训',
    enterprise_collab: '校企协同实训',
    mixed: '综合（教学+企业标准）',
  }
  return m[type] || '综合（教学+企业标准）'
}

const task = ref(null)
const loading = ref(true)
const errorMsg = ref('')
const fileList = ref([])
const uploadedFile = ref(null)
const parsingZip = ref(false)

function isZipFile(file) {
  if (!file || !file.name) return false
  return /\.zip$/i.test(file.name)
}

const submitForm = reactive({
  content: '',
})

const nowTick = ref(Date.now())
let countdownTimer = null

const deadlinePassed = computed(() => {
  if (!task.value?.deadline) return false
  const d = new Date(task.value.deadline)
  return !Number.isNaN(d.getTime()) && Date.now() > d.getTime()
})

const maxSubmissions = computed(() => {
  const n = parseInt(String(task.value?.max_submissions ?? 1), 10)
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 9999) : 1
})

const submitCount = computed(() => {
  const n = Number(task.value?.submit_count)
  return Number.isFinite(n) && n >= 0 ? n : 0
})

const submitRemaining = computed(() => {
  const r = Number(task.value?.submit_remaining)
  if (Number.isFinite(r) && r >= 0) return r
  return Math.max(0, maxSubmissions.value - submitCount.value)
})

const submitLimitReached = computed(() => submitCount.value >= maxSubmissions.value)

const submitBlocked = computed(() => deadlinePassed.value || submitLimitReached.value)

const countdownText = computed(() => {
  if (!task.value?.deadline || deadlinePassed.value) return ''
  const d = new Date(task.value.deadline)
  const end = d.getTime()
  if (Number.isNaN(end)) return ''
  const ms = end - nowTick.value
  if (ms <= 0) return ''
  const s = Math.floor(ms / 1000)
  const days = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (days > 0) return `${days} 天 ${h} 小时 ${m} 分`
  if (h > 0) return `${h} 小时 ${m} 分 ${sec} 秒`
  return `${m} 分 ${sec} 秒`
})

const pageTitle = computed(() => {
  if (loading.value) return '加载中…'
  if (errorMsg.value) return '任务加载失败'
  return task.value?.title || '任务详情'
})

const requirementsList = computed(() => {
  if (!task.value?.requirements) return []
  return task.value.requirements.split('\n').filter((item) => item.trim())
})

const criteriaList = computed(() => {
  if (!task.value?.scoring_criteria) return []
  return task.value.scoring_criteria.split('\n').filter((item) => item.trim())
})

const metricsRows = computed(() => {
  const em = task.value?.evaluation_metrics
  if (!em) return []
  const arr = Array.isArray(em) ? em : typeof em === 'string' ? tryParse(em) : []
  if (!Array.isArray(arr)) return []
  return arr.map((x) => ({
    name: x.name,
    weight: x.weight,
    maxScore: x.maxScore != null ? x.maxScore : x.weight,
  }))
})

function tryParse(s) {
  try {
    return JSON.parse(s)
  } catch {
    return []
  }
}

const loadTask = async () => {
  loading.value = true
  errorMsg.value = ''
  task.value = null
  const id = route.params.id
  if (!id) {
    errorMsg.value = '无效的任务编号'
    loading.value = false
    return
  }
  try {
    const response = await getTaskById(id)
    if (response.success) {
      task.value = response.data
    } else {
      errorMsg.value = response.message || '获取任务失败'
    }
  } catch (e) {
    errorMsg.value = e?.response?.data?.message || e.message || '网络错误，请检查后端是否启动'
  } finally {
    loading.value = false
  }
}

const onFileChange = (_file, list) => {
  fileList.value = list
  const last = list[list.length - 1]
  uploadedFile.value = last?.raw || null
}

const onFileRemove = (_file, list) => {
  fileList.value = list
  uploadedFile.value = list.length ? list[list.length - 1]?.raw || null : null
}

const submitAssignment = async () => {
  if (deadlinePassed.value) {
    ElMessage.warning('已超过截止时间，无法提交')
    return
  }
  if (submitLimitReached.value) {
    ElMessage.error('已达到最大提交次数，无法再次提交')
    return
  }
  if (!uploadedFile.value && !submitForm.content?.trim()) {
    ElMessage.error('请上传文件，或填写文字说明')
    return
  }

  const formData = new FormData()
  formData.append('taskId', route.params.id)
  formData.append('content', submitForm.content || '')
  if (uploadedFile.value) {
    formData.append('file', uploadedFile.value)
  }

  const zipSubmit = uploadedFile.value && isZipFile(uploadedFile.value)
  if (zipSubmit) {
    parsingZip.value = true
    ElMessage.info('正在智能解析压缩包内容…')
  }

  try {
    const response = await submitApi(formData, zipSubmit ? { timeout: 180000 } : {})
    if (response.success) {
      if (zipSubmit && typeof response.archiveExtractedFileCount === 'number') {
        ElMessage.success(
          `压缩包已解析，共提取 ${response.archiveExtractedFileCount} 个文件；提交成功`,
        )
      } else {
        ElMessage.success('提交成功，后端将自动解析附件文本用于批改与智能核查')
      }
      submitForm.content = ''
      uploadedFile.value = null
      fileList.value = []
      await loadTask()
    }
  } catch (error) {
    const detail =
      error?.response?.data?.error ||
      error?.response?.data?.message ||
      error?.message ||
      '提交失败'
    ElMessage.error(detail)
    console.error(error)
  } finally {
    parsingZip.value = false
  }
}

watch(
  () => route.params.id,
  () => {
    loadTask()
  }
)

onMounted(() => {
  loadTask()
  countdownTimer = setInterval(() => {
    nowTick.value = Date.now()
  }, 1000)
})

useRtOnDomains(['tasks', 'submissions', 'submission_student', 'grading', 'similarity'], () => {
  loadTask()
})

onUnmounted(() => {
  if (countdownTimer) clearInterval(countdownTimer)
})
</script>

<style scoped>
.task-detail {
  padding: 20px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  gap: 12px;
}

.header h2 {
  flex: 1;
  font-size: 20px;
  color: #0b3d6d;
  margin: 0;
  font-weight: 600;
}

.tip-banner {
  margin-bottom: 16px;
  border-radius: 10px;
}

.deadline-banner {
  margin-bottom: 16px;
  border-radius: 10px;
}

.scenario-strip {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}

.scenario-label {
  font-size: 13px;
  color: var(--sg-text-secondary);
}

.info-section--enterprise {
  border-left: 3px solid #1677ff;
}

.content {
  max-width: 900px;
}

.info-section {
  background: white;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 16px;
  box-shadow: 0 4px 16px rgba(15, 76, 129, 0.06);
}

.section-head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #e8eef5;
}

.section-head h3 {
  margin: 0;
  font-size: 16px;
  color: var(--sg-text);
  font-weight: 600;
}

.mini-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.mini-toolbar-label {
  font-size: 12px;
  color: var(--sg-text-secondary);
}

.dim-table {
  border-radius: var(--sg-radius-md);
}

.info-section > h3 {
  margin: 0 0 12px;
  font-size: 16px;
  color: var(--sg-text);
  border-bottom: 1px solid #e8eef5;
  padding-bottom: 8px;
  font-weight: 600;
}

.muted {
  margin: 0;
  color: #94a3b8;
  font-size: 14px;
}

.info-section p {
  margin: 0;
  color: #475569;
  line-height: 1.6;
}

.info-section ul {
  margin: 0;
  padding-left: 20px;
}

.info-section li {
  margin-bottom: 8px;
  color: #475569;
}

.info-row {
  margin-bottom: 10px;
}

.info-row .label {
  color: #64748b;
  margin-right: 8px;
}

.upload-section {
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 4px 16px rgba(15, 76, 129, 0.06);
}

.upload-section h3 {
  margin: 0 0 12px;
  font-size: 16px;
  color: #0b3d6d;
  border-bottom: 1px solid #e8eef5;
  padding-bottom: 8px;
}

.upload-hint {
  margin: 0 0 16px;
  font-size: 14px;
  color: #64748b;
  line-height: 1.6;
}

.upload-block {
  width: 100%;
}

.submit-form {
  margin-top: 8px;
}
</style>
