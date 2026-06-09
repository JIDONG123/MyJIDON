<template>
  <div class="login-shell login-page">
    <div class="login-hero login-left" aria-hidden="true">
      <div class="hero-grid" />
      <div class="hero-glow-blue" />
      <div class="hero-glow-cyan" />
      <div class="hero-perspective" />

      <LoginHeroGraphic class="hero-graphic" />

      <div class="hero-content">
        <div class="hero-badge hero-tag">软件实训 · 智能批改 · 知识图谱 · 校企协同</div>

        <div class="hero-main">
          <div class="hero-copy">
            <h1 class="hero-title">
              <span class="hero-title-line hero-title-line--white">龙芯智训</span>
              <span class="hero-title-line hero-title-line--gradient">让软件实训评价更智能、更精准</span>
            </h1>

            <p class="hero-lead hero-desc">
              聚焦高校软件实训与校企协同场景，融合
              <span class="hero-em">大模型智能批改</span>、
              <span class="hero-em">知识图谱</span>学情分析、
              <span class="hero-em">RAG 知识库</span>辅助评阅、
              <span class="hero-em">代码运行检查</span>、图像识别与
              <span class="hero-em">内容安全检测</span>，构建从任务发布、成果提交、智能评测、教师复核、企业评价、学情反馈到
              <span class="hero-em">报告输出</span>的实训评价闭环。
            </p>
          </div>
        </div>

        <ul class="hero-features feature-grid">
          <li v-for="item in featureItems" :key="item.key" class="hero-feature">
            <span class="hero-feature-icon">
              <el-icon><component :is="item.icon" /></el-icon>
            </span>
            <div class="hero-feature-body">
              <span class="hero-feature-title">{{ item.title }}</span>
              <span class="hero-feature-text">{{ item.desc }}</span>
            </div>
          </li>
        </ul>
      </div>
    </div>

    <div class="login-aside login-right">
      <div class="login-card">
        <header class="card-head card-head--centered">
          <AppLogoIcon :size="52" class="card-logo" />
          <h2 class="card-title">欢迎登录</h2>
          <p class="card-sub">龙芯智训 · 校企实训智慧评价平台</p>
        </header>

        <el-form
          :model="form"
          class="login-form login-page-form"
          label-position="top"
          require-asterisk-position="right"
          @keyup.enter="handleLogin"
        >
          <el-form-item label="账号" required>
            <el-input
              v-model="form.username"
              placeholder="请输入用户名 / 工号 / 学号"
              size="large"
              clearable
              :prefix-icon="User"
            />
          </el-form-item>
          <el-form-item label="密码" required>
            <el-input
              v-model="form.password"
              type="password"
              placeholder="请输入登录密码"
              size="large"
              show-password
              clearable
              :prefix-icon="Lock"
            />
          </el-form-item>
          <el-form-item label="图形验证码" required>
            <div class="captcha-row">
              <el-input
                v-model="form.captchaCode"
                placeholder="请输入图形验证码"
                maxlength="4"
                size="large"
                class="captcha-input"
                @keyup.enter="handleLogin"
              />
              <button
                type="button"
                class="captcha-img-btn"
                title="点击刷新验证码"
                @click="refreshCaptcha"
              >
                <img v-if="captchaImage" :src="captchaImage" alt="图形验证码" class="captcha-img" />
                <span v-else class="captcha-loading">{{ captchaLoadHint }}</span>
              </button>
              <button type="button" class="captcha-refresh-btn" title="刷新验证码" @click="refreshCaptcha">
                <el-icon><Refresh /></el-icon>
                <span>刷新</span>
              </button>
            </div>
          </el-form-item>
          <el-form-item class="login-form__submit">
            <el-button
              type="primary"
              size="large"
              class="submit-btn"
              :loading="loading"
              @click="handleLogin"
            >
              {{ loading ? '登录中...' : '登录系统' }}
            </el-button>
          </el-form-item>
        </el-form>

        <div class="card-links">
          <button type="button" class="forgot-link" @click="forgotVisible = true">忘记密码？</button>
          <router-link to="/register" class="card-meta-link card-meta-link--solo">学生注册</router-link>
        </div>
      </div>

      <footer class="aside-foot login-footer">
        <span>© 龙芯智训平台 · 新星团队出品</span>
        <span class="aside-foot-sub">仅供教学、实训与竞赛演示使用</span>
      </footer>
    </div>

    <el-dialog
      v-model="forgotVisible"
      title="找回密码"
      width="440px"
      class="auth-dialog"
      destroy-on-close
      @open="onForgotOpen"
    >
      <el-form :model="forgotForm" label-width="88px" class="login-form">
        <el-form-item label="用户名" required>
          <el-input v-model="forgotForm.username" autocomplete="username" />
        </el-form-item>
        <el-form-item label="绑定邮箱" required>
          <el-input
            v-model="forgotForm.email"
            type="email"
            autocomplete="email"
            placeholder="账号注册时绑定的邮箱"
          />
        </el-form-item>
        <p class="forgot-hint">系统将校验用户名与邮箱是否匹配，并向该邮箱发送重置链接（15 分钟内有效）。</p>
      </el-form>
      <template #footer>
        <el-button @click="forgotVisible = false">取消</el-button>
        <el-button type="primary" :loading="forgotLoading" @click="sendResetEmail">发送重置邮件</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  User,
  Lock,
  Refresh,
  Cpu,
  Connection,
  Share,
  Reading,
} from '@element-plus/icons-vue'
import AppLogoIcon from '../components/AppLogoIcon.vue'
import LoginHeroGraphic from '../components/login/LoginHeroGraphic.vue'
import { useUserStore } from '../stores/user'
import { getCaptcha, forgotPassword } from '../api/auth'
import { ElMessage, ElMessageBox } from 'element-plus'
import { onLoginTabEvent, LOGIN_WINDOW_NAME } from '../utils/authTabSync'
import { consumeAuthLogoutNotice, resetAuthSessionHandler } from '../utils/authSessionHandler'
import { AUTH_TOAST_DURATION_MS } from '../utils/authLogout'
import '../styles/auth-pages.css'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()
const loading = ref(false)
const captchaImage = ref('')
const captchaId = ref('')
const captchaLoadHint = ref('加载中')
const forgotVisible = ref(false)
const forgotLoading = ref(false)

