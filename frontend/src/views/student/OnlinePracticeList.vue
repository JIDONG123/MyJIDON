<template>
  <div class="op-center">
    <header class="center-head">
      <div class="center-head__main">
        <h1 class="center-title">在线实训</h1>
        <p class="center-subtitle">
          课堂即时练习，支持 Python / Node.js / C / C++ / Java 在线编写与运行，运行结果仅作练习参考，不计入正式任务成绩。
        </p>
        <div class="feature-tags">
          <el-tag size="small" effect="plain" type="primary">多语言支持</el-tag>
          <el-tag size="small" effect="plain" type="success">在线运行</el-tag>
          <el-tag size="small" effect="plain">课堂练习</el-tag>
        </div>
      </div>
    </header>

    <el-alert
      v-if="!featureReady"
      type="info"
      show-icon
      :closable="false"
      title="正在检测代码运行功能…"
      class="state-alert"
    />

    <div v-else-if="!featureOn" class="panel empty-panel">
      <el-empty :image-size="96">
        <template #description>
          <h3 class="empty-title">在线实训暂未启用</h3>
          <p class="empty-desc">
            当前环境未开启代码运行服务，请联系教师或管理员。原有实训中心和成绩查询功能不受影响。
          </p>
        </template>
      </el-empty>
    </div>

    <template v-else>
      <section class="metric-grid">
        <div v-for="card in statCards" :key="card.key" class="metric-card">
          <div class="metric-card__icon" :class="`metric-card__icon--${card.tone}`">
            <el-icon><component :is="card.icon" /></el-icon>
          </div>
          <div class="metric-card__body">
            <span class="metric-card__value">{{ card.value }}</span>
            <span class="metric-card__label">{{ card.label }}</span>
            <span class="metric-card__hint">{{ card.hint }}</span>
          </div>
        </div>
      </section>

      <div class="info-banner" role="note">
        <el-icon class="info-banner__icon"><InfoFilled /></el-icon>
        <p class="info-banner__text">
          在线实训用于课堂即时练习，运行结果和 AI 点评仅供学习参考，不计入正式任务成绩。
        </p>
      </div>

      <div class="panel filter-panel">
        <el-form :inline="true" class="filter-form" @submit.prevent>
          <el-form-item label="搜索">
            <el-input
              v-model="keyword"
              clearable
              placeholder="搜索练习标题或说明"
              style="width: 240px"
              :prefix-icon="Search"
            />
          </el-form-item>
          <el-form-item label="语言">
            <el-select v-model="langFilter" clearable placeholder="全部" style="width: 132px">
              <el-option label="全部" value="" />
              <el-option v-for="opt in CODE_RUN_LANGUAGES" :key="opt.value" :label="opt.label" :value="opt.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="进度">
            <el-select v-model="progressFilter" clearable placeholder="全部" style="width: 132px">
              <el-option label="全部" value="" />
              <el-option label="未开始" value="not_started" />
              <el-option label="已开始" value="started" />
              <el-option label="已运行" value="run" />
            </el-select>
          </el-form-item>
        </el-form>
      </div>

      <el-skeleton v-if="loading" animated :rows="8" class="list-skeleton" />

      <div v-else-if="!rows.length" class="panel empty-panel">
        <el-empty :image-size="96">
          <template #description>
            <h3 class="empty-title">暂无在线实训</h3>
            <p class="empty-desc">
              老师发布在线实训后，你可以在这里进入练习，在线编写并运行代码。
            </p>
          </template>
          <el-button type="primary" plain @click="goTasks">前往实训中心</el-button>
        </el-empty>
      </div>

      <div v-else-if="!displayCards.length" class="panel empty-panel">
        <el-empty description="没有匹配的练习，请调整筛选条件" :image-size="80" />
      </div>

      <div v-else class="practice-grid">
        <article
          v-for="item in displayCards"
          :key="item.id"
          class="practice-card"
          tabindex="0"
          @click="goWorkbench(item)"
          @keyup.enter="goWorkbench(item)"
        >
          <div class="practice-card__head">
            <h3 class="practice-card__title" :title="item.title">{{ item.title }}</h3>
            <OnlinePracticeLanguageTag :language="item.language" />
          </div>

          <div class="practice-card__meta">
            <span class="meta-item">
              <span class="meta-label">入口文件</span>
              <span class="meta-value mono">{{ item.entryFile || '—' }}</span>
            </span>
          </div>

          <p class="practice-card__desc">{{ item.description || '教师未填写说明，进入练习后可直接编写代码。' }}</p>

          <div class="practice-card__status">
            <el-tag size="small" :type="item.publishMeta.type" effect="plain">
              {{ item.publishMeta.label }}
            </el-tag>
            <el-tag size="small" :type="item.saveMeta.type" effect="plain">
              {{ item.saveMeta.label }}
            </el-tag>
            <el-tag size="small" :type="item.runMeta.type" effect="plain">
              {{ item.runMeta.label }}
            </el-tag>
          </div>

          <div class="practice-card__foot">
            <el-button type="primary" @click.stop="goWorkbench(item)">进入练习</el-button>
          </div>
        </article>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  Search,
  InfoFilled,
  Collection,
  EditPen,
  VideoPlay,
  Cpu,
} from '@element-plus/icons-vue'
import { listOnlinePracticeTemplates, listMyOnlinePracticeAttempts } from '../../api/onlinePractice'
import { probeCodeRunnerEnabled } from '../../composables/useCodeRunnerFeature'
import { CODE_RUN_LANGUAGES } from '../../utils/codeRunLanguages'
import {
  publishStatusMeta,
  saveStatusMeta,
  runStatusMeta,
  progressFilterKey,
} from '../../utils/onlinePracticeDisplay'
import OnlinePracticeLanguageTag from '../../components/codeRunner/OnlinePracticeLanguageTag.vue'

