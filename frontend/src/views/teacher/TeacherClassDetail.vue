<template>
  <div class="page-class-detail">
    <header class="page-head">
      <div class="page-head-row">
        <el-button class="back-btn" @click="$router.push('/teacher/classes')">
          <el-icon><ArrowLeft /></el-icon>
          返回班级列表
        </el-button>
        <div v-if="cls" class="page-head-meta">
          <h1 class="page-title">{{ cls.class_name }}</h1>
          <p class="page-desc">
            {{ cls.major || '—' }} · {{ cls.grade || '—' }} · {{ cls.studentCount }} 名学生 · 已发布 {{ cls.taskCount }} 个任务
          </p>
        </div>
      </div>
    </header>

    <el-skeleton v-if="loading" animated :rows="6" class="sk-main" />

    <el-alert v-else-if="errorMsg" type="error" :title="errorMsg" show-icon :closable="false" class="err-alert" />

    <div v-else-if="cls" class="workspace-body">
      <!-- 快捷操作 -->
      <section class="section section--actions">
        <div class="action-segmented" role="group" aria-label="班级快捷操作">
          <button type="button" class="seg-item seg-item--active" @click="goCreateTask">
            <el-icon class="seg-icon"><DocumentAdd /></el-icon>
            <span>发布任务</span>
          </button>
          <button type="button" class="seg-item" @click="goClassTasks">
            <el-icon class="seg-icon"><List /></el-icon>
            <span>本班任务列表</span>
          </button>
          <button type="button" class="seg-item" @click="goClassStats">
            <el-icon class="seg-icon"><TrendCharts /></el-icon>
            <span>本班成绩统计</span>
          </button>
        </div>
        <p class="action-note">发布任务将默认选中本班级；任务列表与统计将只筛选当前班级。</p>
      </section>

      <!-- 1. 分层推荐规则 -->
      <el-card shadow="never" class="module-card">
        <template #header>
          <span class="module-title">分层推荐规则（本班）</span>
        </template>
        <el-collapse v-model="recRulesDescOpen" class="desc-collapse">
          <el-collapse-item name="desc">
            <template #title>
              <span class="collapse-title">规则说明</span>
              <span class="collapse-hint">（可收起）</span>
            </template>
            <div class="desc-body">
              控制学生首页「推荐任务」的难度档位：低于「巩固线」或维度明显薄弱时优先推荐<strong>基础</strong>难度未交任务；达到「挑战线」且无显著薄弱时优先推荐<strong>进阶</strong>。仅筛选已发布任务，不新增、不覆盖您手动发布的任务。
            </div>
          </el-collapse-item>
        </el-collapse>
        <div class="rec-form-block">
          <el-form label-position="top" class="rec-form" @submit.prevent>
            <el-row :gutter="20">
              <el-col :xs="24" :sm="8" :md="6">
                <el-form-item label="巩固线（分）">
                  <el-input-number
                    v-model="recRules.basicBelow"
                    :min="1"
                    :max="99"
                    :step="1"
                    controls-position="right"
                    class="rec-input-num"
                  />
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="8" :md="6">
                <el-form-item label="挑战线（分）">
                  <el-input-number
                    v-model="recRules.advancedAbove"
                    :min="1"
                    :max="100"
                    :step="1"
                    controls-position="right"
                    class="rec-input-num"
                  />
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="24" :md="12" class="rec-actions-col">
                <el-form-item label=" " class="rec-actions-item">
                  <div class="rec-btns">
                    <el-button type="primary" :loading="recRulesSaving" @click="saveRecRules">保存规则</el-button>
                    <el-button @click="loadRecRules">重置为已保存</el-button>
                  </div>
                </el-form-item>
              </el-col>
            </el-row>
          </el-form>
        </div>
        <p v-if="recRulesHint" class="api-hint">{{ recRulesHint }}</p>
      </el-card>

      <!-- 2. 班级学生入口 -->
      <div
        class="student-entry-card"
        role="button"
        tabindex="0"
        @click="goStudentMgmt"
        @keyup.enter="goStudentMgmt"
      >
        <div class="student-entry-inner">
          <div class="student-entry-icon" aria-hidden="true">
            <el-icon><UserFilled /></el-icon>
          </div>
          <div class="student-entry-text">
            <h2 class="student-entry-title">班级学生</h2>
            <p class="student-entry-stat">
              <strong>{{ cls.studentCount ?? 0 }}</strong>
              <span>名学生</span>
            </p>
            <p class="student-entry-hint">查看本班名单、从未分班学生中添加成员</p>
          </div>
          <el-button type="primary" class="student-entry-btn" @click.stop="goStudentMgmt">
            进入学生管理
            <el-icon><ArrowRight /></el-icon>
          </el-button>
        </div>
      </div>

      <!-- 3. 本班公告预览 -->
      <el-card shadow="never" class="module-card">
        <template #header>
          <div class="card-head-row">
            <span class="module-title">本班公告预览</span>
            <el-button class="ghost-btn" @click="goAnnounceMgmt">
              前往公告管理
              <el-icon><ArrowRight /></el-icon>
            </el-button>
          </div>
        </template>
        <div v-loading="previewLoading" class="preview-body">
          <template v-if="previewList.length">
            <ul class="ann-preview-list">
              <li
                v-for="a in previewList"
                :key="a.id"
                class="ann-preview-item"
                @click="openPreviewDetail(a)"
              >
                <span class="ann-preview-title">{{ a.title }}</span>
                <time class="ann-preview-time">{{ formatDateTime(a.created_at) }}</time>
              </li>
            </ul>
          </template>
          <el-empty v-else description="暂无本班公告，发布后可在此快速预览" :image-size="72" />
        </div>
      </el-card>
    </div>

    <el-dialog v-model="previewDetailVisible" title="公告详情" width="520px" destroy-on-close>
      <template v-if="previewDetail">
        <p class="detail-time">{{ formatDateTime(previewDetail.created_at) }}</p>
        <h3 class="detail-title">{{ previewDetail.title }}</h3>
        <div class="detail-content">{{ previewDetail.content || '（无正文）' }}</div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  ArrowLeft,
  ArrowRight,
  DocumentAdd,
  List,
  TrendCharts,
  UserFilled,
} from '@element-plus/icons-vue'
import { getMyTeachingOverview, listClassAnnouncements } from '../../api/class'
import { formatDateTime } from '../../utils/format'
import { getClassRecommendationRules, putClassRecommendationRules } from '../../api/analytics'

