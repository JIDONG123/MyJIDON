<template>
    <div class="teacher-layout app-shell">
        <aside class="sidebar app-sidebar">
            <SidebarBrand title="校企实训评价" subtitle="教师工作台" />
            <el-menu
                router
                :default-active="activeMenu"
                :default-openeds="defaultOpeneds"
                class="sidebar-menu sidebar-menu--teacher"
                background-color="transparent"
                text-color="rgba(255, 255, 255, 0.88)"
                active-text-color="#ffffff"
            >
                <el-menu-item index="/teacher/dashboard">
                    <el-icon><component :is="PieChart" /></el-icon>
                    <span>教师工作台</span>
                </el-menu-item>

                <el-sub-menu index="teach">
                    <template #title>
                        <el-icon><component :is="Reading" /></el-icon>
                        <span>课程教学</span>
                    </template>
                    <el-menu-item index="/teacher/courses">我的课程</el-menu-item>
                    <el-menu-item index="/teacher/teaching-classes">我的教学班</el-menu-item>
                    <el-menu-item index="/teacher/class-announcements">班级公告</el-menu-item>
                    <el-menu-item index="/teacher/classes">行政班工作台</el-menu-item>
                </el-sub-menu>

                <el-sub-menu index="practice">
                    <template #title>
                        <el-icon><component :is="Document" /></el-icon>
                        <span>实训评价</span>
                    </template>
                    <el-menu-item index="/teacher/tasks">实训任务</el-menu-item>
                    <el-menu-item v-if="codeRunnerOn" index="/teacher/online-practice">在线实训模板</el-menu-item>
                    <el-menu-item index="/teacher/grading-queue">成果批改</el-menu-item>
                    <el-menu-item index="/teacher/submission-feedbacks">作业反馈</el-menu-item>
                    <el-menu-item index="/teacher/grading-jobs">批改任务</el-menu-item>
                    <el-menu-item index="/teacher/statistics">成绩与报表</el-menu-item>
                    <el-menu-item index="/teacher/export">批量导出</el-menu-item>
                </el-sub-menu>

                <el-sub-menu index="resource">
                    <template #title>
                        <el-icon><component :is="Collection" /></el-icon>
                        <span>知识资源</span>
                    </template>
                    <el-menu-item index="/teacher/knowledge-base">实训知识库</el-menu-item>
                    <el-menu-item index="/teacher/knowledge-graph">知识图谱</el-menu-item>
                </el-sub-menu>

                <el-sub-menu index="qb">
                    <template #title>
                        <el-icon><component :is="EditPen" /></el-icon>
                        <span>测评中心</span>
                    </template>
                    <el-menu-item index="/teacher/qbank/questions">题库管理</el-menu-item>
                    <el-menu-item index="/teacher/qbank/practices">练习测评</el-menu-item>
                    <el-menu-item index="/teacher/qbank/exams">在线考试</el-menu-item>
                </el-sub-menu>

                <el-sub-menu index="analytics">
                    <template #title>
                        <el-icon><component :is="Monitor" /></el-icon>
                        <span>学情分析</span>
                    </template>
                    <el-menu-item index="/teacher/big-screen">数据大屏</el-menu-item>
                    <el-menu-item index="/teacher/assistant-stats">学生助手统计</el-menu-item>
                    <el-menu-item index="/teacher/class-weak-analysis">能力画像 / 薄弱点</el-menu-item>
                </el-sub-menu>

                <el-menu-item index="/teacher/settings">
                    <el-icon><component :is="Setting" /></el-icon>
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
            <div class="main-scroll layout-main-scroll app-main-scroll">
              <router-view v-slot="{ Component, route }">
                <transition name="sg-view" mode="out-in">
                  <keep-alive v-if="route.meta.keepAlive" :max="12">
                    <component :is="Component" :key="route.name" />
                  </keep-alive>
                  <component v-else :is="Component" :key="route.fullPath" />
                </transition>
              </router-view>
            </div>
            <GradingJobProgressPanel base-path="/teacher" />
        </main>
    </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '../stores/user'
import {
    PieChart,
    Document,
    Setting,
    Collection,
    Monitor,
    Reading,
    EditPen,
} from '@element-plus/icons-vue'
import { logoutAndGoLogin } from '../utils/authLogout'
import UserAvatar from '../components/UserAvatar.vue'
import NotificationBell from '../components/NotificationBell.vue'
import GradingJobProgressPanel from '../components/GradingJobProgressPanel.vue'
import SidebarBrand from '../components/SidebarBrand.vue'
import { probeCodeRunnerEnabled } from '../composables/useCodeRunnerFeature'

const codeRunnerOn = ref(false)

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const defaultOpeneds = ['practice']

