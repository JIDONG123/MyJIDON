<template>
  <div class="login-shell">
    <div class="login-hero" aria-hidden="true">
      <div class="hero-glow hero-glow--a" />
      <div class="hero-glow hero-glow--b" />
      <div class="hero-grid" />
      <div class="hero-content">
        <div class="hero-badge">
          <span class="hero-badge-dot" />
          高职实训 · 智能批改
        </div>
        <h1 class="hero-title">
          软件实训自动批改
          <span class="hero-title-line">与评价平台</span>
        </h1>
        <p class="hero-lead">
          面向高校–企业协同实训：大模型接入、成果解析、智能核查、多维评价与 Excel/PDF
          报表。统一教学要求与岗位交付标准，服务管理员、教师/企业导师与学生的分权协作与安全鉴权。
        </p>
        <ul class="hero-features">
          <li v-for="item in featureItems" :key="item.text" class="hero-feature">
            <span class="hero-feature-icon">
              <el-icon><component :is="item.icon" /></el-icon>
            </span>
            <span class="hero-feature-text">{{ item.text }}</span>
          </li>
        </ul>
        <p class="hero-footnote">
          支持国产软硬件部署场景（LoongArch / 麒麟 OS 等）；对接 OpenAI 兼容 API，可配置密钥与地址。
        </p>
      </div>
    </div>

    <div class="login-aside">
      <div class="login-card">
        <header class="card-head">
          <h2 class="card-title">欢迎回来</h2>
          <p class="card-sub">使用分配账号登录实训批改系统</p>
        </header>

        <el-form
          :model="form"
          class="login-form"
          label-position="top"
          require-asterisk-position="right"
          @keyup.enter="handleLogin"
        >
          <el-form-item label="用户名" required>
            <el-input
              v-model="form.username"
              placeholder="请输入用户名"
              size="large"
              clearable
              :prefix-icon="User"
            />
          </el-form-item>
          <el-form-item label="密码" required>
            <el-input
              v-model="form.password"
              type="password"
              placeholder="请输入密码"
              size="large"
              show-password
              clearable
              :prefix-icon="Lock"
            />
            <p class="pwd-hint">密码由服务端安全校验；错误次数过多可能被限流，请勿尝试弱口令。</p>
          </el-form-item>
          <el-form-item class="login-form__submit">
            <el-button
              type="primary"
              size="large"
              class="submit-btn"
              :loading="loading"
              @click="handleLogin"
            >
              {{ loading ? '登录中…' : '登录' }}
            </el-button>
          </el-form-item>
        </el-form>

        <div class="card-meta">
          <span class="card-meta-text">还没有账户？</span>
          <router-link to="/register" class="card-meta-link">学生注册</router-link>
        </div>

        <div class="demo-block">
          <button type="button" class="demo-toggle" :aria-expanded="demoOpen" @click="demoOpen = !demoOpen">
            <span>演示与测试账号</span>
            <el-icon class="demo-toggle-icon" :class="{ 'is-open': demoOpen }">
              <ArrowDown />
            </el-icon>
          </button>
          <Transition name="demo-slide">
            <div v-show="demoOpen" class="demo-body">
              <p><strong>管理员</strong> admin / admin123</p>
              <p><strong>教师</strong> teacher1 / admin123</p>
              <p><strong>学生</strong> student1 / admin123</p>
            </div>
          </Transition>
        </div>
      </div>

      <p class="aside-foot">© 实训智能批改平台 · 仅供教学与竞赛演示环境使用</p>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import {
  User,
  Lock,
  Cpu,
  Document,
  DataAnalysis,
  ArrowDown,
} from '@element-plus/icons-vue'
import { useUserStore } from '../stores/user'
import { ElMessage } from 'element-plus'
import '../styles/auth-pages.css'

const router = useRouter()
const userStore = useUserStore()
const loading = ref(false)
const demoOpen = ref(false)

const featureItems = [
  { icon: Cpu, text: '大模型兼容 API，可配置模型与推理参数' },
  { icon: Document, text: 'Word / PDF / 图片等成果解析与客观核查' },
  { icon: DataAnalysis, text: '多维评分、成绩统计与报表导出' },
]

const form = reactive({
  username: '',
  password: '',
})

const handleLogin = async () => {
  if (!form.username || !form.password) {
    ElMessage.error('请输入用户名和密码')
    return
  }
  loading.value = true
  try {
    const success = await userStore.login(form.username, form.password)
    if (success) {
      ElMessage.success('登录成功')
      const role = userStore.user?.role
      switch (role) {
        case 'admin':
          router.push('/admin/dashboard')
          break
        case 'teacher':
          router.push('/teacher/dashboard')
          break
        case 'student':
          router.push('/student/tasks')
          break
        case 'enterprise':
          router.push('/enterprise/home')
          break
        default:
          router.push('/login')
      }
    } else {
      ElMessage.error('用户名或密码错误')
    }
  } finally {
    loading.value = false
  }
}
</script>
