<template>
  <button type="button" class="schedule-card" :class="{ 'schedule-card--compact': compact }" @click="$emit('select', row)">
    <div class="schedule-card__head">
      <span class="schedule-card__title" :title="row.title">{{ row.title || '实训安排' }}</span>
      <el-tag v-if="row.task_id" size="small" type="success" effect="plain">有任务</el-tag>
      <el-tag v-else size="small" type="info" effect="plain">无任务</el-tag>
    </div>
    <p v-if="showWeek && row.week_no" class="schedule-card__week">第 {{ row.week_no }} 周</p>
    <p class="schedule-card__class" :title="row.teaching_class_name">{{ row.teaching_class_name || '—' }}</p>
    <p v-if="row.location" class="schedule-card__loc">
      <el-icon><Location /></el-icon>
      {{ row.location }}
    </p>
    <p v-if="row.task_title" class="schedule-card__task" :title="row.task_title">任务：{{ row.task_title }}</p>
  </button>
</template>

<script setup>
import { Location } from '@element-plus/icons-vue'

defineProps({
  row: { type: Object, required: true },
  compact: { type: Boolean, default: false },
  showWeek: { type: Boolean, default: false },
})

defineEmits(['select'])
</script>

<style scoped>
.schedule-card {
  display: block;
  width: 100%;
  text-align: left;
  padding: 10px 12px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
}

.schedule-card--compact {
  padding: 8px 10px;
}

.schedule-card:hover {
  border-color: #1677ff;
  box-shadow: 0 4px 12px rgba(22, 119, 255, 0.12);
  transform: translateY(-1px);
}

.schedule-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 6px;
  margin-bottom: 6px;
}

.schedule-card__title {
  font-size: 13px;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.35;
  flex: 1;
  min-width: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.schedule-card__week {
  margin: 0 0 4px;
  font-size: 11px;
  color: #94a3b8;
}

.schedule-card__class {
  margin: 0 0 4px;
  font-size: 12px;
  color: #475569;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.schedule-card__loc {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 0 0 4px;
  font-size: 11px;
  color: #64748b;
}

.schedule-card__task {
  margin: 0;
  font-size: 11px;
  color: #1677ff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
