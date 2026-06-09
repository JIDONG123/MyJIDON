<template>
    <div class="admin-layout app-shell">
        <aside class="sidebar app-sidebar">
            <SidebarBrand title="校企实训评价" subtitle="高校–企业协同" />
            <el-menu router :default-active="activeMenu" class="sidebar-menu">
                <el-menu-item index="/admin/dashboard">
                    <el-icon>
                        <component :is="PieChart" />
                    </el-icon>
                    <span>数据概览</span>
                </el-menu-item>
                <el-menu-item index="/admin/classes">
                    <el-icon>
                        <component :is="OfficeBuilding" />
                    </el-icon>
                    <span>班级管理</span>
                </el-menu-item>
                <el-menu-item index="/admin/curriculum">
                    <el-icon>
                        <component :is="Collection" />
                    </el-icon>
                    <span>课程监管</span>
                </el-menu-item>
                <el-menu-item index="/admin/users/students">
                    <el-icon>
                        <component :is="User" />
                    </el-icon>
                    <span>学生账号</span>
                </el-menu-item>
                <el-menu-item index="/admin/users/teachers">
                    <el-icon>
                        <component :is="Avatar" />
                    </el-icon>
                    <span>教师账号</span>
                </el-menu-item>
                <el-menu-item index="/admin/users/enterprise">
                    <el-icon>
                        <component :is="OfficeBuilding" />
                    </el-icon>
                    <span>企业导师</span>
                </el-menu-item>
                <el-menu-item index="/admin/tasks">
                    <el-icon>
                        <component :is="Document" />
                    </el-icon>
                    <span>任务管理</span>
                </el-menu-item>
                <el-menu-item index="/admin/grading-jobs">
                    <el-icon>
                        <component :is="EditPen" />
                    </el-icon>
                    <span>AI 批改任务</span>
                </el-menu-item>
                <el-menu-item index="/admin/statistics">
                    <el-icon>
                        <component :is="TrendCharts" />
                    </el-icon>
                    <span>报表统计</span>
                </el-menu-item>
                <el-menu-item index="/admin/big-screen">
                    <el-icon>
                        <component :is="TrendCharts" />
                    </el-icon>
                    <span>数据大屏</span>
                </el-menu-item>
                <el-menu-item index="/admin/qbank/questions">
                    <el-icon>
                        <component :is="Collection" />
                    </el-icon>
                    <span>题库监管</span>
                </el-menu-item>
                <el-menu-item index="/admin/knowledge-graph">
                    <el-icon>
                        <component :is="Share" />
                    </el-icon>
                    <span>知识图谱</span>
                </el-menu-item>
                <el-menu-item index="/admin/content-safety">
                    <el-icon>
                        <component :is="Warning" />
                    </el-icon>
                    <span>内容安全审核</span>
                </el-menu-item>
                <el-menu-item index="/admin/settings">
                    <el-icon>
                        <component :is="Setting" />
                    </el-icon>
                    <span>系统设置</span>
                </el-menu-item>
            </el-menu>
        </aside>
        <main class="main-content app-main">
            <header class="top-header app-topbar">
                <div class="header-left">
                    <span class="page-title">{{ pageTitle }}</span>
                </div>
                <div class="header-right">
                    <NotificationBell role="admin" class="header-bell" />
                    <span class="user-info">{{ userStore.user?.realName ?? '—' }}</span>
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
            <GradingJobProgressPanel base-path="/admin" />
        </main>
    </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '../stores/user'