const profileOneLine = computed(() => {
    const u = userStore.user
    if (!u?.profileBio) return ''
    const s = String(u.profileBio).trim()
    return s.length > 42 ? `${s.slice(0, 42)}…` : s
})

const activeMenu = computed(() => {
    const path = route.path
    if (path.startsWith('/teacher/grading-jobs')) return '/teacher/grading-jobs'
    if (path.startsWith('/teacher/grading-queue') || path.startsWith('/teacher/grading/')) return '/teacher/grading-queue'
    if (path.startsWith('/teacher/tasks') || path.startsWith('/teacher/submissions')) return '/teacher/tasks'
    if (path.startsWith('/teacher/online-practice')) return '/teacher/online-practice'
    if (path.startsWith('/teacher/courses')) return '/teacher/courses'
    if (path.startsWith('/teacher/teaching-classes') || path.startsWith('/teacher/training-calendar') || path.startsWith('/teacher/project-templates')) {
        if (path.includes('project-templates')) return '/teacher/courses'
        return path.startsWith('/teacher/training-calendar') ? '/teacher/teaching-classes' : path
    }
    if (path.startsWith('/teacher/class-announcements')) return '/teacher/class-announcements'
    if (path.startsWith('/teacher/export')) return '/teacher/export'
    if (path.startsWith('/teacher/knowledge-base')) return '/teacher/knowledge-base'
    if (path.startsWith('/teacher/knowledge-graph')) return '/teacher/knowledge-graph'
    if (path.startsWith('/teacher/big-screen')) return '/teacher/big-screen'
    if (path.startsWith('/teacher/assistant-stats')) return '/teacher/assistant-stats'
    if (path.startsWith('/teacher/class-weak-analysis')) return '/teacher/class-weak-analysis'
    if (path.startsWith('/teacher/classes')) return '/teacher/classes'
    if (path.startsWith('/teacher/qbank/questions')) return '/teacher/qbank/questions'
    if (path.startsWith('/teacher/qbank/practices')) return '/teacher/qbank/practices'
    if (path.startsWith('/teacher/qbank/exams')) return '/teacher/qbank/exams'
    if (path.startsWith('/teacher/settings')) return '/teacher/settings'
    if (path.startsWith('/teacher/statistics')) return '/teacher/statistics'
    return path
})

const pageTitle = computed(() => {
    const p = route.path
    const titles = {
        '/teacher/dashboard': '教师工作台',
        '/teacher/courses': '我的课程',
        '/teacher/teaching-classes': '我的教学班',
        '/teacher/class-announcements': '班级公告',
        '/teacher/tasks': '实训任务',
        '/teacher/online-practice': '在线实训模板',
        '/teacher/grading-queue': '成果批改',
        '/teacher/grading-jobs': 'AI 批改任务中心',
        '/teacher/statistics': '成绩与报表',
        '/teacher/export': '批量导出',
        '/teacher/knowledge-base': '实训知识库',
        '/teacher/knowledge-graph': '知识图谱',
        '/teacher/big-screen': '数据大屏',
        '/teacher/assistant-stats': '学生助手统计',
        '/teacher/class-weak-analysis': '能力画像 / 薄弱点',
        '/teacher/classes': '行政班工作台',
        '/teacher/qbank/questions': '题库管理',
        '/teacher/qbank/practices': '练习测评',
        '/teacher/qbank/exams': '在线考试',
        '/teacher/settings': '我的设置',
        '/teacher/project-templates': '项目模板',
        '/teacher/training-calendar': '实训日历',
    }
    if (p.startsWith('/teacher/online-practice/') && p.includes('/edit')) return '编辑在线实训模板'
    if (p === '/teacher/online-practice/create') return '新建在线实训模板'
    if (p.startsWith('/teacher/classes/')) return '班级工作台'
    if (p.startsWith('/teacher/teaching-classes/')) return '教学班详情'
    if (/^\/teacher\/grading-jobs\/\d+/.test(p)) return '批改任务详情'
    if (p.startsWith('/teacher/submissions')) return '任务提交与批改'
    if (p.startsWith('/teacher/grading/')) return '批改详情'
    if (/^\/teacher\/qbank\/exams\/\d+\/monitor/.test(p)) return '考试监考'
    return titles[p] || '智能批改系统'
})

onMounted(async () => {
    userStore.loadUserFromStorage()
    codeRunnerOn.value = await probeCodeRunnerEnabled()
    await userStore.fetchUserInfo()
})

const handleLogout = () => {
    logoutAndGoLogin(router)
}
</script>

