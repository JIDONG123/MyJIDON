<template>
  <div class="exam-monitor">
    <header class="exam-monitor-head">
      <el-button text type="primary" class="back-btn" @click="goBack">
        <span class="back-ico">←</span> 返回考试列表
      </el-button>
      <div class="head-main">
        <h1 class="title">考试监考</h1>
        <p class="sub">Socket 实时：切屏记录 · 与列表「距考试结束」同一服务端时钟</p>
      </div>
      <div class="head-meta">
        <el-tag v-if="examTitle" type="info" effect="plain">{{ examTitle }}</el-tag>
        <el-tag v-if="hallRemainLabel" type="warning" effect="plain">场次剩余 {{ hallRemainLabel }}</el-tag>
      </div>
    </header>

    <el-alert
      v-if="!examId"
      type="warning"
      show-icon
      :closable="false"
      title="缺少考试 ID，请从在线考试列表点击「监考」进入。"
      class="mb16"
    />

    <el-row v-else :gutter="16">
      <el-col :xs="24" :md="10">
        <el-card shadow="never" class="panel">
          <template #header><span class="panel-title">实时切屏</span></template>
          <el-empty v-if="!tabLogs.length" description="暂无记录；学生切换窗口/最小化后将出现在此" />
          <el-timeline v-else class="timeline">
            <el-timeline-item
              v-for="(it, idx) in tabLogs"
              :key="idx"
              :timestamp="it.timeLabel"
              placement="top"
              :type="it.autoSubmitted ? 'danger' : 'warning'"
            >
              <div class="log-line">
                <strong>{{ it.displayName }}</strong>
                <span class="muted">切屏累计</span>
                <el-tag size="small" type="danger" effect="plain">{{ it.tabCount }} 次</el-tag>
                <span v-if="it.autoSubmitted" class="warn-text">已触发自动交卷</span>
              </div>
            </el-timeline-item>
          </el-timeline>
        </el-card>
      </el-col>
      <el-col :xs="24" :md="14">
        <el-card shadow="never" class="panel">
          <template #header><span class="panel-title">学生最近次数（合并自日志）</span></template>
          <el-table :data="tabSummaryRows" size="small" border stripe empty-text="暂无数据">
            <el-table-column prop="displayName" label="学生" min-width="120" />
            <el-table-column prop="tabCount" label="切屏次数" width="100" align="center" />
            <el-table-column prop="lastAt" label="最近时间" min-width="168" />
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getRealtimeSocket } from '../../socket/realtimeClient'
import { getExamTeacher } from '../../api/qb'
import { formatDateTime } from '../../utils/format'

const route = useRoute()
const router = useRouter()

const classId = computed(() => {
  const q = Number(route.query.classId)
  return Number.isFinite(q) && q > 0 ? q : null
})
const teachingClassId = computed(() => {
  const q = Number(route.query.teachingClassId)
  return Number.isFinite(q) && q > 0 ? q : null
})
const examId = computed(() => {
  const n = Number(route.params.examId)
  return Number.isFinite(n) && n > 0 ? n : null
})

const examTitle = ref('')
const tabLogs = ref([])
const hallRemainLabel = ref('—')
let serverSkewMs = 0
let examEndMs = 0
const nowTick = ref(Date.now())
let tickTimer = null

const tabSummaryRows = computed(() => {
  const m = new Map()
  for (const it of tabLogs.value) {
    const key = String(it.studentId)
    const prev = m.get(key)
    if (!prev || new Date(it.at).getTime() >= new Date(prev.rawAt).getTime()) {
      m.set(key, {
        studentId: it.studentId,
        displayName: it.displayName,
        tabCount: it.tabCount,
        lastAt: it.timeLabel,
        rawAt: it.at,
      })
    }
  }
  return [...m.values()].sort((a, b) => b.tabCount - a.tabCount)
})