const featureItems = [
  {
    key: 'llm',
    icon: Cpu,
    title: '大模型智能评测',
    desc: '支持文本、代码、文档与图片成果解析，自动完成 AI 批改、评语生成与质量核查。',
  },
  {
    key: 'kg',
    icon: Connection,
    title: '知识图谱学情分析',
    desc: '基于任务、知识点与学生表现构建学习图谱，辅助识别薄弱点、错因与成长路径。',
  },
  {
    key: 'rag',
    icon: Reading,
    title: 'RAG 知识库 + 运行检查',
    desc: '结合课程知识库辅助评阅，支持代码运行结果校验、图像识别与多附件成果分析。',
  },
  {
    key: 'collab',
    icon: Share,
    title: '校企协同多维评价',
    desc: '支持教师、企业导师与管理员协同评价，统一教学要求与岗位标准，形成可追踪闭环。',
  },
]

const form = reactive({
  username: '',
  password: '',
  captchaCode: '',
})

const forgotForm = reactive({
  username: '',
  email: '',
})

function isNetworkError(err) {
  if (!err) return false
  if (err.code === 'ECONNABORTED' || err.code === 'ERR_NETWORK') return true
  const msg = String(err.message || '')
  if (/network error/i.test(msg)) return true
  return !err.response
}

function resolveCaptchaErrorMessage(err) {
  if (isNetworkError(err)) {
    return '验证码加载失败，请点击刷新重试。'
  }
  const msg = String(err?.response?.data?.message || err?.message || '').trim()
  if (msg && !/network error/i.test(msg)) {
    return msg
  }
  return '验证码加载失败，请点击刷新重试。'
}

