<template>
  <article
    class="space-card"
    :class="[
      `space-card--${card.tagVariant}`,
      { 'space-card--active': selected },
    ]"
    role="button"
    tabindex="0"
    @click="$emit('select', card.key)"
    @keyup.enter="$emit('select', card.key)"
  >
    <span v-if="selected" class="space-card-badge">当前查看</span>

    <div class="space-card-visual">
      <span class="space-tag space-tag--cover">{{ card.tag }}</span>
      <div class="space-cover-pattern" aria-hidden="true" />

      <!-- hover：深色蒙层 + 完整信息 -->
      <div class="space-card-overlay">
        <h3 class="overlay-title">{{ card.title }}</h3>
        <dl v-if="card.hoverRows?.length" class="overlay-dl">
          <div v-for="(row, idx) in card.hoverRows" :key="idx">
            <dt>{{ row.label }}</dt>
            <dd>{{ row.value }}</dd>
          </div>
        </dl>
      </div>
    </div>

    <!-- 默认：简洁摘要 -->
    <div class="space-card-foot">
      <h3 class="foot-title">{{ card.title }}</h3>
      <p v-if="card.type === 'all'" class="foot-desc">{{ card.description }}</p>

      <div class="foot-stats">
        <template v-if="card.type === 'all'">
          <div class="foot-stat-item">
            <span class="foot-stat-k">全部任务</span>
            <span class="foot-stat-v">{{ card.stats.total }}</span>
          </div>
          <div class="foot-stat-item">
            <span class="foot-stat-k">待提交</span>
            <span class="foot-stat-v foot-stat-v--warn">{{ card.stats.unsubmitted }}</span>
          </div>
        </template>
        <template v-else-if="card.type === 'legacy_class'">
          <div class="foot-stat-item">
            <span class="foot-stat-k">任务</span>
            <span class="foot-stat-v">{{ card.stats.total }}</span>
          </div>
          <div class="foot-stat-item">
            <span class="foot-stat-k">已完成</span>
            <span class="foot-stat-v foot-stat-v--ok">{{ card.stats.completed }}</span>
          </div>
        </template>
        <template v-else>
          <div class="foot-stat-item">
            <span class="foot-stat-k">任务</span>
            <span class="foot-stat-v">{{ card.stats.total }}</span>
          </div>
          <div class="foot-stat-item">
            <span class="foot-stat-k">待提交</span>
            <span class="foot-stat-v foot-stat-v--warn">{{ card.stats.unsubmitted }}</span>
          </div>
        </template>
      </div>

      <div v-if="card.type !== 'all'" class="foot-hint">悬停查看详情</div>
    </div>
  </article>
</template>

<script setup>
defineProps({
  card: { type: Object, required: true },
  selected: { type: Boolean, default: false },
})

defineEmits(['select'])
</script>

<style scoped>
.space-card {
  position: relative;
  display: flex;
  flex-direction: column;
  background: #fff;
  border: 1px solid #e5eaf2;
  border-radius: 16px;
  overflow: hidden;
  cursor: pointer;
  min-height: 200px;
  height: 100%;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
  transition:
    border-color 0.28s ease,
    box-shadow 0.28s ease,
    transform 0.28s ease;
}

.space-card:hover {
  border-color: #93c5fd;
  box-shadow: 0 12px 28px rgba(29, 95, 214, 0.14);
  transform: translateY(-2px);
}

.space-card:focus-visible {
  border-color: #93c5fd;
  box-shadow: 0 12px 28px rgba(29, 95, 214, 0.14);
}

.space-card--active {
  border-color: #1d5fd6;
  box-shadow: 0 0 0 1px rgba(29, 95, 214, 0.2), 0 8px 20px rgba(29, 95, 214, 0.12);
}

.space-card-badge {
  position: absolute;
  top: 10px;
  right: 10px;
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 999px;
  background: #1d5fd6;
  color: #fff;
  font-weight: 500;
  z-index: 4;
  box-shadow: 0 2px 6px rgba(29, 95, 214, 0.35);
}

/* 顶部封面区 */
.space-card-visual {
  position: relative;
  height: 88px;
  flex-shrink: 0;
  overflow: hidden;
  transition: height 0.38s cubic-bezier(0.4, 0, 0.2, 1);
}

