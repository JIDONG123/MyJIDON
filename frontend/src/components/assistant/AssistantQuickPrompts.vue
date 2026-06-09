<template>
  <div class="quick-prompts">
    <h3 class="quick-prompts__title">快捷问题</h3>
    <div class="quick-prompts__grid">
      <button
        v-for="(text, idx) in prompts"
        :key="idx"
        type="button"
        class="quick-prompts__chip"
        :disabled="disabled"
        @click="$emit('select', text)"
      >
        {{ text }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { QUICK_PROMPTS } from '../../utils/assistantDisplay'

defineProps({
  disabled: { type: Boolean, default: false },
})

defineEmits(['select'])

const prompts = QUICK_PROMPTS
</script>

<style scoped>
.quick-prompts__title {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 700;
  color: #334155;
}

.quick-prompts__grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.quick-prompts__chip {
  text-align: left;
  padding: 10px 12px;
  font-size: 13px;
  line-height: 1.45;
  color: #334155;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.quick-prompts__chip:hover:not(:disabled) {
  background: #eff6ff;
  border-color: #bfdbfe;
  color: #1d4ed8;
}

.quick-prompts__chip:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
