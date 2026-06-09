<template>
  <div class="student-layout app-shell">
    <aside class="sidebar app-sidebar" :class="{ 'sidebar--exam-locked': examNavLocked }">
      <SidebarBrand title="校企实训学习端" subtitle="提交 · 报告" />
      <el-menu router :default-active="activeMenu" class="sidebar-menu">
        <el-menu-item index="/student/tasks">
          <el-icon>
            <component :is="Document" />
          </el-icon>
          <span>实训中心</span>
        </el-menu-item>
        <el-menu-item v-if="codeRunnerOn" index="/student/online-practice">
          <el-icon>
            <component :is="Cpu" />
          </el-icon>
          <span>在线实训</span>
        </el-menu-item>
        <el-menu-item index="/student/training-calendar">
          <el-icon>
            <component :is="Calendar" />
          </el-icon>
          <span>实训日历</span>
        </el-menu-item>
        <el-menu-item index="/student/submissions">
          <el-icon>
            <component :is="Upload" />
          </el-icon>
          <span>我的提交</span>
        </el-menu-item>
        <el-menu-item index="/student/results">
          <el-icon>
            <component :is="Trophy" />
          </el-icon>
          <span>成绩查询</span>
        </el-menu-item>
        <el-menu-item index="/student/qbank/practices">
          <el-icon>
            <component :is="Notebook" />
          </el-icon>
          <span>习题练习</span>
        </el-menu-item>
        <el-menu-item index="/student/qbank/exams">
          <el-icon>
            <component :is="Timer" />
          </el-icon>
          <span>在线考试</span>
        </el-menu-item>
        <el-menu-item index="/student/archive">
          <el-icon>
            <component :is="Memo" />
          </el-icon>
          <span>实训档案</span>
        </el-menu-item>
        <el-menu-item index="/student/learning">
          <el-icon>
            <component :is="DataAnalysis" />
          </el-icon>
          <span>学情画像</span>
        </el-menu-item>
        <el-menu-item index="/student/knowledge-graph">
          <el-icon>
            <component :is="Share" />
          </el-icon>
          <span>知识图谱</span>
        </el-menu-item>
        <el-menu-item index="/student/assistant">
          <el-icon>
            <component :is="ChatDotRound" />
          </el-icon>
          <span>AI 答疑助手</span>
        </el-menu-item>
        <el-menu-item index="/student/big-screen">
          <el-icon>
            <component :is="Monitor" />
          </el-icon>
          <span>数据大屏</span>
        </el-menu-item>
        <el-menu-item index="/student/settings">
          <el-icon>
            <component :is="Setting" />
          </el-icon>
          <span>我的设置</span>
        </el-menu-item>
      </el-menu>
    </aside>
    <main class="main-content app-main">
      <header class="top-header app-topbar">
        <div class="header-left">
          <div>
            <span class="page-title">{{ pageTitle }}</span>
            <p v-if="profileOneLine" class="sub-profile">{{ profileOneLine }}</p>
          </div>
        </div>
        <div class="header-right">
          <NotificationBell role="student" class="header-bell" />
          <router-link to="/student/settings" class="header-user-chip" title="我的设置">
            <UserAvatar
              :src="userStore.user?.avatarUrl"
              :name="userStore.user?.realName"
              :size="36"
              class="header-av"
            />
            <span class="header-user-name">{{ userStore.user?.realName ?? '—' }}</span>
          </router-link>
          <el-button link @click="handleLogout">退出登录</el-button>
        </div>
      </header>
      <el-alert
        v-if="examNavLocked"
        type="warning"
        show-icon
        :closable="false"
        title="考试中：侧栏菜单已锁定，请先交卷或退出考试后再使用其他功能。"
        class="exam-lock-banner app-shell-banner"
      />
      <div
        class="main-scroll layout-main-scroll app-main-scroll"
        :class="{ 'layout-main-scroll--workspace': route.meta.studentWorkspace }"
      >
        <router-view v-slot="{ Component, route }">
          <transition name="sg-view" mode="out-in">
            <keep-alive v-if="route.meta.keepAlive" :max="10">
              <component :is="Component" :key="route.name" class="route-view-root" />
            </keep-alive>
            <component
              v-else
              :is="Component"
              :key="route.fullPath"
              class="route-view-root"
              :class="{ 'route-view-root--workspace': route.meta.studentWorkspace }"
            />
          </transition>
        </router-view>
      </div>
    </main>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '../stores/user'
