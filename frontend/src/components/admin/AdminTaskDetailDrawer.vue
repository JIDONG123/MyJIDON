<template>
  <el-drawer
    :model-value="visible"
    title="任务监管详情"
    size="720px"
    destroy-on-close
    @close="emit('update:visible', false)"
  >
    <el-skeleton v-if="loading" animated :rows="12" />

    <template v-else-if="task">
      <section class="detail-section">
        <h3 class="detail-section__title">任务基本信息</h3>
        <dl class="detail-dl">
          <div class="detail-dl__row">
            <dt>任务标题</dt>
            <dd>{{ task.title }}</dd>
          </div>
          <div class="detail-dl__row">
            <dt>任务类型</dt>
            <dd>{{ scenarioLabel(task.scenario_type) }}</dd>
          </div>
          <div class="detail-dl__row">
            <dt>满分</dt>
            <dd>{{ task.max_score ?? '—' }}</dd>
          </div>
          <div class="detail-dl__row">
            <dt>创建人</dt>
            <dd>{{ task.creator_name || '—' }}</dd>
          </div>
          <div class="detail-dl__row">
            <dt>创建时间</dt>
            <dd>{{ formatDateTime(task.created_at) }}</dd>
          </div>
          <div class="detail-dl__row">
            <dt>截止时间</dt>
            <dd>{{ formatDateTime(task.deadline) }}</dd>
          </div>
        </dl>
      </section>

      <section class="detail-section">
        <h3 class="detail-section__title">发布范围</h3>
        <dl class="detail-dl">
          <div class="detail-dl__row">
            <dt>发布类型</dt>
            <dd>
              <el-tag size="small" effect="light" :type="scopeMeta.type || undefined">
                {{ scopeMeta.tag }}
              </el-tag>
            </dd>
          </div>
          <div class="detail-dl__row">
            <dt>课程</dt>
            <dd>{{ task.course_name || '—' }}</dd>
          </div>
          <div class="detail-dl__row">
            <dt>行政班</dt>
            <dd>{{ task.teaching_class_id ? '—' : task.class_name || '—' }}</dd>
          </div>
          <div class="detail-dl__row">
            <dt>教学班</dt>
            <dd>{{ task.teaching_class_name || '—' }}</dd>
          </div>
        </dl>
      </section>

      <section class="detail-section">
        <h3 class="detail-section__title">提交进度</h3>
        <div class="stat-grid">
          <div class="stat-box">
            <span class="stat-box__label">应提交人数</span>
            <span class="stat-box__value">{{ expectedCount ?? '—' }}</span>
          </div>
          <div class="stat-box">
            <span class="stat-box__label">已提交人数</span>
            <span class="stat-box__value">{{ submittedCount ?? '—' }}</span>
          </div>
          <div class="stat-box">
            <span class="stat-box__label">未提交人数</span>
            <span class="stat-box__value">{{ unsubmittedCount ?? '—' }}</span>
          </div>
          <div class="stat-box">
            <span class="stat-box__label">提交率</span>
            <span class="stat-box__value">{{ submitRateLabel }}</span>
          </div>
        </div>
        <el-progress
          v-if="progressPct != null"
          :percentage="progressPct"
          :stroke-width="10"
          color="#2563eb"
          class="detail-progress"
        />
      </section>

      <section class="detail-section">
        <h3 class="detail-section__title">智能评价状态</h3>
        <div class="status-tags">
          <div class="status-tags__item">
            <span class="status-tags__label">AI 批改</span>
            <el-tag size="small" effect="light" :type="aiMeta.type">{{ aiMeta.text }}</el-tag>
          </div>
          <div class="status-tags__item">
            <span class="status-tags__label">代码运行</span>
            <el-tag size="small" effect="light" :type="codeMeta.type">{{ codeMeta.text }}</el-tag>
          </div>
          <div class="status-tags__item">
            <span class="status-tags__label">教师复核</span>
            <el-tag size="small" effect="light" :type="reviewMeta.type">{{ reviewMeta.text }}</el-tag>
          </div>
          <div class="status-tags__item">
            <span class="status-tags__label">企业评价</span>
            <el-tag size="small" effect="light" :type="enterpriseMeta.type">{{ enterpriseMeta.text }}</el-tag>
          </div>
        </div>
      </section>

      <section class="detail-section">
        <h3 class="detail-section__title">成绩概览</h3>
        <div class="stat-grid">
          <div class="stat-box">
            <span class="stat-box__label">平均分</span>
            <span class="stat-box__value">{{ scoreStats.avg ?? '—' }}</span>
          </div>
          <div class="stat-box">
            <span class="stat-box__label">最高分</span>
            <span class="stat-box__value">{{ scoreStats.max ?? '—' }}</span>
          </div>
          <div class="stat-box">
            <span class="stat-box__label">最低分</span>
            <span class="stat-box__value">{{ scoreStats.min ?? '—' }}</span>
          </div>
          <div class="stat-box">
            <span class="stat-box__label">已复核数量</span>
            <span class="stat-box__value">{{ scoreStats.reviewed ?? '—' }}</span>
          </div>
        </div>
      </section>

      <section class="detail-section detail-section--actions">
        <h3 class="detail-section__title">操作入口</h3>
        <div class="action-row">
          <el-button type="primary" plain @click="emit('view-submissions', task)">查看提交</el-button>
          <el-button plain @click="emit('export-scores', task)">导出成绩</el-button>
          <el-button plain @click="emit('view-grading-jobs', task)">查看批改任务</el-button>
        </div>
      </section>
    </template>

    <el-empty v-else description="任务不存在或无法加载" />
  </el-drawer>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { formatDateTime } from '../../utils/format'