function resolveLoginErrorMessage(err) {
  if (isNetworkError(err)) {
    return '登录服务暂时不可用，请检查网络或联系管理员。'
  }
  const msg = String(err?.response?.data?.message || '').trim()
  const code = err?.response?.data?.code
  if (code === 'CAPTCHA' || /验证码/.test(msg)) {
    return '图形验证码错误或已过期，请重新获取。'
  }
  if (code === 'IDENTIFIER_CONFLICT' || /账号标识存在冲突/.test(msg)) {
    return '账号标识存在冲突，请使用用户名登录或联系管理员处理。'
  }
  if (err?.response?.status === 401 || /账号|用户名|密码/.test(msg)) {
    return '账号或密码错误，请重新输入。'
  }
  if (msg && !/network error/i.test(msg)) {
    return msg
  }
  return '登录失败，请稍后重试。'
}

const refreshCaptcha = async () => {
  captchaLoadHint.value = '加载中'
  try {
    const res = await getCaptcha()
    if (res.success) {
      captchaId.value = res.captchaId
      captchaImage.value = res.imageBase64
      form.captchaCode = ''
      captchaLoadHint.value = '加载中'
    } else {
      captchaLoadHint.value = '加载失败'
      ElMessage.error('验证码加载失败，请点击刷新重试。')
    }
  } catch (e) {
    captchaLoadHint.value = '加载失败'
    ElMessage.error(resolveCaptchaErrorMessage(e))
  }
}

const onForgotOpen = () => {
  if (form.username) {
    forgotForm.username = form.username
  }
}

const sendResetEmail = async () => {
  const username = forgotForm.username.trim()
  const email = forgotForm.email.trim()
  if (!username || !email) {
    ElMessage.error('请填写用户名和绑定邮箱')
    return
  }
  forgotLoading.value = true
  try {
    const res = await forgotPassword(username, email)
    if (res.success) {
      forgotVisible.value = false
      await ElMessageBox.alert(
        res.message || '重置邮件已发送，请前往邮箱查收并按链接完成重置（15 分钟内有效）。',
        '邮件已发送',
        { type: 'success', confirmButtonText: '我知道了' }
      )
    } else {
      ElMessage.error(res.message || '发送失败')
    }
  } catch (e) {
    const msg = isNetworkError(e)
      ? '邮件服务暂时不可用，请检查网络或联系管理员。'
      : e?.response?.data?.message || '发送失败，请稍后重试'
    ElMessage.error(msg)
  } finally {
    forgotLoading.value = false
  }
}

const handleLogin = async () => {
  if (!form.username || !form.password) {
    ElMessage.warning('请输入账号和密码')
    return
  }
  if (!form.captchaCode || !/^\d{4}$/.test(form.captchaCode.trim())) {
    ElMessage.warning('请输入 4 位图形验证码')
    return
  }
  if (!captchaId.value) {
    ElMessage.warning('验证码未加载，请点击刷新')
    await refreshCaptcha()
    return
  }
  loading.value = true
  try {
    const success = await userStore.login(
      form.username,
      form.password,
      captchaId.value,
      form.captchaCode.trim()
    )
    if (success) {
      ElMessage.success({ message: '登录成功', duration: AUTH_TOAST_DURATION_MS })
      const role = userStore.user?.role
      if (userStore.user?.mustChangePassword) {
        if (role === 'teacher') {
          router.push('/teacher/change-initial-password')
          return
        }
        if (role === 'student') {
          router.push('/student/change-initial-password')
          return
        }
      }
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
      ElMessage.error('账号或密码错误，请重新输入。')
      await refreshCaptcha()
    }
  } catch (e) {
    ElMessage.error(resolveLoginErrorMessage(e))
    await refreshCaptcha()
  } finally {
    loading.value = false
  }
}

let offTabSync = null

onMounted(() => {
  resetAuthSessionHandler()
  const notice = consumeAuthLogoutNotice()
  if (notice?.message) {
    ElMessage.warning(notice.message)
  }
  if (!window.name) {
    window.name = LOGIN_WINDOW_NAME
  }
  refreshCaptcha()
  if (route.query.reset === 'success') {
    ElMessage.success('密码已重置，请使用新密码登录')
    router.replace({ path: '/login' })
  }
  offTabSync = onLoginTabEvent((data) => {
    if (data?.type === 'password-reset-success' || data?.type === 'focus-login-tab') {
      window.focus()
      ElMessage.success(data.message || '密码已重置，请使用新密码登录')
      refreshCaptcha()
    }
  })
})

