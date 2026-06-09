<template>
  <el-drawer
    :model-value="visible"
    title="题目监管详情"
    size="720px"
    destroy-on-close
    @close="emit('update:visible', false)"
  >
    <el-skeleton v-if="loading" animated :rows="14" />

    <template v-else-if="question">
      <QbQuestionPreview :question="question" />

      <section class="detail-extra">
        <h4 class="detail-extra__title">归属与记录</h4>
        <dl class="detail-dl">
          <div class="detail-dl__row">
            <dt>题库 ID</dt>
            <dd>#{{ question.id }}</dd>
          </div>
          <div class="detail-dl__row">
            <dt>教师</dt>
            <dd>{{ question.teacher_name || '—' }}（{{ question.teacher_username || '—' }}）</dd>
          </div>
          <div class="detail-dl__row">
            <dt>创建时间</dt>
            <dd>{{ formatDateTime(question.created_at) }}</dd>
          </div>
          <div class="detail-dl__row">
            <dt>引用次数</dt>
            <dd>{{ usageMeta.count > 0 ? `${usageMeta.count} 次` : '未引用' }}</dd>
          </div>
        </dl>
      </section>

      <section class="detail-extra">
        <h4 class="detail-extra__title">引用记录</h4>
        <el-table v-if="usageRows.length" :data="usageRows" size="small" border>
          <el-table-column label="类型" width="100">
            <template #default="{ row }">{{ refTypeLabel(row.ref_type) }}</template>
          </el-table-column>
          <el-table-column prop="ref_title" label="标题" min-width="160" show-overflow-tooltip />
          <el-table-column label="时间" width="168">
            <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
          </el-table-column>
        </el-table>
        <p v-else class="detail-empty">暂无引用记录</p>
      </section>
    </template>

    <el-empty v-else description="题目不存在或无法加载" />
  </el-drawer>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import QbQuestionPreview from '../qb/QbQuestionPreview.vue'
import { getAdminQuestion, getAdminQuestionUsage } from '../../api/qb'
import { formatDateTime } from '../../utils/format'
import { qbUsageMeta } from '../../utils/qbQuestionQuality'

const props = defineProps({
  visible: { type: Boolean, default: false },
  questionId: { type: [Number, String], default: null },
})

const emit = defineEmits(['update:visible'])

const loading = ref(false)
const question = ref(null)
const usageRows = ref([])

const usageMeta = computed(() => qbUsageMeta(question.value || {}))

function refTypeLabel(t) {
  if (t === 'practice') return '习题练习'
  if (t === 'exam') return '在线考试'
  return t || '—'
}

async function loadDetail() {
  if (!props.questionId) return
  loading.value = true
  question.value = null
  usageRows.value = []
  try {
    const [qRes, uRes] = await Promise.all([
      getAdminQuestion(props.questionId),
      getAdminQuestionUsage(props.questionId),
    ])
    if (qRes.success) question.value = qRes.data
    if (uRes.success) usageRows.value = uRes.data || []
  } catch {
    /* partial fail ok */
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.visible, props.questionId],
  ([vis, id]) => {
    if (vis && id) loadDetail()
  }
)
</script>

<style scoped>
.detail-extra {
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid #eef2f7;
}

.detail-extra__title {
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

.detail-empty {
  margin: 0;
  font-size: 13px;
  color: #94a3b8;
}
</style>
