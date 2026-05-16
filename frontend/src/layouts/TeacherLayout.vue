<template>
    <div class="teacher-layout">
        <aside class="sidebar">
            <div class="logo">
                <h2>校企实训评价</h2>
                <p class="logo-sub">教师工作台</p>
            </div>
            <el-menu router :default-active="activeMenu" class="sidebar-menu">
                <el-menu-item index="/teacher/dashboard">
                    <el-icon>
                        <component :is="PieChart" />
                    </el-icon>
                    <span>数据概览</span>
                </el-menu-item>
                <el-menu-item index="/teacher/classes">
                    <el-icon>
                        <component :is="OfficeBuilding" />
                    </el-icon>
                    <span>班级管理</span>
                </el-menu-item>
                <el-menu-item index="/teacher/class-announcements">
                    <el-icon>
                        <component :is="Bell" />
                    </el-icon>
                    <span>班级公告</span>
                </el-menu-item>
                <el-menu-item index="/teacher/tasks">
                    <el-icon>
                        <component :is="Document" />
                    </el-icon>
                    <span>任务管理</span>
                </el-menu-item>
                <el-menu-item index="/teacher/statistics">
                    <el-icon>
                        <component :is="TrendCharts" />
                    </el-icon>
                    <span>成绩统计</span>
                </el-menu-item>
                <el-menu-item index="/teacher/export">
                    <el-icon>
                        <component :is="Download" />
                    </el-icon>
                    <span>批量导出</span>
                </el-menu-item>
                <el-menu-item index="/teacher/knowledge-base">
                    <el-icon>
                        <component :is="Collection" />
                    </el-icon>
                    <span>实训知识库</span>
                </el-menu-item>
                <el-menu-item index="/teacher/qbank/questions">
                    <el-icon>
                        <component :is="Reading" />
                    </el-icon>
                    <span>题库管理</span>
                </el-menu-item>
                <el-menu-item index="/teacher/qbank/practices">
                    <el-icon>
                        <component :is="EditPen" />
                    </el-icon>
                    <span>习题练习</span>
                </el-menu-item>
                <el-menu-item index="/teacher/qbank/exams">
                    <el-icon>
                        <component :is="Timer" />
                    </el-icon>
                    <span>在线考试</span>
                </el-menu-item>
                <el-menu-item index="/teacher/big-screen">
                    <el-icon>
                        <component :is="Monitor" />
                    </el-icon>
                    <span>数据大屏</span>
                </el-menu-item>
                <el-menu-item index="/teacher/assistant-stats">
                    <el-icon>
                        <component :is="ChatDotRound" />
                    </el-icon>
                    <span>学生助手统计</span>
                </el-menu-item>
                <el-menu-item index="/teacher/settings">
                    <el-icon>
                        <component :is="Setting" />
                    </el-icon>
                    <span>我的设置</span>
                </el-menu-item>
            </el-menu>
        </aside>
        <main class="main-content">
            <header class="top-header">
                <div class="header-left">
                    <div>
                        <span class="page-title">{{ pageTitle }}</span>
                        <p v-if="profileOneLine" class="sub-profile">{{ profileOneLine }}</p>
                    </div>
                </div>
                <div class="header-right">
                    <NotificationBell role="teacher" class="header-bell" />
                    <router-link to="/teacher/settings" class="header-user-chip" title="我的设置">
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
import {
    PieChart,
    OfficeBuilding,
    Bell,
    Document,
    TrendCharts,
    Setting,
    Download,
    Collection,
    Monitor,
    ChatDotRound,
    Reading,
    EditPen,
    Timer,
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import UserAvatar from '../components/UserAvatar.vue'
import NotificationBell from '../components/NotificationBell.vue'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const profileOneLine = computed(() => {
    const u = userStore.user
    if (!u?.profileBio) return ''
    const s = String(u.profileBio).trim()
    return s.length > 42 ? `${s.slice(0, 42)}…` : s
})

const activeMenu = computed(() => {
    const path = route.path
    if (path.startsWith('/teacher/tasks')) return '/teacher/tasks'
    if (path.startsWith('/teacher/submissions')) return '/teacher/tasks'
    if (path.startsWith('/teacher/grading')) return '/teacher/tasks'
    if (path.startsWith('/teacher/class-announcements')) return '/teacher/class-announcements'
    if (path.startsWith('/teacher/classes')) return '/teacher/classes'
    if (path.startsWith('/teacher/export')) return '/teacher/export'
    if (path.startsWith('/teacher/knowledge-base')) return '/teacher/knowledge-base'
    if (path.startsWith('/teacher/big-screen')) return '/teacher/big-screen'
    if (path.startsWith('/teacher/assistant-stats')) return '/teacher/assistant-stats'
    if (path.startsWith('/teacher/qbank/questions')) return '/teacher/qbank/questions'
    if (path.startsWith('/teacher/qbank/practices')) return '/teacher/qbank/practices'
    if (path.startsWith('/teacher/qbank/exams')) return '/teacher/qbank/exams'
    if (path.startsWith('/teacher/settings')) return '/teacher/settings'
    return path
})

const pageTitle = computed(() => {
    const p = route.path
    const titles = {
        '/teacher/dashboard': '数据概览',
        '/teacher/classes': '班级管理',
        '/teacher/class-announcements': '班级公告',
        '/teacher/tasks': '任务管理',
        '/teacher/statistics': '成绩统计',
        '/teacher/submissions': '作业列表',
        '/teacher/grading': '批改详情',
        '/teacher/settings': '我的设置',
        '/teacher/export': '批量导出',
        '/teacher/knowledge-base': '实训知识库',
        '/teacher/big-screen': '数据大屏',
        '/teacher/assistant-stats': '学生助手统计',
        '/teacher/qbank/questions': '题库管理',
        '/teacher/qbank/practices': '习题练习',
        '/teacher/qbank/exams': '在线考试',
    }
    if (p.match(/^\/teacher\/classes\/[^/]+\/students$/)) return '班级学生管理'
    if (p.startsWith('/teacher/classes/')) return '班级工作台'
    if (p.startsWith('/teacher/submissions')) return '作业列表'
    if (p.startsWith('/teacher/grading')) return '批改详情'
    if (/^\/teacher\/qbank\/exams\/\d+\/monitor/.test(p)) return '考试监考'
    return titles[p] || '智能批改系统'
})

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
.teacher-layout {
    display: flex;
    min-height: 100vh;
    background: var(--sg-bg-page);
}

.sidebar {
    width: var(--sg-sidebar-width);
    background: linear-gradient(165deg, var(--sg-sidebar-teacher-from) 0%, #0f2744 45%, var(--sg-sidebar-teacher-to) 100%);
    color: white;
    flex-shrink: 0;
    box-shadow: 4px 0 28px rgba(8, 47, 73, 0.32);
    z-index: var(--sg-z-sidebar);
}

.logo {
    padding: 22px 16px 20px;
    text-align: center;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.07) 0%, transparent 100%);
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
    background: linear-gradient(90deg, rgba(255, 255, 255, 0.22) 0%, rgba(255, 255, 255, 0.05) 100%);
    color: white;
    border-left: 3px solid rgba(191, 219, 254, 0.95);
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

.sub-profile {
    margin: 4px 0 0;
    font-size: 12px;
    color: var(--sg-text-secondary);
    max-width: 420px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.header-bell {
    margin-right: 4px;
}

.header-right {
    display: flex;
    align-items: center;
    gap: 8px;
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
    background: var(--sg-primary-soft);
    box-shadow: 0 4px 16px rgba(37, 99, 235, 0.12);
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
    flex: 1;
    overflow: auto;
    padding: 20px 24px 36px;
    width: 100%;
    box-sizing: border-box;
}
</style>