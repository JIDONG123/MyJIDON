<template>
  <div v-if="jobs.length" class="grading-job-panel" aria-live="polite">
    <div v-for="job in jobs" :key="job.jobId" class="job-card">
      <div class="job-card-head">
        <span class="job-tag">{{ jobScopeLabel(job.scopeType) }}</span>
        <span class="job-status">{{ jobStatusLabel(job.status) }}</span>
      </div>
      <div class="job-title">{{ job.taskTitle || `任务 #${job.jobId}` }}</div>
      <el-progress
        :percentage="job.progress"
        :status="progressStatus(job.status)"
        :stroke-width="8"
        :show-text="true"
      />
      <p class="job-msg">{{ job.message || '后台批改进行中，可继续使用系统' }}</p>
      <p v-if="showWorkerHint(job)" class="job-worker-hint">
        批改任务已入队，但暂未被 Worker 处理，请确认批改 Worker 已启动。
      </p>
      <div class="job-actions">
        <el-button link type="primary" size="small" @click="openDetail(job.jobId)">查看详情</el-button>
        <el-button
          v-if="job.taskId"
          link
          type="primary"
          size="small"
          @click="openSubmissions(job.taskId)"
        >
          成果列表
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { subscribeRt } from '../socket/rtBus'
import { listGradingJobs, getGradingJob, getGradingWorkerHealth } from '../api/gradingJob'
import {
  activeGradingJobs,
  upsertGradingJobFromRt,
  seedGradingJobsFromList,
  jobStatusLabel,
  jobScopeLabel,
  gradingJobProgressState,
} from '../stores/gradingJobProgress'
import { upsertJobFromDetail } from '../utils/gradingJobSubmit'
import { gradingJobDetailLocation } from '../utils/gradingJobNav'

const props = defineProps({
  basePath: { type: String, default: '/teacher' },
})

const route = useRoute()
const router = useRouter()
const jobs = activeGradingJobs
let offRt = null
let pollTimer = null
let workerHealth = null

const ACTIVE = new Set(['pending', 'running'])

function showWorkerHint(job) {
  if (!job || !ACTIVE.has(job.status)) return false
  if (job.runningCount > 0 || (job.finishedCount ?? 0) > 0) return false
  const created = job.createdAt ? new Date(job.createdAt).getTime() : 0
  if (!created) return false
  const stale = Date.now() - created > 60000
  if (!stale) return false
  if (workerHealth && workerHealth.bullmqEnabled && workerHealth.workerLastSeenAt) {
    const seen = new Date(workerHealth.workerLastSeenAt).getTime()
    if (Number.isFinite(seen) && Date.now() - seen < 90000) return false
  }
  return true
}

function progressStatus(status) {
  if (status === 'failed' || status === 'partial_failed') return 'exception'
  if (status === 'completed') return 'success'
  return undefined
}

function openDetail(jobId) {
  router.push(gradingJobDetailLocation(props.basePath, jobId, route))
}

function openSubmissions(taskId) {
  router.push(`${props.basePath}/submissions/${taskId}`)
}

async function pollActiveJobs() {
  const ids = Object.values(gradingJobProgressState.jobs)
    .filter((j) => ACTIVE.has(j.status))
    .map((j) => j.jobId)
  if (!ids.length) return
  await Promise.all(
    ids.map(async (id) => {
      try {
        const res = await getGradingJob(id, { itemPage: 1, itemPageSize: 1 })
        if (res.success && res.data?.job) upsertJobFromDetail(res.data.job)
      } catch {
        /* ignore */
      }
    })
  )
}

async function loadActiveJobs() {
  try {
    const [pending, running, healthRes] = await Promise.all([
      listGradingJobs({ page: 1, pageSize: 10, status: 'pending' }),
      listGradingJobs({ page: 1, pageSize: 10, status: 'running' }),
      getGradingWorkerHealth().catch(() => null),
    ])
    if (healthRes?.success) workerHealth = healthRes.data
    const rows = [...(pending.rows || []), ...(running.rows || [])]
    seedGradingJobsFromList(rows)
  } catch {
    /* ignore */
  }
}

onMounted(() => {
  loadActiveJobs()
  offRt = subscribeRt((payload) => {
    if (payload?.domain !== 'grading_job') return
    upsertGradingJobFromRt(payload)
  })
  pollTimer = window.setInterval(pollActiveJobs, 4000)
})

onUnmounted(() => {
  if (pollTimer) window.clearInterval(pollTimer)
  if (typeof offRt === 'function') offRt()
})
</script>

<style scoped>
.grading-job-panel {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 1200;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 320px;
  pointer-events: none;
}

.job-card {
  pointer-events: auto;
  background: #fff;
  border: 1px solid rgba(148, 163, 184, 0.45);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
  padding: 12px 14px;
}

.job-card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.job-tag {
  font-size: 11px;
  color: var(--sg-primary, #0d9488);
  background: rgba(20, 184, 166, 0.12);
  padding: 2px 8px;
  border-radius: 999px;
}

.job-status {
  font-size: 12px;
  color: var(--sg-text-secondary, #64748b);
}

.job-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--sg-text, #0f172a);
  margin-bottom: 8px;
  line-height: 1.4;
}

.job-msg {
  margin: 8px 0 4px;
  font-size: 12px;
  color: var(--sg-text-secondary, #64748b);
  line-height: 1.45;
}

.job-worker-hint {
  margin: 4px 0 0;
  font-size: 12px;
  color: #b45309;
  line-height: 1.4;
}

.job-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
