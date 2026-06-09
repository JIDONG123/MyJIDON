<template>
  <div class="pwd-cell">
    <span class="pwd-mask">{{ maskText }}</span>
    <el-button link type="primary" size="small" @click="openView">查看密码</el-button>
  </div>

  <el-dialog v-model="visible" title="登录密码" width="420px" destroy-on-close append-to-body>
    <p class="pwd-dialog-user">
      <strong>{{ displayName }}</strong>
      <span class="muted">（@{{ username }}）</span>
    </p>
    <div class="pwd-dialog-value">
      <code>{{ plainPassword || '未记录' }}</code>
    </div>
    <p v-if="!plainPassword" class="pwd-dialog-hint">
      该账号创建于明文备份功能上线前，请通过「编辑」重置密码后即可查看。
    </p>
    <template #footer>
      <el-button type="primary" @click="visible = false">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { getAdminUserPassword } from '../api/user'

const props = defineProps({
  userId: { type: [Number, String], required: true },
  username: { type: String, default: '' },
  realName: { type: String, default: '' },
  /** 列表预载的明文（可选，减少请求） */
  passwordPlain: { type: String, default: null },
})

const visible = ref(false)
const plainPassword = ref('')
const loading = ref(false)

const displayName = computed(() => props.realName || props.username || '—')
const maskText = computed(() => {
  if (props.passwordPlain) {
    return '*'.repeat(Math.min(Math.max(props.passwordPlain.length, 6), 12))
  }
  return '********'
})

const openView = async () => {
  if (props.passwordPlain) {
    plainPassword.value = props.passwordPlain
    visible.value = true
    return
  }
  loading.value = true
  try {
    const res = await getAdminUserPassword(props.userId)
    if (res.success) {
      plainPassword.value = res.data?.password || ''
      visible.value = true
    } else {
      ElMessage.error(res.message || '获取失败')
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '获取失败')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.pwd-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.pwd-mask {
  font-family: ui-monospace, monospace;
  letter-spacing: 0.12em;
  color: var(--sg-text-secondary);
}

.pwd-dialog-user {
  margin: 0 0 12px;
  font-size: 14px;
}

.pwd-dialog-user .muted {
  color: var(--sg-text-secondary);
  margin-left: 4px;
}

.pwd-dialog-value {
  padding: 14px 16px;
  background: var(--el-fill-color-light);
  border-radius: 8px;
  border: 1px solid var(--el-border-color-lighter);
}

.pwd-dialog-value code {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.06em;
  word-break: break-all;
}

.pwd-dialog-hint {
  margin: 12px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}
</style>
