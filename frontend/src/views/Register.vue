<template>
  <div class="login-shell login-shell--register">
    <div class="login-hero" aria-hidden="true">
      <div class="hero-glow hero-glow--a" />
      <div class="hero-glow hero-glow--b" />
      <div class="hero-grid" />
      <div class="hero-content">
        <div class="hero-badge">
          <AppLogoIcon :size="22" class="hero-badge-logo" />
          学生开户
        </div>
        <h1 class="hero-title">
          加入实训课堂
          <span class="hero-title-line">与智能批改闭环</span>
        </h1>
        <p class="hero-lead">
          面向校企协同实训学员：使用管理员预先创建的班级完成注册；登录后可提交代码与文档成果，查看多维评分、智能核查与个人 PDF 报告。密码请妥善保管。
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
          若下拉中无班级，请联系教务或管理员在「班级管理」中创建班级后再注册。
        </p>
      </div>
    </div>

    <div class="login-aside login-aside--register">
      <div class="login-card login-card--register">
        <header class="card-head card-head--compact">
          <div class="card-brand">
            <AppLogoIcon :size="40" />
            <div class="card-brand-text">
              <h2 class="card-title card-title--compact">创建学生账户</h2>
              <p class="card-sub">智能实训作业批改系统</p>
            </div>
          </div>
        </header>

        <el-form :model="form" class="login-form register-form" label-position="top" require-asterisk-position="right">
          <div class="register-form-grid">
            <el-form-item label="用户名" required>
              <el-input v-model="form.username" placeholder="登录名，请勿使用中文" clearable :prefix-icon="User" />
            </el-form-item>
            <el-form-item label="真实姓名" required>
              <el-input v-model="form.realName" placeholder="与教务一致便于核对" clearable :prefix-icon="Avatar" />
            </el-form-item>
            <el-form-item label="密码" required>
              <el-input
                v-model="form.password"
                type="password"
                placeholder="至少 6 位，含字母与数字"
                show-password
                clearable
                :prefix-icon="Lock"
              />
            </el-form-item>
            <el-form-item label="确认密码" required>
              <el-input
                v-model="form.confirmPassword"
                type="password"
                placeholder="再次输入密码"
                show-password
                clearable
                :prefix-icon="Lock"
              />
            </el-form-item>
            <el-form-item label="邮箱">
              <el-input v-model="form.email" type="email" placeholder="选填，用于通知与找回" clearable :prefix-icon="Message" />
            </el-form-item>
            <el-form-item label="选择班级（可选）">
              <el-select v-model="form.classId" placeholder="可不选，注册后由教师加入" clearable filterable>
                <el-option v-for="cls in classes" :key="cls.id" :label="cls.class_name" :value="cls.id" />
              </el-select>
            </el-form-item>
          </div>
          <el-form-item class="login-form__submit register-form__submit">
            <el-button type="primary" class="submit-btn" :loading="submitting" @click="handleRegister">
              {{ submitting ? '提交中…' : '注册' }}
            </el-button>
          </el-form-item>
        </el-form>

        <div class="card-meta card-meta--compact">
          <span class="card-meta-text">已有账户？</span>
          <router-link to="/login" class="card-meta-link">立即登录</router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { User, Lock, Avatar, Message, School, Notebook, CircleCheck } from '@element-plus/icons-vue'
import { useUserStore } from '../stores/user'
import { getPublicClassNames } from '../api/class'
import { ElMessage } from 'element-plus'
import { validatePasswordPlaintext } from '../utils/passwordPolicy'
import AppLogoIcon from '../components/AppLogoIcon.vue'
import '../styles/auth-pages.css'

const router = useRouter()
const userStore = useUserStore()
const classes = ref([])
const submitting = ref(false)

const featureItems = [
  { icon: School, text: '绑定班级后即可进入实训中心查看教师发布的任务' },
  { icon: Notebook, text: '在线提交文档 / 代码成果，自动解析送评' },
  { icon: CircleCheck, text: '跟踪批改状态与综合成绩报告' },
]

const form = reactive({
  username: '',
  password: '',
  confirmPassword: '',
  realName: '',
  email: '',
  classId: '',
})

onMounted(async () => {
  try {
    const response = await getPublicClassNames()
    if (response.success) {
      classes.value = response.data
    }
  } catch (error) {
    console.error('获取班级列表失败:', error)
  }
})

const handleRegister = async () => {
  if (!form.username || !form.password || !form.realName) {
    ElMessage.error('请填写必填字段')
    return
  }

  if (form.password !== form.confirmPassword) {
    ElMessage.error('两次输入的密码不一致')
    return
  }

  const pv = validatePasswordPlaintext(form.password)
  if (!pv.ok) {
    ElMessage.error(pv.message)
    return
  }

  submitting.value = true
  try {
    const result = await userStore.register(form.username, form.password, form.realName, form.email, form.classId)
    if (result.success) {
      ElMessage.success('注册成功，请登录')
      router.push('/login')
    } else {
      ElMessage.error(result.message || '注册失败')
    }
  } finally {
    submitting.value = false
  }
}
</script>
