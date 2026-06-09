<template>
  <div class="week-grid-wrap">
    <div v-if="!slots.length" class="grid-empty">
      <p>暂无节次数据，请切换周次或教学班查看安排。</p>
    </div>
    <div v-else class="week-grid" :style="gridStyle">
      <div class="week-grid__corner" />
      <div v-for="col in weekdays" :key="col.value" class="week-grid__head">{{ col.label }}</div>

      <template v-for="slot in slots" :key="slotKey(slot)">
        <div class="week-grid__period">{{ slot.label }}</div>
        <div
          v-for="col in weekdays"
          :key="`${slotKey(slot)}-${col.value}`"
          class="week-grid__cell"
        >
          <div v-if="!(cells[cellKey(col.value, slot)] || []).length" class="week-grid__empty">—</div>
          <div v-else class="week-grid__stack">
            <PracticeScheduleCard
              v-for="item in cells[cellKey(col.value, slot)]"
              :key="item.id"
              :row="item"
              compact
              :show-week="showWeekOnCards"
              @select="$emit('select', item)"
            />
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { buildScheduleGrid, cellKey as makeCellKey, periodSlotKey } from '../../../utils/trainingCalendarDisplay'
import PracticeScheduleCard from './PracticeScheduleCard.vue'

const props = defineProps({
  rows: { type: Array, default: () => [] },
  showWeekOnCards: { type: Boolean, default: false },
  weekdayMax: { type: Number, default: 5 },
})

defineEmits(['select'])

const grid = computed(() => buildScheduleGrid(props.rows, props.weekdayMax))
const slots = computed(() => grid.value.slots)
const weekdays = computed(() => grid.value.weekdays)
const cells = computed(() => grid.value.cells)

const gridStyle = computed(() => ({
  gridTemplateColumns: `72px repeat(${weekdays.value.length}, minmax(120px, 1fr))`,
  minWidth: `${72 + weekdays.value.length * 120}px`,
}))

function slotKey(slot) {
  return periodSlotKey(slot.start, slot.end)
}

function cellKey(weekday, slot) {
  return makeCellKey(weekday, slot)
}
</script>

<style scoped>
.week-grid-wrap {
  overflow-x: auto;
}

.week-grid {
  display: grid;
  border: 1px solid #e8edf3;
  border-radius: 12px;
  overflow: hidden;
  background: #fff;
}

.week-grid__corner {
  background: #f8fafc;
  border-bottom: 1px solid #eef2f7;
  border-right: 1px solid #eef2f7;
}

.week-grid__head {
  padding: 12px 10px;
  text-align: center;
  font-size: 13px;
  font-weight: 700;
  color: #0f172a;
  background: #f8fafc;
  border-bottom: 1px solid #eef2f7;
  border-right: 1px solid #eef2f7;
}

.week-grid__head:last-child {
  border-right: none;
}

.week-grid__period {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 6px;
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  background: #fafbfc;
  border-bottom: 1px solid #eef2f7;
  border-right: 1px solid #eef2f7;
}

.week-grid__cell {
  min-height: 88px;
  padding: 8px;
  border-bottom: 1px solid #eef2f7;
  border-right: 1px solid #eef2f7;
  background: #fcfdfe;
}

.week-grid__cell:last-child {
  border-right: none;
}

.week-grid__empty {
  height: 100%;
  min-height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #cbd5e1;
}

.week-grid__stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.grid-empty {
  padding: 32px 16px;
  text-align: center;
  color: #64748b;
  font-size: 14px;
  background: #fff;
  border: 1px dashed #e2e8f0;
  border-radius: 12px;
}
</style>
