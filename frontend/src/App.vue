<template>
  <div class="app-container">
    <router-view v-slot="{ Component }">
      <transition name="sg-fade" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>
  </div>
</template>

<script setup>
import { watch } from 'vue'
import { useRoute } from 'vue-router'
import { useUserStore } from './stores/user'
import { connectRealtime, disconnectRealtime } from './socket/realtimeClient'

const route = useRoute()
const userStore = useUserStore()

watch(
  () => [userStore.token, route.path],
  () => {
    const p = route.path || ''
    if (!userStore.token || p === '/login' || p === '/register') {
      disconnectRealtime()
      return
    }
    connectRealtime(() => userStore.token)
  },
  { immediate: true }
)
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html,
body,
#app {
  height: 100%;
}

body {
  font-family: var(--el-font-family);
  background: var(--sg-bg-page);
  min-height: 100%;
  color: var(--sg-text);
  font-size: 14px;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}

.app-container {
  min-height: 100%;
}

.sg-fade-enter-active,
.sg-fade-leave-active {
  transition:
    opacity 0.28s var(--sg-ease-in-out),
    transform 0.32s var(--sg-ease-out);
}

.sg-fade-enter-from {
  opacity: 0;
  transform: translateY(12px) scale(0.992);
}

.sg-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.996);
}

@media (prefers-reduced-motion: reduce) {
  .sg-fade-enter-active,
  .sg-fade-leave-active,
  .sg-fade-enter-from,
  .sg-fade-leave-to {
    transition: none;
    transform: none;
  }
}
</style>