onUnmounted(() => {
  if (offTabSync) offTabSync()
})
</script>

<style scoped>
/* —— 登录页最终版：仅 .login-page 生效，不影响注册页 —— */

.login-page .login-left {
  position: relative;
  overflow: hidden;
  background-color: #060e20;
  background-image:
    radial-gradient(ellipse 55% 45% at 12% 18%, rgba(37, 99, 235, 0.16) 0%, transparent 58%),
    radial-gradient(ellipse 40% 35% at 78% 82%, rgba(34, 211, 238, 0.12) 0%, transparent 55%),
    linear-gradient(165deg, #060e20 0%, #0a1628 48%, #0d1a30 100%);
}

.login-page .hero-grid {
  background-size: 40px 40px;
  background-image:
    linear-gradient(rgba(148, 163, 184, 0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(148, 163, 184, 0.04) 1px, transparent 1px);
  opacity: 0.9;
}

.login-page .hero-glow-blue {
  position: absolute;
  width: 420px;
  height: 420px;
  top: -80px;
  left: -60px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(37, 99, 235, 0.16) 0%, transparent 68%);
  pointer-events: none;
}

.login-page .hero-glow-cyan {
  position: absolute;
  width: 360px;
  height: 360px;
  bottom: 8%;
  right: 18%;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(34, 211, 238, 0.12) 0%, transparent 70%);
  pointer-events: none;
}

