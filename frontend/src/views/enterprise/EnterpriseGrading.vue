<template>
  <div class="tw-page ent-grading">
    <el-skeleton v-if="loading" animated :rows="10" />

    <template v-else-if="gr">
      <header class="tw-head">
        <div class="tw-head__left">
          <el-button plain @click="goBack">返回列表</el-button>
          <div>
            <h1 class="tw-title">{{ gr.title || '—' }} · {{ gr.student_name || '—' }}</h1>
            <p class="tw-subtitle">
              查看学生提交内容、AI 识别与教师复核结果，填写企业侧评分与评语。
            </p>
          </div>
        </div>
      </header>

      <section class="summary-strip">
        <div class="summary-strip__item">
          <span class="summary-strip__label">AI 分</span>
          <strong>{{ displayScore(gr.total_score) }}</strong>
        </div>
        <div class="summary-strip__item">
          <span class="summary-strip__label">教师复核分</span>
          <strong>{{ displayScore(gr.human_score) }}</strong>
        </div>
        <div class="summary-strip__item">
          <span class="summary-strip__label">当前综合分</span>
          <strong class="summary-strip__final">{{ displayScore(gr.final_score) }}</strong>
        </div>
        <div class="summary-strip__item">
          <span class="summary-strip__label">企业评价状态</span>
          <el-tag size="small" :type="reviewStatus.type">{{ reviewStatus.text }}</el-tag>
        </div>
        <div v-if="hasEnterpriseScore" class="summary-strip__item">
          <span class="summary-strip__label">企业评分</span>
          <strong>{{ displayScore(gr.enterprise_score) }}</strong>
        </div>
        <div class="summary-strip__item">
          <span class="summary-strip__label">提交时间</span>
          <strong class="summary-strip__time">{{ formatDateTime(gr.submitted_at) }}</strong>
        </div>
      </section>

      <div class="ent-grading-grid">
        <div class="ent-grading-main">
          <SubmissionWorkDisplay
            v-if="submissionWork"
            class="panel-block"
            :text="submissionWork.text"
            :file-name="submissionWork.fileName"
            :file-url="submissionWork.fileUrl"
            :file-type="submissionWork.fileType"
            collapse-long-text
          />

          <VlRecognitionPanel
            class="panel-block"
            :submission-id="route.params.submissionId"
            :initial="submissionDetail"
            variant="compact"
            @updated="loadSubmissionDetail"
          />

          <el-card class="panel-block" shadow="never">
            <template #header>
              <span class="panel-title">AI 评语摘要</span>
            </template>
            <div class="score-row">
              <span>AI 评分</span>
              <strong>{{ displayScore(gr.total_score) }}</strong>
            </div>
            <p class="panel-text">{{ gr.ai_comment || '—' }}</p>
            <div v-if="gr.dimension_scores?.length" class="dim-wrap">
              <h4 class="dim-title">维度得分</h4>
              <el-table :data="gr.dimension_scores" size="small" border>
                <el-table-column prop="name" label="维度" min-width="100" />
                <el-table-column label="得分" width="100" align="center">
                  <template #default="{ row }">{{ row.score ?? '—' }} / {{ row.maxScore ?? '—' }}</template>
                </el-table-column>
              </el-table>
            </div>
            <div v-if="aiProblems.length" class="problem-wrap">
              <h4 class="dim-title">问题提示</h4>
              <ul class="problem-list">
                <li v-for="(p, i) in aiProblems" :key="i">{{ p }}</li>
              </ul>
            </div>
          </el-card>

          <el-card class="panel-block" shadow="never">
            <template #header>
              <span class="panel-title">教师复核结果</span>
            </template>
            <div class="score-row">
              <span>教师复核分</span>
              <strong>{{ displayScore(gr.human_score) }}</strong>
            </div>
            <p class="panel-text">{{ gr.human_comment || '—' }}</p>
            <div class="score-row score-row--muted">
              <span>当前综合分</span>
              <strong>{{ displayScore(gr.final_score) }}</strong>
            </div>
          </el-card>
        </div>

        <aside class="ent-grading-aside">
          <el-card class="ent-review-card" shadow="never">
            <template #header>
              <div class="ent-review-head">
                <span class="panel-title">企业导师评价</span>
                <el-tag size="small" :type="reviewStatus.type">{{ reviewStatus.text }}</el-tag>
              </div>
            </template>
            <p class="ent-review-hint">
              企业评分与教师评分独立，按任务权重计入综合分。不可修改 AI 分与教师分。
            </p>
            <el-form label-position="top" @submit.prevent>
              <el-form-item label="企业评分（0–100）" required>
                <el-input-number
                  v-model="form.enterpriseScore"
                  :min="0"
                  :max="100"
                  :step="1"
                  controls-position="right"
                  class="score-input"
                />
              </el-form-item>
              <el-form-item label="企业评语">
                <div class="quick-tags">
                  <el-button
                    v-for="t in quickComments"
                    :key="t"
                    size="small"
                    plain
                    @click="insertQuickComment(t)"
                  >
                    {{ t }}
                  </el-button>
                </div>
                <el-input
                  v-model="form.enterpriseComment"
                  type="textarea"
                  :rows="5"
                  placeholder="填写企业侧评价意见"
                />
              </el-form-item>
              <el-form-item>
                <el-button type="primary" :loading="saving" class="save-btn" @click="save">
                  保存企业评分
                </el-button>
              </el-form-item>
            </el-form>
          </el-card>
        </aside>
      </div>
    </template>

    <template v-else-if="submissionWork">
      <header class="tw-head">
        <div class="tw-head__left">
          <el-button plain @click="goBack">返回列表</el-button>
          <div>
            <h1 class="tw-title">企业评价详情</h1>
            <p class="tw-subtitle">该提交尚未生成 AI 批改记录，暂无法填写企业评分。</p>
          </div>
        </div>
      </header>
      <SubmissionWorkDisplay
        class="panel-block"
        :text="submissionWork.text"
        :file-name="submissionWork.fileName"
        :file-url="submissionWork.fileUrl"
        :file-type="submissionWork.fileType"
        collapse-long-text
      />
      <VlRecognitionPanel
        class="panel-block"
        :submission-id="route.params.submissionId"
        :initial="submissionDetail || pendingSubmission"
        variant="compact"
        @updated="loadSubmissionDetail"
      />
      <el-empty description="暂无批改数据，请等待 AI 批改或教师复核后再评价" />
    </template>

    <el-empty v-else description="暂无数据" />
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getGradingResult, enterpriseReview } from '../../api/grading'
import { getSubmissionById } from '../../api/submission'
import { ElMessage, ElMessageBox } from 'element-plus'
import SubmissionWorkDisplay from '../../components/SubmissionWorkDisplay.vue'
import VlRecognitionPanel from '../../components/VlRecognitionPanel.vue'
import { mergeSubmissionWork, workFromGradingRow, workFromSubmissionApi } from '../../utils/submissionWorkMerge'
import { formatDateTime } from '../../utils/format'
import {
  ENTERPRISE_QUICK_COMMENTS,
  displayScore,
  enterpriseReviewMeta,
} from '../../utils/enterpriseWorkbench'