const route = useRoute()
const router = useRouter()

const loading = ref(true)
const errorMsg = ref('')
const overviewRow = ref(null)

const recRules = reactive({ basicBelow: 62, advancedAbove: 86 })
const recRulesSaving = ref(false)
const recRulesHint = ref('')
const recRulesDescOpen = ref(['desc'])

const previewLoading = ref(false)
const previewList = ref([])
const previewDetailVisible = ref(false)
const previewDetail = ref(null)

const cls = computed(() => overviewRow.value)
const classId = computed(() => route.params.id)

const loadRecRules = async () => {
  recRulesHint.value = ''
  try {
    const res = await getClassRecommendationRules(classId.value)
    if (res.success && res.data) {
      recRules.basicBelow = Number(res.data.basicBelow) || 62
      recRules.advancedAbove = Number(res.data.advancedAbove) || 86
    }
  } catch (e) {
    const msg = e?.response?.data?.message
    recRulesHint.value = msg || '无法加载推荐规则（若数据库未迁移，请执行 backend/sql/migration_class_recommendation_rules.sql）'
  }
}

const saveRecRules = async () => {
  recRulesSaving.value = true
  recRulesHint.value = ''
  try {
    const res = await putClassRecommendationRules(classId.value, {
      basicBelow: recRules.basicBelow,
      advancedAbove: recRules.advancedAbove,
    })
    if (res.success) {
      ElMessage.success('已保存分层推荐规则')
    }
  } catch (e) {
    recRulesHint.value = e?.response?.data?.message || '保存失败'
    ElMessage.error(recRulesHint.value)
  } finally {
    recRulesSaving.value = false
  }
}

const loadPreview = async () => {
  if (!cls.value?.id) return
  previewLoading.value = true
  try {
    const res = await listClassAnnouncements(cls.value.id)
    if (res.success) {
      const all = res.data || []
      previewList.value = [...all].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 10)
    } else {
      previewList.value = []
    }
  } catch {
    previewList.value = []
  } finally {
    previewLoading.value = false
  }
}

