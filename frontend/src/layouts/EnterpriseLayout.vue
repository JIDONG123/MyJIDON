<template>
  <div class="enterprise-layout app-shell">
    <aside class="sidebar app-sidebar">
      <SidebarBrand title="校企实训评价" subtitle="企业导师工作台" />
      <el-menu router :default-active="activeMenu" class="sidebar-menu">
        <el-menu-item index="/enterprise/home">
          <el-icon><component :is="OfficeBuilding" /></el-icon>
          <span>企业评价工作台</span>
        </el-menu-item>
      </el-menu>
    </aside>
    <main class="main-content app-main">
      <header class="top-header app-topbar">
        <div class="header-left">
          <span class="page-title">{{ pageTitle }}</span>
        </div>
        <div class="header-right">
          <span class="user-info">{{ userStore.user?.realName ?? '—' }}</span>
          <el-button link @click="handleLogout">退出登录</el-button>
        </div>
      </header>
      <div class="main-scroll layout-main-scroll app-main-scroll">
        <router-view v-slot="{ Component }">
          <transition name="sg-view" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </div>
    </main>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '../stores/user'
import { OfficeBuilding } from '@element-plus/icons-vue'
import { logoutAndGoLogin } from '../utils/authLogout'
import SidebarBrand from '../components/SidebarBrand.vue'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const activeMenu = computed(() => route.path)
const pageTitle = computed(() => {
  const p = route.path
  if (p.includes('/enterprise/home')) return '企业评价工作台'
  if (p.includes('/enterprise/submissions')) return '企业评价列表'
  if (p.includes('/enterprise/grading')) return '企业评价详情'
  return '企业导师工作台'
})

onMounted(async () => {
  userStore.loadUserFromStorage()
  await userStore.fetchUserInfo()
})

const handleLogout = () => {
  logoutAndGoLogin(router)
}
</script>

<style scoped>
.sidebar {
    --sg-sidebar-brand-bg: #1e1b4b;
    background: linear-gradient(165deg, var(--sg-sidebar-enterprise-from) 0%, #312e81 48%, var(--sg-sidebar-enterprise-to) 100%);
    color: white;
    box-shadow: 4px 0 28px rgba(30, 27, 75, 0.35);
}

.sidebar-menu {
  border-right: none;
  background: transparent;
}

.sidebar-menu :deep(.el-menu-item) {
    color: rgba(255, 255, 255, 0.84);
    height: 46px;
    line-height: 46px;
}

.sidebar-menu :deep(.el-menu-item:hover) {
    background: rgba(255, 255, 255, 0.12);
    color: #fff;
}

.sidebar-menu :deep(.el-menu-item.is-active) {
    background: linear-gradient(90deg, rgba(255, 255, 255, 0.22) 0%, rgba(255, 255, 255, 0.06) 100%);
    color: white;
    border-left: 3px solid rgba(196, 181, 253, 0.95);
}

.top-header {
    background: rgba(255, 255, 255, 0.92);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--sg-border);
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 24px;
    box-shadow: var(--sg-shadow-header);
}

.page-title {
    font-size: 17px;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: var(--sg-text);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.user-info {
  font-size: 14px;
  color: var(--sg-text-secondary);
}

.main-scroll {
    padding: 20px 24px 36px;
    width: 100%;
    box-sizing: border-box;
}
</style>