const router = useRouter()
const loading = ref(false)
const rows = ref([])
const attempts = ref([])
const keyword = ref('')
const langFilter = ref('')
const progressFilter = ref('')
const featureReady = ref(false)
const featureOn = ref(false)

const attemptsByTemplate = computed(() => {
  const map = {}
  for (const a of attempts.value) {
    map[a.templateId] = a
  }
  return map
})

const enrichedRows = computed(() =>
  rows.value.map((row) => {
    const attempt = attemptsByTemplate.value[row.id] || null
    return {
      ...row,
      attempt,
      publishMeta: publishStatusMeta(row.status),
      saveMeta: saveStatusMeta(attempt, row),
      runMeta: runStatusMeta(attempt),
      progressKey: progressFilterKey(attempt, row),
    }
  })
)

const displayCards = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return enrichedRows.value.filter((item) => {
    if (langFilter.value && item.language !== langFilter.value) return false
    if (progressFilter.value && item.progressKey !== progressFilter.value) return false
    if (!kw) return true
    const hay = `${item.title || ''} ${item.description || ''}`.toLowerCase()
    return hay.includes(kw)
  })
})

const statCards = computed(() => {
  const startedCount = enrichedRows.value.filter((r) => r.attempt).length
  const totalRuns = attempts.value.reduce((s, a) => s + (Number(a.runCount) || 0), 0)
  const langCount = new Set(rows.value.map((r) => r.language).filter(Boolean)).size

  return [
    {
      key: 'total',
      label: '可练习数量',
      value: rows.value.length,
      hint: '已发布练习',
      icon: Collection,
      tone: 'blue',
    },
    {
      key: 'started',
      label: '已开始练习',
      value: startedCount,
      hint: '已打开或保存',
      icon: EditPen,
      tone: 'teal',
    },
    {
      key: 'runs',
      label: '已运行次数',
      value: totalRuns,
      hint: '累计试运行',
      icon: VideoPlay,
      tone: 'green',
    },
    {
      key: 'langs',
      label: '支持语言数',
      value: langCount || CODE_RUN_LANGUAGES.length,
      hint: '当前列表语言',
      icon: Cpu,
      tone: 'indigo',
    },
  ]
})

async function load() {
  if (!featureOn.value) return
  loading.value = true
  try {
    const [tplRes, attRes] = await Promise.all([
      listOnlinePracticeTemplates(),
      listMyOnlinePracticeAttempts().catch(() => ({ success: false, data: [] })),
    ])
    if (tplRes.success) {
      rows.value = (tplRes.data || []).filter((r) => r.status === 'published')
    }
    if (attRes.success) {
      attempts.value = attRes.data || []
    }
  } finally {
    loading.value = false
  }
}