function formatRemain(ms) {
  if (ms == null || !Number.isFinite(ms)) return '—'
  if (ms <= 0) return '00:00'
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function attachSocket() {
  const sock = getRealtimeSocket()
  if (!sock || !examId.value) return
  sock.emit(
    'join_exam_live',
    { mode: 'monitor', examId: examId.value },
    (ack) => {
      if (ack && ack.ok && ack.examEndMs) {
        examEndMs = Number(ack.examEndMs)
      }
    }
  )

  const onTick = (p) => {
    if (!p || p.serverNowMs == null || p.examEndMs == null) return
    serverSkewMs = p.serverNowMs - Date.now()
    examEndMs = Number(p.examEndMs)
    const rem = Math.max(0, examEndMs - p.serverNowMs)
    hallRemainLabel.value = formatRemain(rem)
  }
  const onTab = (p) => {
    if (!p) return
    tabLogs.value.unshift({
      studentId: p.studentId,
      displayName: p.displayName || '学生',
      tabCount: p.tabCount,
      at: p.at,
      timeLabel: formatDateTime(p.at),
      autoSubmitted: !!p.autoSubmitted,
    })
    if (tabLogs.value.length > 200) tabLogs.value.pop()
  }
  sock.on('exam_tick', onTick)
  sock.on('exam_monitor_tab', onTab)
  return () => {
    sock.off('exam_tick', onTick)
    sock.off('exam_monitor_tab', onTab)
    sock.emit('leave_exam_live', {})
  }
}

let detachSocket = null

const goBack = () => {
  const q = {}
  if (teachingClassId.value) q.teachingClassId = teachingClassId.value
  else if (classId.value) q.classId = classId.value
  router.push(Object.keys(q).length ? { path: '/teacher/qbank/exams', query: q } : '/teacher/qbank/exams')
}

const loadTitle = async () => {
  if (!examId.value) return
  try {
    const res = await getExamTeacher(examId.value)
    if (res.success && res.data?.exam) {
      examTitle.value = res.data.exam.title || `考试 #${examId.value}`
    }
  } catch {
    examTitle.value = `考试 #${examId.value}`
  }
}

onMounted(async () => {
  await loadTitle()
  tickTimer = setInterval(() => {
    nowTick.value = Date.now()
    if (examEndMs) {
      const rem = Math.max(0, examEndMs - (Date.now() + serverSkewMs))
      hallRemainLabel.value = formatRemain(rem)
    }
  }, 1000)
  detachSocket = attachSocket()
})

onUnmounted(() => {
  if (tickTimer) clearInterval(tickTimer)
  if (typeof detachSocket === 'function') detachSocket()
})

watch(
  () => examId.value,
  async () => {
    if (typeof detachSocket === 'function') detachSocket()
    detachSocket = null
    tabLogs.value = []
    hallRemainLabel.value = '—'
    await loadTitle()
    detachSocket = attachSocket()
  }
)
</script>

<style scoped>
.exam-monitor {
  max-width: 1100px;
  margin: 0 auto;
}
.exam-monitor-head {
  margin-bottom: 20px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--sg-border, #ebeef5);
}
.back-btn {
  padding: 0;
  margin-bottom: 10px;
}
.back-ico {
  margin-right: 4px;
}
.title {
  margin: 0 0 6px;
  font-size: 22px;
  font-weight: 700;
}
.sub {
  margin: 0;
  font-size: 13px;
  color: var(--sg-text-secondary);
  line-height: 1.5;
}
.head-meta {
  margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.panel {
  border-radius: 12px;
  margin-bottom: 16px;
}
.panel-title {
  font-weight: 600;
}
.mb16 {
  margin-bottom: 16px;
}
.timeline {
  max-height: 520px;
  overflow: auto;
}
.log-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}
.muted {
  color: var(--sg-text-secondary);
  font-size: 13px;
}
.warn-text {
  color: var(--el-color-danger);
  font-size: 13px;
  font-weight: 600;
}
</style>
