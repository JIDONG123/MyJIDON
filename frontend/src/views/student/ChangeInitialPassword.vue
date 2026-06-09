<template>
  <div class="change-pwd-shell">
    <div class="change-pwd-card">
      <header class="card-head">
        <AppLogoIcon :size="40" />
        <div>
          <h1 class="card-title">首次登录 · 修改密码</h1>
          <p class="card-sub">{{ subtitle }}</p>
        </div>
      </header>

      <el-alert
        type="warning"
        :closable="false"
        show-icon
        :title="alertTitle"
        class="pwd-alert"
      />

      <el-form label-position="top" class="pwd-form" @submit.prevent="submit">
        <el-form-item label="当前密码（初始密码）">
          <el-input
            v-model="form.oldPassword"
            type="password"
            show-password
            autocomplete="current-password"
            placeholder="请输入当前密码"
          />
        </el-form-item>
        <el-form-item label="新密码">
          <el-input
            v-model="form.newPassword"
            type="password"
            show-password
            autocomplete="new-password"
            placeholder="至少 6 位，包含字母和数字"
          />
        </el-form-item>
        <el-form-item label="确认新密码">
          <el-input
            v-model="form.confirmPassword"
            type="password"
            show-password
            autocomplete="new-password"
            placeholder="再次输入新密码"
          />
        </el-form-item>
        <p class="pwd-hint">{{ passwordHint }}</p>
        <div class="form-actions">
          <el-button type="primary" :loading="loading" native-type="submit" class="submit-btn">
            确认修改并进入系统
          </el-button>
          <el-button plain @click="handleLogout">退出登录</el-button>
        </div>
      </el-form>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import AppLogoIcon from '../../components/AppLogoIcon.vue'
import { changeInitialPassword } from '../../api/auth'
import { useUserStore } from '../../stores/user'
import { logoutAndGoLogin } from '../../utils/authLogout'
import { PASSWORD_HINT, validatePasswordPlaintext } from '../../utils/passwordPolicy'

const router = useRouter()
const userStore = useUserStore()
const loading = ref(false)
const passwordHint = PASSWORD_HINT

const isTeacher = computed(() => userStore.user?.role === 'teacher')

const subtitle = computed(() =>
  isTeacher.value
    ? '为保障账号安全，请先修改初始密码后再进入教师工作台'
    : '为保障账号安全，请先修改初始密码后再进入学习端'
)

const alertTitle = computed(() =>
  isTeacher.value
    ? '初始密码默认为工号。请设置至少 6 位且包含字母与数字的新密码。'
    : '初始密码默认为学号。请设置至少 6 位且包含字母与数字的新密码。'
)

const homePath = computed(() => (isTeacher.value ? '/teacher/dashboard' : '/student/tasks'))

const form = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
})

const submit = async () => {
  if (!form.oldPassword || !form.newPassword || !form.confirmPassword) {
    ElMessage.error('请完整填写密码信息')
    return
  }
  if (form.newPassword !== form.confirmPassword) {
    ElMessage.error('两次输入的新密码不一致')
    return
  }
  if (form.newPassword === form.oldPassword) {
    ElMessage.error('新密码不能与当前密码相同')
    return
  }
  const pv = validatePasswordPlaintext(form.newPassword)
  if (!pv.ok) {
    ElMessage.error(pv.message)
    return
  }

  loading.value = true
  try {
    const res = await changeInitialPassword(form.oldPassword, form.newPassword, form.confirmPassword)
    if (res.success) {
      userStore.clearMustChangePassword()
      ElMessage.success('密码修改成功')
      router.replace(homePath.value)
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '修改失败')
  } finally {
    loading.value = false
  }
}

const handleLogout = () => {
  logoutAndGoLogin(router)
}
</script>

<style scoped>
.change-pwd-shell {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: #eef2f7;
}

.change-pwd-card {
  width: min(100%, 440px);
  background: #fff;
  border-radius: 12px;
  border: 1px solid #e5e9f0;
  padding: 28px 28px 24px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
}

.card-head {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  margin-bottom: 18px;
}

.card-title {
  margin: 0 0 4px;
  font-size: 20px;
  font-weight: 600;
  color: #1e293b;
}

.card-sub {
  margin: 0;
  font-size: 13px;
  color: #64748b;
  line-height: 1.5;
}

.pwd-alert {
  margin-bottom: 18px;
}

.pwd-form :deep(.el-form-item__label) {
  font-weight: 500;
  color: #334155;
}

.pwd-hint {
  margin: -4px 0 16px;
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.5;
}

.form-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.submit-btn {
  width: 100%;
}
</style>
