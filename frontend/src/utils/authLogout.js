import { ElMessage } from 'element-plus'
import { useUserStore } from '../stores/user'

/** 登录/退出等鉴权相关提示的统一展示时长（毫秒） */
export const AUTH_TOAST_DURATION_MS = 1500

/**
 * 清除本地会话并跳转登录页（须先 logout 再导航，避免路由守卫因仍 isLoggedIn 而拦回工作台）
 */
export async function logoutAndGoLogin(router, { message = '已退出登录', showToast = true } = {}) {
  const userStore = useUserStore()
  await userStore.logout()
  await router.replace('/login')
  if (showToast) {
    ElMessage.success({ message, duration: AUTH_TOAST_DURATION_MS })
  }
}