.login-page .hero-perspective {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 38%;
  pointer-events: none;
  background:
    linear-gradient(rgba(34, 211, 238, 0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(37, 99, 235, 0.04) 1px, transparent 1px);
  background-size: 56px 28px;
  transform: perspective(480px) rotateX(58deg);
  transform-origin: center bottom;
  opacity: 0.35;
  mask-image: linear-gradient(to top, rgba(0, 0, 0, 0.5), transparent 85%);
}

.login-page .hero-content {
  max-width: none;
  width: 100%;
  padding-top: 40px;
  z-index: 2;
}

.login-page .hero-tag {
  display: inline-flex;
  align-items: center;
  padding: 7px 16px;
  margin-bottom: 22px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.03em;
  color: rgba(147, 197, 253, 0.95);
  background: rgba(15, 35, 75, 0.55);
  border: 1px solid rgba(59, 130, 246, 0.35);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.login-page .hero-main {
  margin-bottom: 28px;
}

.login-page .hero-copy {
  position: relative;
  z-index: 2;
  max-width: min(520px, 58%);
}

.login-page .hero-title {
  margin: 0 0 18px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.login-page .hero-title-line {
  display: block;
  line-height: 1.2;
  letter-spacing: 0.02em;
}

.login-page .hero-title-line--white {
  font-size: clamp(2.5rem, 4.8vw, 3.35rem);
  font-weight: 800;
  color: #ffffff;
}

.login-page .hero-title-line--gradient {
  font-size: clamp(1.25rem, 2.2vw, 1.75rem);
  font-weight: 800;
  line-height: 1.35;
  background: linear-gradient(92deg, #60a5fa 0%, #38bdf8 48%, #22d3ee 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.login-page .hero-desc {
  margin: 0;
  font-size: clamp(13px, 1.2vw, 14.5px);
  line-height: 1.78;
  color: rgba(186, 203, 226, 0.72);
  max-width: 100%;
}

.login-page .hero-em {
  color: rgba(186, 230, 253, 0.95);
  font-weight: 600;
}

.login-page .hero-graphic {
  position: absolute;
  top: 6%;
  right: -6%;
  width: min(62%, 560px);
  max-width: 560px;
  z-index: 1;
  pointer-events: none;
  opacity: 0.9;
  -webkit-mask-image: radial-gradient(
    ellipse 92% 86% at 56% 40%,
    #000 18%,
    rgba(0, 0, 0, 0.72) 42%,
    rgba(0, 0, 0, 0.28) 62%,
    transparent 78%
  );
  mask-image: radial-gradient(
    ellipse 92% 86% at 56% 40%,
    #000 18%,
    rgba(0, 0, 0, 0.72) 42%,
    rgba(0, 0, 0, 0.28) 62%,
    transparent 78%
  );
}

/* 2×2 能力卡片 */
.login-page .feature-grid {
  position: relative;
  z-index: 2;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 22px;
}

.login-page .feature-grid .hero-feature {
  align-items: flex-start;
  min-height: 108px;
  padding: 14px 16px;
  border-radius: 14px;
  background: rgba(8, 22, 48, 0.55);
  border: 1px solid rgba(59, 130, 246, 0.18);
  box-shadow: 0 4px 16px rgba(6, 14, 32, 0.2);
}

.login-page .feature-grid .hero-feature:hover {
  background: rgba(12, 32, 68, 0.65);
  border-color: rgba(96, 165, 250, 0.32);
}

.login-page .feature-grid .hero-feature-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  font-size: 18px;
  color: #7dd3fc;
  background: rgba(37, 99, 235, 0.12);
  border: 1px solid rgba(59, 130, 246, 0.25);
}

.login-page .feature-grid .hero-feature-title {
  font-size: 13px;
  margin-bottom: 6px;
}

.login-page .feature-grid .hero-feature-text {
  font-size: 12px;
  line-height: 1.55;
  color: rgba(186, 203, 226, 0.62);
}

/* 右侧 */
.login-page .login-right {
  position: relative;
  overflow: visible;
  background:
    radial-gradient(circle at 20% 50%, rgba(37, 99, 235, 0.06), transparent 34%),
    linear-gradient(180deg, #f7f9fc 0%, #eef2f7 100%);
}

.login-page .login-card {
  position: relative;
  z-index: 2;
  max-width: 480px;
  border-radius: 16px;
  box-shadow:
    0 1px 2px rgba(15, 23, 42, 0.04),
    0 12px 32px rgba(15, 23, 42, 0.08),
    0 24px 48px rgba(15, 23, 42, 0.04);
}

.login-page .login-page-form :deep(.el-input__wrapper.is-focus) {
  box-shadow:
    0 0 0 1px #2563eb inset,
    0 0 0 3px rgba(37, 99, 235, 0.12);
}

.login-page .login-footer {
  position: relative;
  z-index: 2;
}

/* 取消旧 footnote 绝对定位 */
.login-page.login-shell:not(.login-shell--register) .login-hero {
  padding-bottom: clamp(48px, 5vw, 72px);
}

.login-page.login-shell:not(.login-shell--register) .hero-footnote {
  display: none;
}

/* 响应式 */
@media (min-width: 961px) and (max-width: 1440px) {
  .login-page .hero-graphic {
    top: 8%;
    right: -8%;
    width: min(58%, 480px);
  }
}

@media (max-width: 1100px) {
  .login-page .hero-copy {
    max-width: none;
  }
}

@media (max-width: 900px) {
  .login-page .feature-grid {
    display: none;
  }
}

@media (max-width: 960px) {
  .login-page .hero-main {
    flex-direction: column;
  }
}

/* 验证码行 */
.captcha-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.captcha-input {
  flex: 1;
  min-width: 0;
}

.captcha-input :deep(.el-input__wrapper) {
  min-height: 44px;
}

.captcha-img-btn {
  flex-shrink: 0;
  padding: 0;
  border: 1px solid #e5e6eb;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  overflow: hidden;
  height: 44px;
  width: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.2s ease, background-color 0.2s ease;
}

.captcha-img-btn:hover {
  border-color: #94bfff;
  background: #f7f8fa;
}

.captcha-img {
  display: block;
  width: 120px;
  height: 44px;
  object-fit: cover;
}

.captcha-loading {
  font-size: 12px;
  color: #86909c;
}

.captcha-refresh-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 44px;
  padding: 0 14px;
  border: 1px solid #e5e6eb;
  border-radius: 8px;
  background: #fff;
  font-size: 14px;
  font-weight: 500;
  color: #1d2129;
  cursor: pointer;
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.captcha-refresh-btn:hover {
  background: #f0f5ff;
  border-color: #94bfff;
  color: #165dff;
}

.captcha-refresh-btn .el-icon {
  font-size: 16px;
  color: inherit;
}

</style>