.space-card--all .space-card-visual {
  background: linear-gradient(135deg, #64748b 0%, #475569 55%, #334155 100%);
}

.space-card--legacy .space-card-visual {
  background: linear-gradient(135deg, #94a3b8 0%, #64748b 50%, #475569 100%);
}

.space-card--teaching .space-card-visual {
  background: linear-gradient(135deg, #3b82f6 0%, #1d5fd6 55%, #1e40af 100%);
}

.space-cover-pattern {
  position: absolute;
  inset: 0;
  opacity: 0.18;
  background-image:
    radial-gradient(circle at 20% 80%, rgba(255, 255, 255, 0.35) 0%, transparent 45%),
    radial-gradient(circle at 80% 20%, rgba(255, 255, 255, 0.2) 0%, transparent 40%),
    repeating-linear-gradient(
      -45deg,
      transparent,
      transparent 8px,
      rgba(255, 255, 255, 0.04) 8px,
      rgba(255, 255, 255, 0.04) 16px
    );
  pointer-events: none;
}

.space-tag--cover {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 2;
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 999px;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.95);
  color: #1d5fd6;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
}

.space-card--all .space-tag--cover {
  color: #475569;
}

.space-card--legacy .space-tag--cover {
  color: #475569;
}

/* hover 蒙层详情 */
.space-card-overlay {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 12px 14px;
  background: linear-gradient(
    180deg,
    rgba(15, 23, 42, 0.15) 0%,
    rgba(15, 23, 42, 0.72) 45%,
    rgba(15, 23, 42, 0.92) 100%
  );
  opacity: 0;
  transform: translateY(8px);
  transition:
    opacity 0.32s ease,
    transform 0.32s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
  overflow: hidden;
}

.overlay-title {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 700;
  color: #fff;
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.overlay-dl {
  margin: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 5px 10px;
  overflow: hidden;
}

.overlay-dl div {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.overlay-dl dt {
  margin: 0;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.65);
  line-height: 1.2;
}

.overlay-dl dd {
  margin: 0;
  font-size: 11px;
  color: #fff;
  font-weight: 500;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 默认底部白区 */
.space-card-foot {
  flex: 1;
  padding: 14px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: #fff;
  transition:
    opacity 0.28s ease,
    transform 0.28s ease,
    max-height 0.38s ease,
    padding 0.28s ease;
}

.foot-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #1f2d3d;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  transition: color 0.2s;
}

.space-card--active .foot-title {
  color: #1d5fd6;
}

.foot-desc {
  margin: 0;
  font-size: 12px;
  color: #6b7280;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.foot-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 12px;
  margin-top: auto;
}

.foot-stat-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.foot-stat-k {
  font-size: 11px;
  color: #9ca3af;
}

.foot-stat-v {
  font-size: 18px;
  font-weight: 700;
  color: #1f2d3d;
  line-height: 1.2;
}

.foot-stat-v--warn {
  color: #f59e0b;
}

.foot-stat-v--ok {
  color: #16a34a;
}

.foot-hint {
  font-size: 11px;
  color: #cbd5e1;
  text-align: right;
  margin-top: 2px;
}

/* hover 动画：封面扩展 + 详情显现 + 底部收起 */
.space-card:hover .space-card-visual,
.space-card:focus-visible .space-card-visual {
  height: 100%;
  position: absolute;
  inset: 0;
  z-index: 2;
}

.space-card:hover .space-card-overlay,
.space-card:focus-visible .space-card-overlay {
  opacity: 1;
  transform: translateY(0);
}

.space-card:hover .space-card-foot,
.space-card:focus-visible .space-card-foot {
  opacity: 0;
  transform: translateY(12px);
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
  overflow: hidden;
  pointer-events: none;
}

.space-card:hover .foot-hint,
.space-card:focus-visible .foot-hint {
  display: none;
}

/* 选中且未 hover 时保持清晰边框 */
.space-card--active:not(:hover) .space-card-foot {
  background: #f8fbff;
}

@media (prefers-reduced-motion: reduce) {
  .space-card,
  .space-card-visual,
  .space-card-overlay,
  .space-card-foot {
    transition: none;
  }

  .space-card:hover {
    transform: none;
  }
}
</style>