const openPreviewDetail = (a) => {
  previewDetail.value = a
  previewDetailVisible.value = true
}

const goStudentMgmt = () => {
  router.push(`/teacher/classes/${classId.value}/students`)
}

const goAnnounceMgmt = () => {
  router.push({ path: '/teacher/class-announcements', query: { classId: String(classId.value) } })
}

const load = async () => {
  loading.value = true
  errorMsg.value = ''
  overviewRow.value = null
  try {
    const res = await getMyTeachingOverview()
    if (!res.success) {
      errorMsg.value = '加载失败'
      return
    }
    const row = (res.data || []).find((c) => String(c.id) === String(classId.value))
    if (!row) {
      errorMsg.value = '班级不存在或您无权管理该班级'
      return
    }
    overviewRow.value = row
    await loadRecRules()
    await loadPreview()
  } finally {
    loading.value = false
  }
}

const goCreateTask = () => {
  router.push({ path: '/teacher/tasks/create', query: { classId: String(classId.value) } })
}

const goClassTasks = () => {
  router.push({ path: '/teacher/tasks', query: { classId: String(classId.value) } })
}

const goClassStats = () => {
  router.push({ path: '/teacher/statistics', query: { classId: String(classId.value) } })
}

onMounted(load)

watch(
  () => route.params.id,
  async () => {
    await load()
  }
)
</script>

<style scoped>
.page-class-detail {
  max-width: 1120px;
  margin: 0 auto;
  padding: 8px 4px 40px;
}

.page-head {
  margin-bottom: 28px;
  padding: 0 2px;
}

.page-head-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 20px;
}

.page-head-meta {
  min-width: 0;
  flex: 1;
}

.back-btn {
  border-radius: 10px;
  font-weight: 500;
  transition: transform 0.15s ease;
}

.back-btn:hover {
  transform: translateX(-2px);
  color: var(--el-color-primary);
}

.page-title {
  margin: 0 0 10px;
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--sg-text, #0f172a);
}

.page-desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--sg-text-secondary, #64748b);
}

.sk-main {
  padding: 20px 4px;
}

.err-alert {
  border-radius: 12px;
}

.workspace-body {
  display: flex;
  flex-direction: column;
  gap: 22px;
  animation: workspace-in 0.45s ease-out both;
}

@keyframes workspace-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.section--actions {
  padding: 0 2px;
}

.action-segmented {
  display: flex;
  flex-wrap: wrap;
  gap: 0;
  padding: 4px;
  border-radius: 12px;
  background: #f1f5f9;
  border: 1px solid rgba(148, 163, 184, 0.25);
}

.seg-item {
  flex: 1 1 160px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 46px;
  padding: 0 16px;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  color: #475569;
  background: transparent;
  cursor: pointer;
  transition:
    background 0.2s ease,
    color 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.15s ease;
}

.seg-item:hover:not(.seg-item--active) {
  background: rgba(255, 255, 255, 0.65);
  color: var(--el-color-primary);
}

.seg-item--active {
  background: var(--el-color-primary);
  color: #fff;
  box-shadow: 0 4px 14px rgba(64, 158, 255, 0.35);
}

.seg-item--active:hover {
  filter: brightness(1.05);
  transform: translateY(-1px);
}

.seg-icon {
  font-size: 18px;
}

.action-note {
  margin: 14px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--sg-text-placeholder, #94a3b8);
}

.module-card {
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: #fff;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 28px rgba(15, 76, 129, 0.06);
  transition: box-shadow 0.25s ease;
}

.module-card:hover {
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.06), 0 16px 40px rgba(15, 76, 129, 0.08);
}

.module-card :deep(.el-card__header) {
  padding: 16px 20px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.95);
  background: linear-gradient(180deg, #fafbfc 0%, #ffffff 100%);
}

.module-card :deep(.el-card__body) {
  padding: 18px 20px 22px;
}

.module-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--sg-text, #0f172a);
}

.card-head-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.ghost-btn {
  border-radius: 10px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--el-color-primary);
}

.desc-collapse {
  margin-bottom: 4px;
  border: none;
}