import { PieChart, OfficeBuilding, User, Avatar, Document, Setting, TrendCharts, Collection, Share, EditPen, Warning } from '@element-plus/icons-vue'
import { logoutAndGoLogin } from '../utils/authLogout'
import SidebarBrand from '../components/SidebarBrand.vue'
import NotificationBell from '../components/NotificationBell.vue'
import GradingJobProgressPanel from '../components/GradingJobProgressPanel.vue'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const activeMenu = computed(() => {
    const p = route.path
    if (p.startsWith('/admin/grading-jobs')) return '/admin/grading-jobs'
    if (p.startsWith('/admin/tasks') || p.startsWith('/admin/submissions')) return '/admin/tasks'
    if (p.startsWith('/admin/grading/')) return '/admin/tasks'
    if (p.startsWith('/admin/teaching-classes') || p.startsWith('/admin/curriculum')) return '/admin/curriculum'
    if (p.startsWith('/admin/qbank')) return '/admin/qbank/questions'
    if (p.startsWith('/admin/knowledge-graph')) return '/admin/knowledge-graph'
    if (p.startsWith('/admin/content-safety')) return '/admin/content-safety'
    if (p.startsWith('/admin/users/students')) return '/admin/users/students'
    if (p.startsWith('/admin/users/teachers')) return '/admin/users/teachers'
    if (p.startsWith('/admin/users/enterprise')) return '/admin/users/enterprise'
    return p
})

const pageTitle = computed(() => {
    const p = route.path
    if (p === '/admin/tasks/create') return '发布任务'
    if (/^\/admin\/tasks\/\d+\/edit$/.test(p)) return '编辑任务'
    if (/^\/admin\/grading-jobs\/\d+/.test(p)) return '批改任务详情'
    if (p.startsWith('/admin/grading-jobs')) return 'AI 批改任务中心'
    const titles = {
        '/admin/dashboard': '数据概览',
        '/admin/classes': '班级管理',
        '/admin/curriculum': '课程与实训监管',
        '/admin/users/students': '学生账号管理',
        '/admin/users/teachers': '教师账号管理',
        '/admin/users/enterprise': '企业导师账号',
        '/admin/tasks': '任务管理',
        '/admin/statistics': '报表统计',
        '/admin/big-screen': '数据大屏',
        '/admin/qbank/questions': '题库监管',
        '/admin/knowledge-graph': '知识图谱',
        '/admin/content-safety': '内容安全审核',
        '/admin/settings': '系统设置',
        '/admin/submissions': '作业列表',
        '/admin/grading': '批改详情'
    }
    if (p.startsWith('/admin/teaching-classes')) return '教学班成员'
    if (p.startsWith('/admin/grading/')) return '批改详情'
    if (p.startsWith('/admin/statistics')) return '报表统计'
    if (p.startsWith('/admin/big-screen')) return '数据大屏'
    return titles[p] || '实训智能批改'
})

onMounted(() => {
    userStore.loadUserFromStorage()
})

const handleLogout = () => {
    logoutAndGoLogin(router)
}
</script>

<style scoped>
.sidebar {
    --sg-sidebar-brand-bg: #0c1222;
    background: linear-gradient(165deg, var(--sg-sidebar-admin-from) 0%, #152238 42%, var(--sg-sidebar-admin-to) 100%);
    color: white;
    box-shadow: 4px 0 32px rgba(8, 15, 35, 0.35);
}

.sidebar-menu {
    border-right: none;
    background: transparent;
}

.sidebar-menu :deep(.el-menu-item) {
    color: rgba(255, 255, 255, 0.82);
    height: 46px;
    line-height: 46px;
}

.sidebar-menu :deep(.el-menu-item:hover) {
    background: rgba(255, 255, 255, 0.12);
    color: #fff;
}

.sidebar-menu :deep(.el-menu-item.is-active) {
    background: linear-gradient(90deg, rgba(255, 255, 255, 0.2) 0%, rgba(255, 255, 255, 0.06) 100%);
    color: white;
    border-left: 3px solid rgba(147, 197, 253, 0.95);
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

.user-info {
    margin-right: 16px;
    color: var(--sg-text-secondary);
    font-size: 14px;
}

.main-scroll {
    padding: 20px 24px 36px;
    width: 100%;
    box-sizing: border-box;
}
</style>