<template>
  <article class="task-card" @click="$emit('action', task)">
    <div class="task-card-tags">
      <span class="source-tag" :class="isTeaching ? 'source-tag--tc' : 'source-tag--legacy'">
        {{ isTeaching ? '教学班' : '行政班' }}
      </span>
      <span class="status-tag" :class="`status-tag--${task.uiStatus}`">
        {{ statusLabel(task.uiStatus) }}
      </span>
    </div>

    <h3 class="task-card-title">{{ task.title }}</h3>
    <p class="task-card-desc">{{ task.description || '暂无任务简介' }}</p>

    <ul class="task-card-meta">
      <template v-if="isTeaching">
        <li v-if="task.course_name">
          <span class="meta-k">课程</span>{{ task.course_name }}
        </li>
        <li v-if="task.teaching_class_name">
          <span class="meta-k">教学班</span>{{ task.teaching_class_name }}
        </li>
        <li>
          <span class="meta-k">任课教师</span>{{ task.creator_name || '--' }}
        </li>
      </template>
      <template v-else>
        <li>
          <span class="meta-k">行政班</span>{{ task.class_name || classNameFallback || '--' }}
        </li>
        <li>
          <span class="meta-k">发布教师</span>{{ task.creator_name || '--' }}
        </li>
      </template>
      <li>
        <span class="meta-k">截止</span>{{ formatDateTime(task.deadline) }}
      </li>
      <li>
        <span class="meta-k">满分</span>{{ task.max_score }} 分
      </li>
      <li v-if="scoreLine">
        <span class="meta-k">得分</span>{{ scoreLine }}
      </li>
      <li v-else-if="task.uiStatus === 'pending_grade' || task.uiStatus === 'submitted'">
        <span class="meta-k">状态</span>待批改
      </li>
    </ul>

    <div class="task-card-action">
      <el-button
        type="primary"
        size="small"
        :disabled="task.uiStatus === 'expired'"
        @click.stop="$emit('action', task)"
      >
        {{ actionLabel(task.uiStatus) }}
      </el-button>
    </div>
  </article>
</template>

<script setup>
import { computed } from 'vue'
import { formatDateTime } from '../../utils/format'
import { statusLabel, actionLabel } from '../../composables/useStudentLearningSpaces'

const props = defineProps({
  task: { type: Object, required: true },
  grade: { type: Object, default: null },
  classNameFallback: { type: String, default: '' },
})

defineEmits(['action'])

const isTeaching = computed(() => !!props.task.teaching_class_id)

const scoreLine = computed(() => {
  const grade = props.grade
  if (!grade) return ''
  const score = grade.displayScore ?? grade.final_score ?? grade.total_score
  if (score == null || score === '') return ''
  return `${score} 分`
})
</script>

<style scoped>
.task-card {
  background: #fff;
  border: 1px solid #e5eaf2;
  border-radius: 12px;
  padding: 14px 16px;
  cursor: pointer;
  transition: box-shadow 0.15s, border-color 0.15s;
  display: flex;
  flex-direction: column;
  min-height: 0;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
}

.task-card:hover {
  border-color: #cbd5e1;
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.06);
}

.task-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.source-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 500;
}

.source-tag--legacy {
  background: #f3f4f6;
  color: #6b7280;
  border: 1px solid #e5e7eb;
}

.source-tag--tc {
  background: #eff6ff;
  color: #1d5fd6;
  border: 1px solid #dbeafe;
}

.status-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 500;
}

.status-tag--unsubmitted {
  background: #fff7ed;
  color: #ea580c;
  border: 1px solid #fed7aa;
}

.status-tag--submitted {
  background: #eff6ff;
  color: #1d5fd6;
  border: 1px solid #bfdbfe;
}

.status-tag--pending_grade {
  background: #f5f3ff;
  color: #6d28d9;
  border: 1px solid #ddd6fe;
}

.status-tag--graded,
.status-tag--completed {
  background: #ecfdf5;
  color: #16a34a;
  border: 1px solid #a7f3d0;
}

.status-tag--expired {
  background: #fef2f2;
  color: #dc2626;
  border: 1px solid #fecaca;
}

.task-card-title {
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 600;
  color: #1f2d3d;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.task-card-desc {
  margin: 0 0 10px;
  font-size: 13px;
  color: #6b7280;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  flex: 1;
}

.task-card-meta {
  list-style: none;
  margin: 0 0 12px;
  padding: 0;
  font-size: 12px;
  color: #6b7280;
}

.task-card-meta li {
  margin-bottom: 4px;
  line-height: 1.45;
}

.meta-k {
  color: #9ca3af;
  margin-right: 6px;
}

.task-card-action {
  text-align: right;
}

.task-card-action :deep(.el-button--primary) {
  --el-button-bg-color: #1d5fd6;
  --el-button-border-color: #1d5fd6;
  --el-button-hover-bg-color: #184fb3;
  --el-button-hover-border-color: #184fb3;
}
</style>