const route = useRoute()
const router = useRouter()
const loading = ref(true)
const saving = ref(false)
const gr = ref(null)
const pendingSubmission = ref(null)
const submissionDetail = ref(null)
const hadEnterpriseScore = ref(false)

const quickComments = ENTERPRISE_QUICK_COMMENTS

const form = reactive({
  enterpriseScore: null,
  enterpriseComment: '',
})

const submissionWork = computed(() => {
  const g = gr.value
  const detail = submissionDetail.value
  if (g) {
    return mergeSubmissionWork(workFromGradingRow(g), workFromSubmissionApi(detail))
  }
  const p = pendingSubmission.value
  if (p) return workFromSubmissionApi(p)
  return null
})

const reviewStatus = computed(() =>
  enterpriseReviewMeta({ enterprise_score: gr.value?.enterprise_score ?? form.enterpriseScore })
)

const hasEnterpriseScore = computed(
  () => gr.value?.enterprise_score != null && gr.value?.enterprise_score !== ''
)

const aiProblems = computed(() => {
  const raw = gr.value?.ai_problems
  if (!raw) return []
  return String(raw)
    .split(/[。\n；;]/)
    .map((x) => x.trim())
    .filter((x) => x.length > 2)
    .slice(0, 6)
})

const goBack = () => {
  const tid = gr.value?.task_id || pendingSubmission.value?.task_id
  if (tid) router.push(`/enterprise/submissions/${tid}`)
  else router.push('/enterprise/home')
}

const loadPendingSubmission = async () => {
  pendingSubmission.value = null
  try {
    const res = await getSubmissionById(route.params.submissionId)
    if (res.success) pendingSubmission.value = res.data
  } catch (_) {}
}

