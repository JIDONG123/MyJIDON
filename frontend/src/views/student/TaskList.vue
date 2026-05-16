<template>
  <div class="page-task-list">
    <header class="page-head">
      <h1 class="page-title">实训任务</h1>
      <p class="page-desc">仅展示您所在班级任务；提交后标记为已完成。</p>
    </header>

    <el-card class="class-banner" shadow="never">
      <template v-if="userStore.user?.classId">
        <div class="class-banner-row">
          <span class="class-banner-label">我的班级</span>
          <span class="class-banner-name">{{ classBannerText }}</span>
        </div>
      </template>
      <p v-else class="class-banner-warn">您尚未加入班级，请等待教师添加后再查看任务。</p>
    </el-card>

    <el-alert
      v-if="latestAnnouncement?.title"
      class="announce-banner"
      type="success"
      show-icon
      :closable="false"
    >
      <template #title>
        <span class="ann-title">班级公告 · {{ formatDateTime(latestAnnouncement.created_at) }}</span>
      </template>
      <div class="ann-body">
        <strong>{{ latestAnnouncement.title }}</strong>
        <p v-if="latestAnnouncement.content" class="ann-content">{{ latestAnnouncement.content }}</p>
      </div>
    </el-alert>

    <el-alert
      class="top-tip"
      type="info"
      show-icon
      :closable="false"
      title="请点击任务卡片或「查看详情」进入任务页：在详情中上传 Word/PDF/图片等成果并填写说明；教师批改后可在「成绩查询」查看 AI 评分、智能核查与报告。"
    />

    <el-card v-if="recommendations.tasks?.length" class="rec-card" shadow="never">
      <template #header>
        <div class="rec-head">
          <span>推荐任务</span>
          <el-tag type="info" size="small">{{ tierLabel }}</el-tag>
        </div>
      </template>
      <p class="rec-desc">
        根据您历史批改均分、各维度得分中的薄弱情况，以及教师为任务标注的难度，在本班<strong>已发布且您尚未提交</strong>的任务里优先展示匹配档位的任务；不替代任务列表中的全部任务。
      </p>
      <div class="rec-list">
        <div v-for="t in recommendations.tasks" :key="t.id" class="rec-item" @click="viewTask(t.id)">
          <div class="rec-item-main">
            <strong>{{ t.title }}</strong>
            <el-tag v-if="t.difficulty_level" size="small" effect="plain" class="rec-diff">{{ diffLabel(t.difficulty_level) }}</el-tag>
          </div>
          <span class="rec-meta">截止 {{ formatDateTime(t.deadline) }} · 满分 {{ t.max_score }}</span>
          <el-button type="primary" link size="small" @click.stop="viewTask(t.id)">去提交</el-button>
        </div>
      </div>
    </el-card>

    <el-skeleton v-if="loading" :rows="4" animated class="sk-main" />

    <template v-else-if="tasks.length === 0">
      <el-empty description="暂无任务或未绑定班级，请联系管理员" :image-size="120">
        <template #image>
          <div class="empty-illus">
            <el-icon><Reading /></el-icon>
          </div>
        </template>
      </el-empty>
    </template>

    <div v-else class="task-cards">
      <div v-for="task in tasks" :key="task.id" class="task-card" @click="viewTask(task.id)">
        <div class="task-card-top">
          <h3>{{ task.title }}</h3>
          <el-tag :type="task.completed ? 'success' : 'warning'" size="small" effect="plain">
            {{ task.completed ? '已完成' : '未完成' }}
          </el-tag>
        </div>
        <p class="description">{{ task.description }}</p>
        <div class="task-info">
          <span class="deadline">截止时间：{{ formatDateTime(task.deadline) }}</span>
          <span class="max-score">满分：{{ task.max_score }}分</span>
        </div>
        <div class="action">
          <el-button type="primary" @click.stop="viewTask(task.id)">查看详情</el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Reading } from '@element-plus/icons-vue'
import { useUserStore } from '../../stores/user'
import { getTasksByClass } from '../../api/task'
import { getLatestAnnouncementForStudent } from '../../api/class'
import { getMyRecommendations } from '../../api/analytics'
import { formatDateTime } from '../../utils/format'
import { useRtOnDomains } from '../../composables/useRtOnDomains'

const router = useRouter()
const userStore = useUserStore()
const tasks = ref([])
const loading = ref(true)
const latestAnnouncement = ref(null)
const recommendations = ref({ tier: 'standard', tasks: [] })

const tierLabel = computed(() => {
  const m = { basic: '巩固型（偏低分优先基础任务）', standard: '标准型', advanced: '挑战型（高分可尝试进阶）' }
  return m[recommendations.value.tier] || m.standard
})

