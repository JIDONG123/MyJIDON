<template>
  <div class="page-dashboard">
    <header class="page-head">
      <div>
        <h1 class="page-title">数据概览</h1>
        <p class="page-desc">全局数字一览；按班级管理学生与任务请使用侧栏「班级管理」。</p>
      </div>
    </header>

    <el-skeleton v-if="loading" animated :rows="4" class="sk-main" />

    <div v-else class="dashboard-body">
      <el-row :gutter="20" class="stat-cards">
        <el-col :xs="24" :sm="12" :lg="6">
          <div class="metric-card metric-card--stat metric-card--accent-slate">
            <div class="metric-card__row">
              <div class="metric-icon-wrap" aria-hidden="true">
                <el-icon class="metric-icon"><OfficeBuilding /></el-icon>
              </div>
              <div class="metric-card__text">
                <span class="metric-value">{{ overview.length }}</span>
                <span class="metric-label">负责班级</span>
              </div>
            </div>
          </div>
        </el-col>
        <el-col :xs="24" :sm="12" :lg="6">
          <div class="metric-card metric-card--stat metric-card--accent-teal">
            <div class="metric-card__row">
              <div class="metric-icon-wrap" aria-hidden="true">
                <el-icon class="metric-icon"><User /></el-icon>
              </div>
              <div class="metric-card__text">
                <span class="metric-value">{{ totalStudents }}</span>
                <span class="metric-label">学生总数</span>
              </div>
            </div>
          </div>
        </el-col>
        <el-col :xs="24" :sm="12" :lg="6">
          <div class="metric-card metric-card--stat metric-card--accent-indigo">
            <div class="metric-card__row">
              <div class="metric-icon-wrap" aria-hidden="true">
                <el-icon class="metric-icon"><Document /></el-icon>
              </div>
              <div class="metric-card__text">
                <span class="metric-value">{{ totalTasks }}</span>
                <span class="metric-label">已发布任务</span>
              </div>
            </div>
          </div>
        </el-col>
        <el-col :xs="24" :sm="12" :lg="6">
          <div class="metric-card metric-card--cta">
            <el-button type="primary" size="large" class="cta-btn" @click="$router.push('/teacher/classes')">
              <el-icon class="cta-btn__icon"><Right /></el-icon>
              进入班级管理
            </el-button>
            <span class="metric-hint">按班级查看学生与任务</span>
          </div>
        </el-col>
      </el-row>

      <el-card v-if="recentTasks.length" class="panel-card" shadow="never">
        <template #header>
          <div class="panel-header">
            <div class="panel-header__left">
              <span class="panel-title">最近任务</span>
              <span class="panel-sub">本人发布 · 最多 5 条</span>
            </div>
          </div>
        </template>
        <div class="table-wrap">
          <el-table :data="recentTasks" class="tasks-table" stripe>
            <el-table-column prop="title" label="任务" min-width="168" show-overflow-tooltip>
              <template #default="{ row }">
                <span class="cell-task-title">{{ row.title }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="class_name" label="班级" min-width="120">
              <template #default="{ row }">
                <span class="cell-muted">{{ row.class_name || '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="完成进度" min-width="200" align="left">
              <template #default="{ row }">
                <div class="progress-cell">
                  <el-progress
                    :percentage="progressPercent(row)"
                    :stroke-width="10"
                    :show-text="false"
                    color="var(--sg-primary, #1677ff)"
                    class="progress-bar"
                  />
                  <span class="progress-caption">
                    {{ row.submittedStudentCount ?? 0 }} / {{ row.classStudentCount ?? '—' }} 已提交
                  </span>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="截止" min-width="200">
              <template #default="{ row }">
                <div class="deadline-cell">
                  <el-tag
                    :type="deadlineMeta(row.deadline).tagType"
                    effect="light"
                    size="small"
                    class="deadline-tag"
                  >
                    {{ deadlineMeta(row.deadline).statusText }}
                  </el-tag>
                  <span class="deadline-time">{{ formatDateTime(row.deadline) }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="132" align="right">
              <template #default="{ row }">
                <el-button
                  link
                  type="primary"
                  class="action-link"
                  @click="$router.push(`/teacher/submissions/${row.id}`)"
                >
                  <el-icon class="action-link__icon"><List /></el-icon>
                  提交列表
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-card>

      <el-card v-else class="empty-panel" shadow="never">
        <el-empty description="">
          <template #image>
            <div class="empty-illus" aria-hidden="true">
              <el-icon class="empty-illus__icon"><Document /></el-icon>
            </div>
          </template>
          <template #description>
            <p class="empty-title">暂无最近任务</p>
            <p class="empty-desc">您还没有发布任务，或任务列表为空。请在侧栏进入「班级管理」，选择班级后发布实训任务。</p>
          </template>
          <el-button type="primary" @click="$router.push('/teacher/classes')">
            <el-icon class="cta-btn__icon"><Right /></el-icon>
            前往班级管理
          </el-button>
        </el-empty>
      </el-card>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { OfficeBuilding, User, Document, Right, List } from '@element-plus/icons-vue'
import { getMyTeachingOverview } from '../../api/class'
import { getAllTasks } from '../../api/task'
import { formatDateTime } from '../../utils/format'

const loading = ref(true)
const overview = ref([])
const recentTasks = ref([])

const totalStudents = computed(() => overview.value.reduce((s, c) => s + (Number(c.studentCount) || 0), 0))
const totalTasks = computed(() => overview.value.reduce((s, c) => s + (Number(c.taskCount) || 0), 0))

function progressPercent(row) {
  const total = Number(row.classStudentCount)
  const sub = Number(row.submittedStudentCount ?? 0)
  if (!Number.isFinite(total) || total <= 0) return 0
  return Math.min(100, Math.round((sub / total) * 100))
}

/** 进行中=绿色 success；已截止=红色 danger */
function deadlineMeta(deadline) {
  if (!deadline) {
    return { statusText: '未设置', tagType: 'info' }
  }
  const d = new Date(deadline)
  if (Number.isNaN(d.getTime())) {
    return { statusText: '—', tagType: 'info' }
  }
  if (Date.now() > d.getTime()) {
    return { statusText: '已截止', tagType: 'danger' }
  }
  return { statusText: '进行中', tagType: 'success' }
}

const loadOverview = async () => {
  const res = await getMyTeachingOverview()
  if (res.success) overview.value = res.data || []
}

const loadRecentTasks = async () => {
  const res = await getAllTasks()
  if (res.success) recentTasks.value = (res.data || []).slice(0, 5)
}

onMounted(async () => {
  loading.value = true
  try {
    await Promise.all([loadOverview(), loadRecentTasks()])
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.page-dashboard {
  max-width: 1280px;
  margin: 0 auto;
  padding: 8px 4px 32px;
  animation: dash-enter 0.5s ease-out both;
}

@keyframes dash-enter {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.page-head {
  margin-bottom: 28px;
  padding: 0 4px;
}

.page-title {
  margin: 0 0 10px;
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--sg-text, #0f172a);
  line-height: 1.25;
}

.page-desc {
  margin: 0;
  max-width: 52rem;
  font-size: 13px;
  line-height: 1.65;
  font-weight: 400;
  color: var(--sg-text-secondary, #64748b);
  opacity: 0.92;
}

.sk-main {
  padding: 16px 4px;
}

.dashboard-body {
  padding: 0 4px;
}

.stat-cards {
  margin-bottom: 28px;
}

.metric-card {
  position: relative;
  border-radius: 14px;
  min-height: 108px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  transition:
    transform 0.22s ease,
    box-shadow 0.22s ease;
}

.metric-card--stat {
  padding: 20px 20px 18px;
  background: linear-gradient(145deg, #ffffff 0%, #f8fafc 100%);
  border: 1px solid rgba(148, 163, 184, 0.22);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 24px rgba(15, 76, 129, 0.06);
}

.metric-card--stat:hover {
  transform: translateY(-3px);
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08), 0 16px 40px rgba(15, 76, 129, 0.1);
}

.metric-card__row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.metric-icon-wrap {
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.metric-card--accent-slate .metric-icon-wrap {
  background: linear-gradient(135deg, #e2e8f0 0%, #f1f5f9 100%);
  color: #475569;
}

.metric-card--accent-teal .metric-icon-wrap {
  background: linear-gradient(135deg, #ccfbf1 0%, #e0f2fe 100%);
  color: #0d9488;
}

.metric-card--accent-indigo .metric-icon-wrap {
  background: linear-gradient(135deg, #e0e7ff 0%, #eef2ff 100%);
  color: #4f46e5;
}

.metric-icon {
  font-size: 24px;
}

.metric-card__text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.metric-value {
  font-size: 28px;
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -0.03em;
  color: var(--sg-text, #0f172a);
  font-variant-numeric: tabular-nums;
}

.metric-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--sg-text-secondary, #64748b);
  letter-spacing: 0.02em;
}

.metric-card--cta {
  padding: 20px;
  align-items: stretch;
  justify-content: center;
  gap: 12px;
  background: linear-gradient(160deg, #ffffff 0%, #f0f7ff 100%);
  border: 1px solid rgba(22, 119, 255, 0.18);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 24px rgba(22, 119, 255, 0.08);
  transition:
    transform 0.22s ease,
    box-shadow 0.22s ease;
}

.metric-card--cta:hover {
  transform: translateY(-3px);
  box-shadow: 0 4px 14px rgba(22, 119, 255, 0.15), 0 16px 40px rgba(15, 76, 129, 0.08);
}

.cta-btn {
  width: 100%;
  border-radius: 10px;
  font-weight: 600;
  height: 44px;
  transition: transform 0.15s ease, box-shadow 0.2s ease;
}

.cta-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(22, 119, 255, 0.35);
}

.cta-btn__icon {
  margin-right: 6px;
  vertical-align: middle;
}

.metric-hint {
  font-size: 12px;
  color: var(--sg-text-secondary, #64748b);
  text-align: center;
  line-height: 1.5;
}

.panel-card {
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: #fff;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 10px 28px rgba(15, 76, 129, 0.07);
  overflow: hidden;
  transition: box-shadow 0.25s ease;
}

.panel-card:hover {
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.06), 0 16px 40px rgba(15, 76, 129, 0.09);
}

.panel-card :deep(.el-card__header) {
  padding: 16px 20px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.9);
  background: linear-gradient(180deg, #fafbfc 0%, #ffffff 100%);
}

.panel-card :deep(.el-card__body) {
  padding: 0;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.panel-header__left {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 10px 14px;
}

.panel-title {
  font-weight: 700;
  font-size: 16px;
  color: var(--sg-text, #0f172a);
}

.panel-sub {
  font-size: 12px;
  font-weight: 500;
  color: var(--sg-text-placeholder, #94a3b8);
}

.table-wrap {
  padding: 0;
}

.tasks-table {
  --el-table-border-color: transparent;
  --el-table-header-bg-color: #f1f5f9;
}

.tasks-table :deep(.el-table__header-wrapper th) {
  font-weight: 600;
  font-size: 13px;
  color: #475569;
  background: #f1f5f9 !important;
  border-bottom: 1px solid #e2e8f0 !important;
}

.tasks-table :deep(.el-table__body-wrapper .el-table__row) {
  transition: background-color 0.2s ease;
}

.tasks-table :deep(.el-table__body-wrapper .el-table__row:hover > td) {
  background-color: rgba(22, 119, 255, 0.06) !important;
}

.tasks-table :deep(.el-table__cell) {
  padding: 14px 16px;
  vertical-align: middle;
}

.cell-task-title {
  font-weight: 600;
  color: #1e293b;
  font-size: 14px;
}

.cell-muted {
  font-size: 13px;
  color: #64748b;
}

.progress-cell {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 220px;
}

.progress-bar :deep(.el-progress-bar__outer) {
  border-radius: 6px;
  background-color: #e2e8f0;
}

.progress-caption {
  font-size: 12px;
  color: #64748b;
  font-variant-numeric: tabular-nums;
}

.deadline-cell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.deadline-tag {
  font-weight: 600;
}

.deadline-time {
  font-size: 12px;
  color: #64748b;
  line-height: 1.4;
}

.action-link {
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: color 0.2s ease, transform 0.15s ease;
}

.action-link:hover {
  transform: translateX(2px);
}

.action-link__icon {
  font-size: 16px;
}

.empty-panel {
  border-radius: 14px;
  border: 1px dashed rgba(148, 163, 184, 0.45);
  background: linear-gradient(180deg, #fafbfc 0%, #ffffff 100%);
  box-shadow: 0 4px 20px rgba(15, 23, 42, 0.04);
}

.empty-panel :deep(.el-card__body) {
  padding: 48px 24px 56px;
}

.empty-illus {
  width: 88px;
  height: 88px;
  margin: 0 auto 8px;
  border-radius: 20px;
  background: linear-gradient(145deg, #e0e7ff 0%, #f1f5f9 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6366f1;
}

.empty-illus__icon {
  font-size: 40px;
}

.empty-title {
  margin: 0 0 8px;
  font-size: 16px;
  font-weight: 700;
  color: #334155;
}

.empty-desc {
  margin: 0 auto 20px;
  max-width: 400px;
  font-size: 13px;
  line-height: 1.65;
  color: #64748b;
}

@media (max-width: 768px) {
  .page-dashboard {
    padding-left: 0;
    padding-right: 0;
  }

  .page-title {
    font-size: 20px;
  }

  .metric-value {
    font-size: 24px;
  }

  .tasks-table :deep(.el-table__cell) {
    padding: 12px 10px;
  }
}
</style>