<style scoped>
.sidebar {
    --sg-sidebar-brand-bg: #0c1929;
    background: linear-gradient(165deg, var(--sg-sidebar-teacher-from) 0%, #0f2744 45%, var(--sg-sidebar-teacher-to) 100%);
    color: white;
    box-shadow: 4px 0 28px rgba(8, 47, 73, 0.32);
}

/* 教师侧栏菜单：深色层级体系，覆盖 Element Plus 默认浅灰二级背景 */
.sidebar-menu--teacher {
    border-right: none;
    background: transparent !important;
    --el-menu-bg-color: transparent;
    --el-menu-hover-bg-color: rgba(255, 255, 255, 0.08);
    --el-menu-active-color: #ffffff;
}

.sidebar-menu--teacher :deep(.el-menu-item),
.sidebar-menu--teacher :deep(.el-sub-menu__title) {
    color: rgba(255, 255, 255, 0.9);
    height: 44px;
    line-height: 44px;
    border-radius: 8px;
    margin: 2px 10px;
    width: calc(100% - 20px) !important;
    min-width: auto;
    transition:
        background 0.2s ease,
        color 0.2s ease;
}

/* 一级分组：标题左对齐，展开箭头固定在最右侧 */
.sidebar-menu--teacher :deep(.el-sub-menu__title) {
    display: flex !important;
    align-items: center;
    padding-right: 40px !important;
    position: relative;
    box-sizing: border-box;
}

.sidebar-menu--teacher :deep(.el-sub-menu__title > span) {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.sidebar-menu--teacher :deep(.el-menu-item .el-icon),
.sidebar-menu--teacher :deep(.el-sub-menu__title .el-icon) {
    color: rgba(226, 236, 255, 0.92);
    font-size: 18px;
}

.sidebar-menu--teacher :deep(.el-menu-item:hover),
.sidebar-menu--teacher :deep(.el-sub-menu__title:hover) {
    background: rgba(255, 255, 255, 0.1) !important;
    color: #ffffff;
}

/* 一级菜单（无子级）选中 */
.sidebar-menu--teacher > :deep(.el-menu-item.is-active) {
    background: rgba(30, 111, 255, 0.2) !important;
    color: #ffffff;
    font-weight: 600;
    border-left: 3px solid #4da3ff;
    box-shadow: none;
}

/* 展开中的一级分组标题 */
.sidebar-menu--teacher :deep(.el-sub-menu.is-opened > .el-sub-menu__title) {
    background: rgba(255, 255, 255, 0.06) !important;
    color: #ffffff;
}

.sidebar-menu--teacher :deep(.el-sub-menu__title .el-sub-menu__icon-arrow) {
    position: absolute !important;
    right: 12px;
    top: 50%;
    margin: 0 !important;
    width: 20px;
    height: 20px;
    display: inline-flex !important;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    color: #b8c7da !important;
    transform: translateY(-50%);
    transition:
        transform 0.22s ease,
        color 0.2s ease;
    pointer-events: none;
}

.sidebar-menu--teacher :deep(.el-sub-menu__title .el-sub-menu__icon-arrow svg) {
    width: 14px;
    height: 14px;
}

.sidebar-menu--teacher :deep(.el-sub-menu__title:hover .el-sub-menu__icon-arrow) {
    color: #ffffff !important;
}

.sidebar-menu--teacher :deep(.el-sub-menu.is-opened > .el-sub-menu__title .el-sub-menu__icon-arrow) {
    color: #4da3ff !important;
    transform: translateY(-50%) rotate(180deg);
}

/* 二级菜单容器：深色半透明，去掉默认浅灰块 */
.sidebar-menu--teacher :deep(.el-sub-menu .el-menu) {
    background: rgba(0, 0, 0, 0.14) !important;
    padding: 4px 10px 6px 18px;
    margin: 0 0 4px;
    border-radius: 8px;
}

.sidebar-menu--teacher :deep(.el-menu--inline) {
    background: transparent !important;
}

.sidebar-menu--teacher :deep(.el-sub-menu .el-menu-item) {
    color: #b8c7da;
    height: 40px;
    line-height: 40px;
    padding-left: 12px !important;
    margin: 2px 0 !important;
    width: 100% !important;
    border-radius: 8px;
    background: transparent !important;
    border-left: 3px solid transparent;
    box-shadow: none;
    font-weight: 400;
}

.sidebar-menu--teacher :deep(.el-sub-menu .el-menu-item:hover) {
    color: #ffffff !important;
    background: rgba(255, 255, 255, 0.08) !important;
}

.sidebar-menu--teacher :deep(.el-sub-menu .el-menu-item.is-active) {
    color: #ffffff !important;
    background: rgba(30, 111, 255, 0.18) !important;
    border-left-color: #4da3ff;
    font-weight: 600;
    box-shadow: none;
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
    padding: 20px 24px 36px;
    width: 100%;
    box-sizing: border-box;
}
</style>