function diffLabel(level) {
  const m = { basic: '基础', standard: '标准', advanced: '进阶' }
  return m[level] || level
}

const classBannerText = computed(() => {
  const u = userStore.user
  if (!u?.classId) return ''
  const name = u.className || u.class_name || ''
  const major = u.classMajor ?? u.class_major
  const grade = u.classGrade ?? u.class_grade
  const parts = [name, major, grade].filter(Boolean)
  if (parts.length) return parts.join(' · ')
  return `已加入班级（ID ${u.classId}）`
})

const loadTasks = async () => {
  loading.value = true
  tasks.value = []
  latestAnnouncement.value = null
  if (!userStore.user?.classId) {
    recommendations.value = { tier: 'standard', tasks: [] }
    loading.value = false
    return
  }

  try {
    const [response, ann, rec] = await Promise.all([
      getTasksByClass(Number(userStore.user.classId)),
      getLatestAnnouncementForStudent(),
      getMyRecommendations(),
    ])
    if (response.success) {
      tasks.value = response.data
    }
    if (ann.success && ann.data) {
      latestAnnouncement.value = ann.data
    }
    if (rec.success && rec.data) {
      recommendations.value = { tier: rec.data.tier || 'standard', tasks: rec.data.tasks || [] }
    }
  } catch (error) {
    console.error('获取任务列表失败:', error)
  } finally {
    loading.value = false
  }
}

const viewTask = (taskId) => {
  router.push(`/student/tasks/${taskId}`)
}

onMounted(async () => {
  await userStore.fetchUserInfo()
  loadTasks()
})

useRtOnDomains(
  ['tasks', 'task_templates', 'announcements', 'submission_student', 'grading', 'similarity'],
  () => {
    loadTasks()
  }
)
</script>

<style scoped>
.page-task-list {
  max-width: 1400px;
}

.page-head {
  margin-bottom: 16px;
}

.page-title {
  margin: 0 0 6px;
  font-size: 22px;
  font-weight: 600;
  color: var(--sg-text);
}

.page-desc {
  margin: 0;
  font-size: 14px;
  color: var(--sg-text-secondary);
}

.class-banner {
  margin-bottom: 16px;
  border-radius: var(--sg-radius-lg);
  border: 1px solid var(--sg-border);
}

.announce-banner {
  margin-bottom: 16px;
  border-radius: var(--sg-radius-lg);
}

.ann-title {
  font-weight: 600;
}

.ann-body strong {
  display: block;
  margin-bottom: 6px;
  font-size: 15px;
}

.ann-content {
  margin: 0;
  white-space: pre-wrap;
  font-size: 13px;
  line-height: 1.55;
  color: var(--sg-text-secondary);
}

.class-banner-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.class-banner-label {
  font-size: 12px;
  color: var(--sg-text-secondary);
}

.class-banner-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--sg-text);
}

.class-banner-warn {
  margin: 10px 0 0;
  font-size: 13px;
  color: #d46b08;
}

.top-tip {
  margin-bottom: 16px;
  border-radius: var(--sg-radius-lg);
}

.rec-card {
  margin-bottom: 16px;
  border-radius: var(--sg-radius-lg);
}

.rec-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-weight: 600;
}

.rec-desc {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--sg-text-secondary);
}

.rec-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.rec-item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid var(--sg-border);
  cursor: pointer;
  transition: background 0.15s ease;
}

.rec-item:hover {
  background: var(--sg-bg-page);
}

.rec-item-main {
  flex: 1;
  min-width: 200px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.rec-item-main strong {
  font-size: 14px;
  color: var(--sg-text);
}

.rec-diff {
  flex-shrink: 0;
}

.rec-meta {
  font-size: 12px;
  color: var(--sg-text-placeholder);
}

.sk-main {
  padding: 12px 0;
}

.empty-illus {
  width: 120px;
  height: 120px;
  margin: 0 auto;
  border-radius: 50%;
  background: linear-gradient(145deg, #ecfdf5 0%, #d1fae5 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 48px;
  color: #059669;
}

.task-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}

.task-card {
  background: #fff;
  border-radius: var(--sg-radius-lg);
  padding: 20px;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  border: 1px solid var(--sg-border);
  box-shadow: var(--sg-shadow-card);
}

.task-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.08);
}

.task-card-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 12px;
}

.task-card-top h3 {
  margin: 0;
  font-size: 16px;
  color: var(--sg-text);
  font-weight: 600;
  flex: 1;
  min-width: 0;
}

.description {
  margin: 0 0 16px;
  color: var(--sg-text-secondary);
  font-size: 14px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.task-info {
  display: flex;
  justify-content: space-between;
  margin-bottom: 16px;
  font-size: 13px;
  color: var(--sg-text-placeholder);
}

.action {
  text-align: right;
}
</style>
