<template>
  <div class="wrap">
    <el-button plain type="primary" @click="goBack">返回列表</el-button>
    <el-skeleton v-if="loading" :rows="8" animated />
    <template v-else-if="gr">
      <h2 class="title">{{ gr.title }} · {{ gr.student_name }}</h2>
      <SubmissionWorkDisplay
        v-if="submissionWork"
        class="submission-work-wrap"
        :text="submissionWork.text"
        :file-name="submissionWork.fileName"
        :file-url="submissionWork.fileUrl"
        :file-type="submissionWork.fileType"
      />
      <el-descriptions :column="2" border size="small" class="mb">
        <el-descriptions-item label="AI 分">{{ gr.total_score ?? '—' }}</el-descriptions-item>
        <el-descriptions-item label="教师复核分">{{ gr.human_score ?? '—' }}</el-descriptions-item>
        <el-descriptions-item label="当前综合分">{{ gr.final_score ?? '—' }}</el-descriptions-item>
        <el-descriptions-item label="企业已评">{{ gr.enterprise_score ?? '—' }}</el-descriptions-item>
      </el-descriptions>
      <el-card shadow="never" class="mb">
        <template #header>AI 评语摘要</template>
        <p class="pre">{{ gr.ai_comment || '—' }}</p>
      </el-card>
      <el-card shadow="never">
        <template #header>企业导师评分（与教师评分独立，按任务权重计入综合分）</template>
        <el-form label-width="100px" @submit.prevent>
          <el-form-item label="企业评分">
            <el-input-number v-model="form.enterpriseScore" :min="0" :max="Number(gr.max_score) || 100" :step="1" />
          </el-form-item>
          <el-form-item label="企业评语">
            <el-input v-model="form.enterpriseComment" type="textarea" :rows="4" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="saving" @click="save">保存企业评分</el-button>
          </el-form-item>
        </el-form>
      </el-card>
    </template>
    <template v-else-if="submissionWork">
      <SubmissionWorkDisplay
        class="submission-work-wrap"
        :text="submissionWork.text"
        :file-name="submissionWork.fileName"
        :file-url="submissionWork.fileUrl"
        :file-type="submissionWork.fileType"
      />
      <el-empty description="暂无批改数据" />
    </template>
    <el-empty v-else description="暂无数据" />
  </div>
</template>

<script setup>
import { onMounted, reactive, ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getGradingResult, enterpriseReview } from '../../api/grading'
import { getSubmissionById } from '../../api/submission'
import { ElMessage } from 'element-plus'
import SubmissionWorkDisplay from '../../components/SubmissionWorkDisplay.vue'
import { mergeSubmissionWork, workFromGradingRow, workFromSubmissionApi } from '../../utils/submissionWorkMerge'

const route = useRoute()
const router = useRouter()
const loading = ref(true)
const saving = ref(false)
const gr = ref(null)
const pendingSubmission = ref(null)
const submissionDetail = ref(null)

const submissionWork = computed(() => {
  const g = gr.value
  const detail = submissionDetail.value
  if (g) {
    return mergeSubmissionWork(workFromGradingRow(g), workFromSubmissionApi(detail))
  }
  const p = pendingSubmission.value
  if (p) {
    return workFromSubmissionApi(p)
  }
  return null
})

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
const form = reactive({
  enterpriseScore: null,
  enterpriseComment: '',
})

const goBack = () => {
  const tid = gr.value?.task_id
  if (tid) router.push(`/enterprise/submissions/${tid}`)
  else router.push('/enterprise/home')
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
  saving.value = true
  try {
    const res = await enterpriseReview(route.params.submissionId, {
      enterpriseScore: form.enterpriseScore,
      enterpriseComment: form.enterpriseComment,
    })
    if (res.success) {
      ElMessage.success('已保存')
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
.wrap {
  max-width: 720px;
}
.title {
  margin: 16px 0;
  font-size: 18px;
}
.mb {
  margin-bottom: 16px;
}
.submission-work-wrap {
  margin-bottom: 16px;
}
.pre {
  white-space: pre-wrap;
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
}
</style>