.desc-collapse :deep(.el-collapse-item__header) {
  font-size: 13px;
  font-weight: 600;
  color: #475569;
  background: #f8fafc;
  border-radius: 10px;
  padding: 0 14px;
  border: 1px solid #e2e8f0;
}

.desc-collapse :deep(.el-collapse-item__wrap) {
  border: none;
  background: transparent;
}

.desc-collapse :deep(.el-collapse-item__content) {
  padding: 12px 4px 4px;
}

.collapse-hint {
  margin-left: 6px;
  font-size: 12px;
  font-weight: 500;
  color: #94a3b8;
}

.desc-body {
  font-size: 13px;
  line-height: 1.7;
  color: #64748b;
  max-width: 56rem;
}

.rec-form-block {
  margin-top: 8px;
}

.rec-form :deep(.el-form-item__label) {
  font-size: 13px;
  font-weight: 600;
  color: #475569;
}

.rec-input-num {
  width: 100%;
  max-width: 200px;
}

.rec-input-num :deep(.el-input__wrapper) {
  border-radius: 10px;
  transition: box-shadow 0.2s ease;
}

.rec-input-num :deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px var(--el-color-primary-light-5) inset;
}

.rec-actions-col {
  display: flex;
  align-items: flex-end;
}

.rec-actions-item :deep(.el-form-item__label) {
  visibility: hidden;
}

.rec-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.rec-btns .el-button {
  border-radius: 10px;
  font-weight: 600;
}

.api-hint {
  margin: 14px 0 0;
  font-size: 13px;
  color: var(--el-color-danger);
}

/* 班级学生入口卡片 */
.student-entry-card {
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: linear-gradient(165deg, #ffffff 0%, #f8fafc 100%);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 28px rgba(15, 76, 129, 0.06);
  cursor: pointer;
  transition:
    transform 0.22s ease,
    box-shadow 0.22s ease;
  outline: none;
}

.student-entry-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.08), 0 16px 40px rgba(15, 76, 129, 0.1);
}

.student-entry-card:focus-visible {
  box-shadow: 0 0 0 3px rgba(64, 158, 255, 0.35);
}

.student-entry-inner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 20px;
  padding: 22px 24px;
}

.student-entry-icon {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  background: linear-gradient(135deg, #dbeafe 0%, #eff6ff 100%);
  color: #2563eb;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  flex-shrink: 0;
}

.student-entry-text {
  flex: 1;
  min-width: 200px;
}

.student-entry-title {
  margin: 0 0 8px;
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.student-entry-stat {
  margin: 0 0 6px;
  font-size: 15px;
  color: #475569;
}

.student-entry-stat strong {
  font-size: 28px;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: #0f172a;
  margin-right: 6px;
}

.student-entry-hint {
  margin: 0;
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.5;
}

.student-entry-btn {
  border-radius: 10px;
  font-weight: 600;
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.preview-body {
  min-height: 80px;
}

.ann-preview-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.ann-preview-item {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 10px;
  border: 1px solid transparent;
  cursor: pointer;
  transition:
    background 0.18s ease,
    border-color 0.18s ease;
}

.ann-preview-item:hover {
  background: rgba(64, 158, 255, 0.06);
  border-color: rgba(64, 158, 255, 0.15);
}

.ann-preview-item + .ann-preview-item {
  margin-top: 6px;
}

.ann-preview-title {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
}

.ann-preview-time {
  font-size: 12px;
  color: #94a3b8;
  font-variant-numeric: tabular-nums;
}

.detail-time {
  margin: 0 0 8px;
  font-size: 12px;
  color: #94a3b8;
}

.detail-title {
  margin: 0 0 12px;
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
}

.detail-content {
  font-size: 14px;
  line-height: 1.75;
  color: #334155;
  white-space: pre-wrap;
}

@media (max-width: 768px) {
  .student-entry-inner {
    flex-direction: column;
    align-items: stretch;
  }

  .student-entry-btn {
    margin-left: 0;
    width: 100%;
    justify-content: center;
  }

  .seg-item {
    flex: 1 1 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .workspace-body {
    animation: none;
  }

  .student-entry-card:hover {
    transform: none;
  }
}
</style>