function goWorkbench(row) {
  router.push(`/student/online-practice/${row.id}`)
}

function goTasks() {
  router.push('/student/tasks')
}

onMounted(async () => {
  featureOn.value = await probeCodeRunnerEnabled()
  featureReady.value = true
  if (featureOn.value) await load()
})
</script>

<style scoped>
.op-center {
  max-width: 1360px;
  margin: -20px -24px -36px;
  padding: 20px 24px 36px;
  min-height: calc(100vh - 120px);
  background: #eef2f7;
  box-sizing: border-box;
}

.center-head {
  margin-bottom: 20px;
}

.center-title {
  margin: 0 0 8px;
  font-size: 24px;
  font-weight: 700;
  color: #0f172a;
  letter-spacing: -0.02em;
}

.center-subtitle {
  margin: 0 0 12px;
  max-width: 44rem;
  font-size: 14px;
  line-height: 1.65;
  color: #64748b;
}

.feature-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.state-alert {
  margin-bottom: 16px;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 14px;
  margin-bottom: 16px;
}

.metric-card {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 18px 16px;
  background: #fff;
  border: 1px solid #e8edf3;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
}

.metric-card__icon {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
}

.metric-card__icon--blue { background: #eff6ff; color: #1677ff; }
.metric-card__icon--teal { background: #f0fdfa; color: #0d9488; }
.metric-card__icon--green { background: #f0fdf4; color: #16a34a; }
.metric-card__icon--indigo { background: #eef2ff; color: #4f46e5; }

.metric-card__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.metric-card__value {
  font-size: 26px;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
}

.metric-card__label {
  font-size: 13px;
  font-weight: 600;
  color: #475569;
}

.metric-card__hint {
  font-size: 11px;
  color: #94a3b8;
}

.info-banner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 14px 16px;
  margin-bottom: 16px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 12px;
}

.info-banner__icon {
  flex-shrink: 0;
  margin-top: 2px;
  font-size: 18px;
  color: #1677ff;
}

.info-banner__text {
  margin: 0;
  font-size: 13px;
  line-height: 1.65;
  color: #334155;
}

.panel {
  background: #fff;
  border: 1px solid #e8edf3;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
  margin-bottom: 16px;
}

.filter-panel :deep(.el-card__body) {
  padding: 14px 16px;
}

.filter-form :deep(.el-form-item) {
  margin-bottom: 0;
  margin-right: 16px;
}

.filter-form :deep(.el-form-item__label) {
  font-weight: 600;
  color: #475569;
}

.filter-panel .panel__body,
.filter-panel {
  padding: 14px 16px;
}

.list-skeleton {
  padding: 16px;
  background: #fff;
  border-radius: 12px;
  border: 1px solid #e8edf3;
}

.empty-panel {
  padding: 32px 20px;
}

.empty-title {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 600;
  color: #0f172a;
}

.empty-desc {
  margin: 0;
  max-width: 28rem;
  font-size: 14px;
  line-height: 1.6;
  color: #64748b;
}

.practice-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.practice-card {
  display: flex;
  flex-direction: column;
  background: #fff;
  border: 1px solid #e8edf3;
  border-radius: 12px;
  padding: 18px 18px 16px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
  cursor: pointer;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}

.practice-card:hover,
.practice-card:focus-visible {
  border-color: #1677ff;
  box-shadow: 0 8px 24px rgba(22, 119, 255, 0.12);
  transform: translateY(-2px);
  outline: none;
}

.practice-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.practice-card__title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.4;
  flex: 1;
  min-width: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.practice-card__meta {
  margin-bottom: 10px;
}

.meta-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.meta-label {
  color: #94a3b8;
}

.meta-value {
  color: #475569;
  font-weight: 600;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.practice-card__desc {
  margin: 0 0 14px;
  font-size: 13px;
  line-height: 1.65;
  color: #64748b;
  flex: 1;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.practice-card__status {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}

.practice-card__foot {
  display: flex;
  justify-content: flex-end;
  padding-top: 4px;
  border-top: 1px solid #f1f5f9;
}

.practice-card__foot .el-button {
  border-radius: 10px;
  font-weight: 600;
}

@media (max-width: 640px) {
  .practice-grid {
    grid-template-columns: 1fr;
  }
}
</style>