const loadSubmissionDetail = async () => {
  submissionDetail.value = null
  try {
    const res = await getSubmissionById(route.params.submissionId)
    if (res.success) submissionDetail.value = res.data
  } catch (_) {}
}

const insertQuickComment = (text) => {
  const cur = String(form.enterpriseComment || '').trim()
  form.enterpriseComment = cur ? `${cur}\n${text}` : text
}

const load = async () => {
  loading.value = true
  try {
    const res = await getGradingResult(route.params.submissionId)
    if (res.success) {
      if (!res.data) {
        gr.value = null
        await loadPendingSubmission()
        await loadSubmissionDetail()
        return
      }
      pendingSubmission.value = null
      gr.value = res.data
      await loadSubmissionDetail()
      form.enterpriseScore =
        res.data.enterprise_score != null && res.data.enterprise_score !== ''
          ? Number(res.data.enterprise_score)
          : null
      form.enterpriseComment = res.data.enterprise_comment || ''
      hadEnterpriseScore.value =
        res.data.enterprise_score != null && res.data.enterprise_score !== ''
    }
  } catch (e) {
    if (e?.response?.status === 404) {
      gr.value = null
      await loadPendingSubmission()
      await loadSubmissionDetail()
    } else {
      ElMessage.error(e?.response?.data?.message || e?.message || '加载失败')
    }
  } finally {
    loading.value = false
  }
}

const save = async () => {
  if (form.enterpriseScore == null || form.enterpriseScore === '') {
    ElMessage.warning('请填写企业评分（0–100）')
    return
  }
  const score = Number(form.enterpriseScore)
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    ElMessage.warning('企业评分须在 0–100 之间')
    return
  }

  const confirmMsg = hadEnterpriseScore.value
    ? '修改企业评分会重新计算综合分，是否继续？'
    : '企业评分将作为独立评价维度计入综合分，是否确认保存？'
  try {
    await ElMessageBox.confirm(confirmMsg, '确认保存', {
      confirmButtonText: '确认保存',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }

  saving.value = true
  try {
    const res = await enterpriseReview(route.params.submissionId, {
      enterpriseScore: score,
      enterpriseComment: form.enterpriseComment,
    })
    if (res.success) {
      ElMessage.success('企业评分已保存')
      hadEnterpriseScore.value = true
      await load()
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.ent-grading {
  background: #eef2f7;
}
.summary-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 20px;
  padding: 14px 18px;
  margin-bottom: 16px;
  background: #fff;
  border: 1px solid #e8edf3;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
}
.summary-strip__item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 100px;
}
.summary-strip__label {
  font-size: 12px;
  color: #64748b;
}
.summary-strip__item strong {
  font-size: 16px;
  color: #0f172a;
}
.summary-strip__final {
  color: #2563eb;
}
.summary-strip__time {
  font-size: 13px !important;
  font-weight: 600;
}
.ent-grading-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 16px;
  align-items: start;
}
.ent-grading-main {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}
.panel-block {
  border-radius: 12px;
  border: 1px solid #e8edf3;
}
.panel-block :deep(.el-card__header) {
  border-bottom: 1px solid #eef2f7;
}
.panel-title {
  font-weight: 700;
  font-size: 15px;
  color: #0f172a;
}
.panel-text {
  margin: 0;
  white-space: pre-wrap;
  font-size: 13px;
  line-height: 1.65;
  color: #334155;
}
.score-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  font-size: 13px;
  color: #64748b;
}
.score-row strong {
  color: #0f172a;
  font-size: 15px;
}
.score-row--muted {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed #e2e8f0;
}
.dim-wrap,
.problem-wrap {
  margin-top: 14px;
}
.dim-title {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: #475569;
}
.problem-list {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  color: #475569;
  line-height: 1.6;
}
.ent-grading-aside {
  position: sticky;
  top: 16px;
}
.ent-review-card {
  border-radius: 12px;
  border: 2px solid #bfdbfe;
  background: linear-gradient(180deg, #f8fbff 0%, #fff 48%);
  box-shadow: 0 4px 16px rgba(37, 99, 235, 0.08);
}
.ent-review-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.ent-review-hint {
  margin: 0 0 14px;
  font-size: 12px;
  line-height: 1.55;
  color: #64748b;
}
.quick-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}
.score-input {
  width: 100%;
}
.save-btn {
  width: 100%;
}
@media (max-width: 960px) {
  .ent-grading-grid {
    grid-template-columns: 1fr;
  }
  .ent-grading-aside {
    position: static;
  }
}
</style>