import { useStudentExamUiStore } from '../stores/studentExamUi'
import {
  Document,
  Upload,
  Trophy,
  Setting,
  Memo,
  DataAnalysis,
  ChatDotRound,
  Monitor,
  Notebook,
  Timer,
  Share,
  Calendar,
  Cpu,
} from '@element-plus/icons-vue'
import { logoutAndGoLogin } from '../utils/authLogout'
import UserAvatar from '../components/UserAvatar.vue'
import NotificationBell from '../components/NotificationBell.vue'
import SidebarBrand from '../components/SidebarBrand.vue'
import { probeCodeRunnerEnabled } from '../composables/useCodeRunnerFeature'

const codeRunnerOn = ref(false)

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const examUi = useStudentExamUiStore()

const profileOneLine = computed(() => {
  const u = userStore.user
  if (!u?.profileBio) return ''
  const s = String(u.profileBio).trim()
  return s.length > 42 ? `${s.slice(0, 42)}…` : s
})

/** 仅在线考试且处于「全屏答题」时锁定侧栏（查成绩/已结束不锁） */
const examNavLocked = computed(() => !!route.meta.studentExamLock && examUi.examTakeLocksSidebar)

const activeMenu = computed(() => {
  const path = route.path
  if (path.startsWith('/student/tasks')) return '/student/tasks'
  if (path.startsWith('/student/online-practice')) return '/student/online-practice'
  if (path.startsWith('/student/training-calendar')) return '/student/training-calendar'
  if (path.startsWith('/student/archive')) return '/student/archive'
  if (path.startsWith('/student/learning')) return '/student/learning'
  if (path.startsWith('/student/knowledge-graph')) return '/student/knowledge-graph'
  if (path.startsWith('/student/assistant')) return '/student/assistant'
  if (path.startsWith('/student/big-screen')) return '/student/big-screen'
  if (path.startsWith('/student/qbank/practices')) return '/student/qbank/practices'
  if (path.startsWith('/student/qbank/exams')) return '/student/qbank/exams'
  if (path.startsWith('/student/settings')) return '/student/settings'
  return path
})

const pageTitle = computed(() => {
  const p = route.path
  const titles = {
    '/student/tasks': '实训中心',
    '/student/online-practice': '在线实训',
    '/student/training-calendar': '实训日历',
    '/student/submissions': '我的提交',
    '/student/results': '成绩查询',
    '/student/results/detail': '成绩详情',
    '/student/settings': '我的设置',
    '/student/archive': '实训档案',
    '/student/learning': '学情画像',
    '/student/knowledge-graph': '知识图谱',
    '/student/assistant': 'AI 答疑助手',
    '/student/big-screen': '班级学情看板',
    '/student/qbank/practices': '习题练习',
    '/student/qbank/exams': '在线考试',
  }
  if (/^\/student\/tasks\/\d+/.test(p)) return '任务详情'
  if (/^\/student\/online-practice\/\d+/.test(p)) return '在线实训'
  if (/^\/student\/results\/\d+/.test(p)) return '成绩详情'
  if (/^\/student\/qbank\/practices\/\d+\/take/.test(p)) return '练习作答'
  if (/^\/student\/qbank\/exams\/\d+\/take/.test(p)) return '考试作答'
  return titles[p] || '智能批改系统'
})

onMounted(async () => {
  userStore.loadUserFromStorage()
  codeRunnerOn.value = await probeCodeRunnerEnabled()
  if (userStore.user?.role === 'student') {
    await userStore.fetchUserInfo()
  }
})

const handleLogout = () => {
  logoutAndGoLogin(router)
}
</script>

<style scoped>
.sidebar {
  --sg-sidebar-brand-bg: #064e3b;
  background: linear-gradient(165deg, var(--sg-sidebar-student-from) 0%, #0f3d32 48%, var(--sg-sidebar-student-to) 100%);
  color: white;
  box-shadow: 4px 0 28px rgba(6, 78, 59, 0.28);
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
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.2) 0%, rgba(255, 255, 255, 0.05) 100%);
  color: white;
  border-left: 3px solid rgba(153, 246, 228, 0.95);
}

.sidebar--exam-locked {
  pointer-events: none;
  opacity: 0.42;
  user-select: none;
}

.exam-lock-banner {
  margin: 0 24px;
  border-radius: 0 0 10px 10px;
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

.sub-profile {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--sg-text-secondary);
  max-width: 420px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-bell {
  margin-right: 4px;
}

.header-user-chip {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin-right: 8px;
  padding: 4px 10px 4px 4px;
  border-radius: 999px;
  text-decoration: none;
  color: inherit;
  transition:
    background 0.25s ease,
    box-shadow 0.25s ease;
}

.header-user-chip:hover {
  background: rgba(20, 184, 166, 0.12);
  box-shadow: 0 2px 12px rgba(20, 184, 166, 0.15);
}

.header-av {
  flex-shrink: 0;
}

.header-user-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--sg-text);
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.main-scroll {
  padding: 20px 24px 36px;
  width: 100%;
  box-sizing: border-box;
}
</style>