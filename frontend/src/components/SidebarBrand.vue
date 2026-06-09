<template>
  <div class="sidebar-brand" role="banner">
    <div class="sidebar-brand__icon" aria-hidden="true">
      <AppLogoIcon :size="iconSize" class="sidebar-brand__logo" />
    </div>
    <div class="sidebar-brand__copy">
      <h2 class="sidebar-brand__title">{{ title }}</h2>
      <p v-if="subtitle" class="sidebar-brand__subtitle">{{ subtitle }}</p>
    </div>
  </div>
</template>

<script setup>
import AppLogoIcon from './AppLogoIcon.vue'

defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  iconSize: { type: Number, default: 44 },
})
</script>

<style scoped>
.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px 16px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: var(--sg-sidebar-brand-bg, rgba(12, 22, 38, 0.98));
}

.sidebar-brand__icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sidebar-brand__logo {
  display: block;
  filter: drop-shadow(0 4px 12px rgba(15, 23, 42, 0.28));
}

.sidebar-brand__copy {
  min-width: 0;
  flex: 1;
}

.sidebar-brand__title {
  margin: 0;
  font-family:
    'Segoe UI',
    'PingFang SC',
    'Microsoft YaHei UI',
    'Microsoft YaHei',
    system-ui,
    -apple-system,
    sans-serif;
  font-size: 16px;
  font-weight: 700;
  line-height: 1.3;
  letter-spacing: 0.02em;
  color: #ffffff;
}

.sidebar-brand__subtitle {
  margin: 5px 0 0;
  font-family:
    'Segoe UI',
    'PingFang SC',
    'Microsoft YaHei UI',
    system-ui,
    sans-serif;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.35;
  letter-spacing: 0.06em;
  color: rgba(255, 255, 255, 0.52);
}
</style>
