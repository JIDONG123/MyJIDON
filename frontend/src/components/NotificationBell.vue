<template>
  <el-dropdown trigger="click" placement="bottom-end" @visible-change="onOpen">
    <span class="bell-wrap" role="button" tabindex="0">
      <el-badge :value="unread" :hidden="!unread" :max="99" class="bell-badge">
        <el-icon :size="22" class="bell-icon"><Bell /></el-icon>
      </el-badge>
    </span>
    <template #dropdown>
      <div class="notify-panel">
        <div class="notify-head">
          <span>站内消息</span>
          <el-button link type="primary" size="small" @click="markAll">全部已读</el-button>
        </div>
        <el-scrollbar max-height="320px">
          <div v-if="loading" class="notify-loading">加载中…</div>
          <div v-else-if="!items.length" class="notify-empty">暂无消息</div>
          <button
            v-for="n in items"
            :key="n.id"
            type="button"
            class="notify-item"
            :class="{ unread: !n.is_read }"
            @click="openOne(n)"
          >
            <div class="notify-title">{{ n.title }}</div>
            <div v-if="n.body" class="notify-body">{{ n.body }}</div>
            <div class="notify-time">{{ formatDateTime(n.created_at) }}</div>
          </button>
        </el-scrollbar>
      </div>
    </template>
  </el-dropdown>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { Bell } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import {
  listNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
} from '../api/notification'
import { formatDateTime } from '../utils/format'
import { subscribeRt } from '../socket/rtBus'

const props = defineProps({
  role: { type: String, default: 'student' },
})

const router = useRouter()
const unread = ref(0)
const items = ref([])
const loading = ref(false)
let timer = null
let offRt = null

async function refreshUnread() {
  try {
    const res = await getUnreadNotificationCount()
    if (res.success) unread.value = Number(res.count) || 0
  } catch (_) {
    unread.value = 0
  }
}

async function loadList() {
  loading.value = true
  try {
    const res = await listNotifications({ page: 1, pageSize: 30 })
    if (res.success) items.value = res.data || []
  } catch (_) {
    items.value = []
  } finally {
    loading.value = false
  }
}

function onOpen(v) {
  if (v) loadList()
}

async function markAll() {
  try {
    await markAllNotificationsRead()
    await refreshUnread()
    await loadList()
    ElMessage.success('已标记全部已读')
  } catch (_) {
    ElMessage.error('操作失败')
  }
}

async function openOne(n) {
  try {
    if (!n.is_read) {
      await markNotificationRead(n.id)
      await refreshUnread()
      n.is_read = 1
    }
  } catch (_) {}
  const rid = n.ref_id
  if (props.role === 'teacher') {
    if (n.ref_type === 'submission' && rid) {
      router.push(`/teacher/grading/${rid}`)
    } else if (n.ref_type === 'task' && rid) {
      router.push(`/teacher/submissions/${rid}`)
    }
    return
  }
  if (n.ref_type === 'task' && rid) {
    router.push(`/student/tasks/${rid}`)
  } else if (n.ref_type === 'submission' && rid) {
    router.push('/student/results')
  }
}

onMounted(() => {
  refreshUnread()
  timer = setInterval(refreshUnread, 45000)
  offRt = subscribeRt((payload) => {
    if (payload?.domain === 'notifications') {
      refreshUnread()
      loadList()
    }
  })
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
  if (typeof offRt === 'function') offRt()
})
</script>

<style scoped>
.bell-wrap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 4px;
  border-radius: 8px;
  color: var(--sg-text-secondary);
  transition: background 0.2s ease, color 0.2s ease;
}

.bell-wrap:hover {
  background: rgba(20, 184, 166, 0.12);
  color: var(--sg-primary);
}

.bell-icon {
  vertical-align: middle;
}

.notify-panel {
  width: 320px;
  padding: 0 0 8px;
}

.notify-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px 6px;
  font-size: 14px;
  font-weight: 600;
  border-bottom: 1px solid var(--sg-border);
}

.notify-loading,
.notify-empty {
  padding: 24px;
  text-align: center;
  color: var(--sg-text-secondary);
  font-size: 13px;
}

.notify-item {
  display: block;
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  padding: 10px 12px;
  cursor: pointer;
  border-bottom: 1px solid rgba(148, 163, 184, 0.25);
}

.notify-item:hover {
  background: rgba(241, 245, 249, 0.9);
}

.notify-item.unread {
  background: rgba(224, 242, 254, 0.55);
}

.notify-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--sg-text);
  margin-bottom: 4px;
}

.notify-body {
  font-size: 12px;
  color: var(--sg-text-secondary);
  line-height: 1.45;
  margin-bottom: 6px;
}

.notify-time {
  font-size: 11px;
  color: var(--sg-text-placeholder);
}
</style>
