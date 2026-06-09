<template>
  <div class="login-shell">
    <div class="login-aside login-aside--solo">
      <div class="login-card">
        <header class="card-head">
          <div class="card-brand">
            <AppLogoIcon :size="44" />
            <div class="card-brand-text">
              <h2 class="card-title">{{ done ? '重置成功' : '重置密码' }}</h2>
              <p class="card-sub">{{ done ? '请返回原登录页使用新密码' : '通过邮件链接设置新密码' }}</p>
            </div>
          </div>
        </header>

        <template v-if="done">
          <el-result icon="success" title="密码已重置" sub-title="原登录标签页已收到通知，请切换回去登录。">
            <template #extra>
              <p class="done-hint">若浏览器未自动关闭本页，可手动关闭此标签页。</p>
              <el-button type="primary" @click="goLoginSameTab">在本页登录</el-button>
            </template>
          </el-result>
        </template>

        <template v-else>
          <el-alert
            v-if="!token"
            type="error"
            show-icon
            :closable="false"
            title="链接无效"
            description="缺少重置令牌，请重新申请找回密码邮件。"
          />

          <el-form v-else :model="form" label-position="top" class="login-form" @keyup.enter="handleSubmit">
            <el-form-item label="新密码" required>
              <el-input
                v-model="form.newPassword"
                type="password"
                show-password
                autocomplete="new-password"
                size="large"
              />
            </el-form-item>
            <el-form-item label="确认新密码" required>
              <el-input
                v-model="form.confirmPassword"
                type="password"
                show-password
                autocomplete="new-password"
                size="large"
              />
            </el-form-item>
            <p class="pwd-hint">{{ passwordHint }}</p>
            <el-form-item class="login-form__submit">
              <el-button type="primary" size="large" class="submit-btn" :loading="loading" @click="handleSubmit">
                {{ loading ? '提交中…' : '确认重置' }}
              </el-button>
            </el-form-item>
          </el-form>

          <div class="card-meta">
            <router-link to="/login" class="card-meta-link">返回登录</router-link>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import AppLogoIcon from '../components/AppLogoIcon.vue'
import { resetPassword } from '../api/auth'
import { PASSWORD_HINT, validatePasswordPlaintext } from '../utils/passwordPolicy'
import { finishPasswordReset } from '../utils/authTabSync'
import '../styles/auth-pages.css'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const done = ref(false)
const passwordHint = PASSWORD_HINT

const token = computed(() => String(route.query.token || '').trim())

const form = reactive({
  newPassword: '',
  confirmPassword: '',
})

const goLoginSameTab = () => {
  router.push('/login?reset=success')
}

const handleSubmit = async () => {
  if (!token.value) {
    ElMessage.error('重置链接无效')
    return
  }
  if (form.newPassword !== form.confirmPassword) {
    ElMessage.error('两次输入的新密码不一致')
    return
  }
  const pv = validatePasswordPlaintext(form.newPassword)
  if (!pv.ok) {
    ElMessage.error(pv.message)
    return
  }
  loading.value = true
  try {
    const res = await resetPassword(token.value, form.newPassword, form.confirmPassword)
    if (res.success) {
      const msg = res.message || '密码已重置，请使用新密码登录'
      finishPasswordReset(msg)
      done.value = true
    } else {
      ElMessage.error(res.message || '重置失败')
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '重置失败，链接可能已过期')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-aside--solo {
  grid-column: 1 / -1;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pwd-hint {
  margin: -8px 0 16px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.done-hint {
  margin: 0 0 16px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
</style>
