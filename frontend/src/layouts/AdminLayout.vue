<template>
    <div class="admin-layout">
        <aside class="sidebar">
            <div class="logo">
                <h2>校企实训评价</h2>
                <p class="logo-sub">高校–企业协同</p>
            </div>
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
                <el-menu-item index="/admin/statistics">
                    <el-icon>
                        <component :is="TrendCharts" />
                    </el-icon>
                    <span>报表统计</span>
                </el-menu-item>
                <el-menu-item index="/admin/qbank/questions">
                    <el-icon>
                        <component :is="Collection" />
                    </el-icon>
                    <span>题库监管</span>
                </el-menu-item>
                <el-menu-item index="/admin/settings">
                    <el-icon>
                        <component :is="Setting" />
                    </el-icon>
                    <span>系统设置</span>
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
import { PieChart, OfficeBuilding, User, Avatar, Document, Setting, TrendCharts, Collection } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const activeMenu = computed(() => {
    const p = route.path
    if (p.startsWith('/admin/tasks') || p.startsWith('/admin/submissions') || p.startsWith('/admin/grading')) {
        return '/admin/tasks'
    }
    if (p.startsWith('/admin/statistics')) return '/admin/statistics'
    if (p.startsWith('/admin/qbank')) return '/admin/qbank/questions'
    if (p.startsWith('/admin/users/students')) return '/admin/users/students'
    if (p.startsWith('/admin/users/teachers')) return '/admin/users/teachers'
    if (p.startsWith('/admin/users/enterprise')) return '/admin/users/enterprise'
    return p
})

const pageTitle = computed(() => {
    const p = route.path
    if (p === '/admin/tasks/create') return '发布任务'
    if (/^\/admin\/tasks\/\d+\/edit$/.test(p)) return '编辑任务'
    const titles = {
        '/admin/dashboard': '数据概览',
        '/admin/classes': '班级管理',
        '/admin/users/students': '学生账号管理',
        '/admin/users/teachers': '教师账号管理',
        '/admin/users/enterprise': '企业导师账号',
        '/admin/tasks': '任务管理',
        '/admin/statistics': '报表统计',
        '/admin/qbank/questions': '题库监管',
        '/admin/settings': '系统设置',
        '/admin/submissions': '作业列表',
        '/admin/grading': '批改详情'
    }
    if (p.startsWith('/admin/submissions')) return '作业列表'
    if (p.startsWith('/admin/grading')) return '批改详情'
    if (p.startsWith('/admin/statistics')) return '报表统计'
    return titles[p] || '实训智能批改'
})

onMounted(() => {
    userStore.loadUserFromStorage()
})

const handleLogout = () => {
    userStore.logout()
    ElMessage.success('已退出登录')
    router.push('/login')
}
</script>

<style scoped>
.admin-layout {
    display: flex;
    min-height: 100vh;
    background: var(--sg-bg-page);
}

.sidebar {
    width: var(--sg-sidebar-width);
    background: linear-gradient(165deg, var(--sg-sidebar-admin-from) 0%, #152238 42%, var(--sg-sidebar-admin-to) 100%);
    color: white;
    flex-shrink: 0;
    box-shadow: 4px 0 32px rgba(8, 15, 35, 0.35);
    z-index: var(--sg-z-sidebar);
}

.logo {
    padding: 22px 16px 20px;
    text-align: center;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.06) 0%, transparent 100%);
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
    opacity: 0.78;
    font-weight: 500;
    letter-spacing: 0.04em;
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

.user-info {
    margin-right: 16px;
    color: var(--sg-text-secondary);
    font-size: 14px;
}

.main-scroll {
    flex: 1;
    overflow: auto;
    padding: 20px 24px 36px;
    width: 100%;
    box-sizing: border-box;
}
</style>