import {
  scenarioLabel,
  publishScopeMeta,
  progressPercent,
  taskAiGradingMeta,
  taskCodeRunMeta,
  taskEnterpriseMeta,
  humanReviewMeta,
  computeScoreStats,
} from '../../utils/adminTaskMonitor'
import { getTaskById } from '../../api/task'
import { getSubmissionsByTask } from '../../api/submission'

const props = defineProps({
  visible: { type: Boolean, default: false },
  taskId: { type: [Number, String], default: null },
  taskRow: { type: Object, default: null },
})

const emit = defineEmits(['update:visible', 'view-submissions', 'export-scores', 'view-grading-jobs'])

const loading = ref(false)
const task = ref(null)
const detail = ref(null)
const subs = ref([])

const scopeMeta = computed(() => publishScopeMeta(task.value || {}))
const expectedCount = computed(() => {
  const n = Number(task.value?.classStudentCount)
  return Number.isFinite(n) ? n : null
})
const submittedCount = computed(() => {
  const n = Number(task.value?.submittedStudentCount)
  return Number.isFinite(n) ? n : null
})
const unsubmittedCount = computed(() => {
  if (expectedCount.value == null || submittedCount.value == null) return null
  return Math.max(0, expectedCount.value - submittedCount.value)
})
const progressPct = computed(() => progressPercent(task.value || {}))
const submitRateLabel = computed(() => {
  const pct = progressPct.value
  return pct == null ? '—' : `${pct}%`
})
const aiMeta = computed(() => taskAiGradingMeta(task.value, subs.value, detail.value))
const codeMeta = computed(() => taskCodeRunMeta(task.value, detail.value, subs.value))
const enterpriseMeta = computed(() => taskEnterpriseMeta(task.value, detail.value))
const reviewMeta = computed(() => humanReviewMeta(subs.value))
const scoreStats = computed(() => computeScoreStats(subs.value))

async function loadDetail() {
  if (!props.taskId) return
  loading.value = true
  task.value = props.taskRow ? { ...props.taskRow } : null
  detail.value = null
  subs.value = []
  try {
    const [taskRes, subRes] = await Promise.all([
      getTaskById(props.taskId),
      getSubmissionsByTask(props.taskId),
    ])
    if (taskRes.success) {
      task.value = { ...(task.value || {}), ...taskRes.data }
      detail.value = taskRes.data
    }
    if (subRes.success) subs.value = subRes.data || []
  } catch {
    /* keep partial row data */
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.visible, props.taskId],
  ([vis, id]) => {
    if (vis && id) loadDetail()
  }
)
</script>

<style scoped>
.detail-section {
  margin-bottom: 24px;
}

.detail-section__title {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 600;
  color: #334155;
}

.detail-dl__row {
  display: grid;
  grid-template-columns: 96px 1fr;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid #f1f5f9;
  font-size: 14px;
}

.detail-dl__row dt {
  margin: 0;
  color: #64748b;
}

.detail-dl__row dd {
  margin: 0;
  color: #1e293b;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.stat-box {
  padding: 12px 14px;
  background: #f8fafc;
  border-radius: 10px;
  border: 1px solid #eef2f7;
}

.stat-box__label {
  display: block;
  font-size: 12px;
  color: #64748b;
  margin-bottom: 4px;
}

.stat-box__value {
  font-size: 20px;
  font-weight: 700;
  color: #0f172a;
  font-variant-numeric: tabular-nums;
}

.detail-progress {
  margin-top: 14px;
}

.status-tags {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.status-tags__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: #f8fafc;
  border-radius: 8px;
}

.status-tags__label {
  font-size: 13px;
  color: #475569;
  font-weight: 500;
}

.detail-section--actions .action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
</style>
