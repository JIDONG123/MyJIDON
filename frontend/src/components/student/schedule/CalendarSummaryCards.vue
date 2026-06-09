<template>
  <section class="summary-grid">
    <div v-for="card in cards" :key="card.key" class="summary-card">
      <div class="summary-card__icon" :class="`summary-card__icon--${card.tone}`">
        <el-icon><component :is="card.icon" /></el-icon>
      </div>
      <div class="summary-card__body">
        <span class="summary-card__value">{{ card.value }}</span>
        <span class="summary-card__label">{{ card.label }}</span>
        <span class="summary-card__hint">{{ card.hint }}</span>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { Calendar, School, Document, Clock } from '@element-plus/icons-vue'
import { computeSummary, weekdayLabel, periodLabel } from '../../../utils/trainingCalendarDisplay'

const props = defineProps({
  rows: { type: Array, default: () => [] },
  weekNo: { type: Number, default: 0 },
})

const cards = computed(() => {
  const s = computeSummary(props.rows, props.weekNo)
  const nearestText = s.nearest
    ? `${weekdayLabel(s.nearest.weekday)} ${periodLabel(s.nearest)} · ${s.nearest.title || '实训'}`
    : '—'

  return [
    {
      key: 'sessions',
      label: props.weekNo > 0 ? '本周实训次数' : '实训次数',
      value: s.sessionCount,
      hint: s.weekHint,
      icon: Calendar,
      tone: 'blue',
    },
    {
      key: 'classes',
      label: '涉及教学班',
      value: s.classCount,
      hint: '当前筛选范围',
      icon: School,
      tone: 'teal',
    },
    {
      key: 'tasks',
      label: '关联任务',
      value: s.taskCount,
      hint: '已绑定实训任务',
      icon: Document,
      tone: 'indigo',
    },
    {
      key: 'nearest',
      label: '最近一节课',
      value: nearestText,
      hint: '按星期节次排序',
      icon: Clock,
      tone: 'green',
      isText: true,
    },
  ]
})
</script>

<style scoped>
.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 14px;
  margin-bottom: 16px;
}

.summary-card {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 18px 16px;
  background: #fff;
  border: 1px solid #e8edf3;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
}

.summary-card__icon {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
}

.summary-card__icon--blue { background: #eff6ff; color: #1677ff; }
.summary-card__icon--teal { background: #f0fdfa; color: #0d9488; }
.summary-card__icon--indigo { background: #eef2ff; color: #4f46e5; }
.summary-card__icon--green { background: #f0fdf4; color: #16a34a; }

.summary-card__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.summary-card__value {
  font-size: 22px;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.25;
  word-break: break-word;
}

.summary-card:last-child .summary-card__value {
  font-size: 14px;
  font-weight: 600;
}

.summary-card__label {
  font-size: 13px;
  font-weight: 600;
  color: #475569;
}

.summary-card__hint {
  font-size: 11px;
  color: #94a3b8;
}
</style>
