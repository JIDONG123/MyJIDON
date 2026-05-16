<template>
  <div class="enterprise-layout">
    <aside class="sidebar">
      <div class="logo">
        <h2>校企实训评价</h2>
        <p class="logo-sub">企业导师工作台</p>
      </div>
      <el-menu router :default-active="activeMenu" class="sidebar-menu">
        <el-menu-item index="/enterprise/home">
          <el-icon><component :is="OfficeBuilding" /></el-icon>
          <span>授权班级与任务</span>
        </el-menu-item>
      </el-menu>
    </aside>
    <main class="main-content">
      <header class="top-header">
        <div class="header-left">
          <span class="page-title">{{ pageTitle }}</span>
        </div>
        <div class="header-right">
          <span class="user-info">{{ userStore.user?.realName ?? '—' }}</span>
          <el-button link @click="handleLogout">退出登录</el-button>
        </div>
      </header>
      <div class="main-scroll layout-main-scroll">
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
import { ElMessage } from 'element-plus'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const activeMenu = computed(() => route.path)
const pageTitle = computed(() => (route.path.includes('/enterprise/home') ? '班级与实训任务' : '企业导师'))

onMounted(async () => {
  userStore.loadUserFromStorage()
  await userStore.fetchUserInfo()
})

const handleLogout = () => {
  userStore.logout()
  ElMessage.success('已退出登录')
  router.push('/login')
}
</script>

<style scoped>
.enterprise-layout {
    display: flex;
    min-height: 100vh;
    background: var(--sg-bg-page);
}

.sidebar {
    width: var(--sg-sidebar-width);
    background: linear-gradient(165deg, var(--sg-sidebar-enterprise-from) 0%, #312e81 48%, var(--sg-sidebar-enterprise-to) 100%);
    color: white;
    flex-shrink: 0;
    box-shadow: 4px 0 28px rgba(30, 27, 75, 0.35);
    z-index: var(--sg-z-sidebar);
}

.logo {
    padding: 22px 16px 20px;
    text-align: center;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.08) 0%, transparent 100%);
}

.logo h2 {
    font-size: 15px;
    margin: 0;
    font-weight: 700;
    letter-spacing: 0.02em;
}

.logo-sub {
    margin: 8px 0 0;
    font-size: 11px;
    opacity: 0.8;
    font-weight: 500;
    letter-spacing: 0.04em;
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

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.top-header {
    height: var(--sg-header-height);
    background: rgba(255, 255, 255, 0.92);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--sg-border);
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 24px;
    flex-shrink: 0;
    box-shadow: var(--sg-shadow-header);
    z-index: var(--sg-z-header);
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
    flex: 1;
    overflow: auto;
    padding: 20px 24px 36px;
    width: 100%;
    box-sizing: border-box;
}
</style>
