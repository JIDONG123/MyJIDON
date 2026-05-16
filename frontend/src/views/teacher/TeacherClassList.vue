<template>
  <div class="page-class-grid">
    <header class="page-head">
      <div>
        <h1 class="page-title">班级管理</h1>
        <p class="page-desc">点击下方卡片进入对应班级：集中查看学生、添加成员与发布任务。</p>
      </div>
    </header>

    <el-skeleton v-if="loading" animated :rows="5" class="sk-main" />

    <el-empty
      v-else-if="!overview.length"
      description="暂无负责班级，请联系管理员为您分配班级。"
      :image-size="120"
    />

    <div v-else class="card-grid">
      <div
        v-for="cls in overview"
        :key="cls.id"
        class="class-tile"
        role="button"
        tabindex="0"
        @click="goDetail(cls.id)"
        @keyup.enter="goDetail(cls.id)"
      >
        <div class="tile-top">
          <span class="tile-title">{{ cls.class_name }}</span>
          <el-icon class="tile-arrow"><ArrowRight /></el-icon>
        </div>
        <p class="tile-meta">{{ cls.major || '—' }} · {{ cls.grade || '—' }}</p>
        <div class="tile-stats">
          <span><strong>{{ cls.studentCount }}</strong> 名学生</span>
          <span class="dot">·</span>
          <span><strong>{{ cls.taskCount }}</strong> 个任务</span>
        </div>
        <p class="tile-hint">点击进入班级工作台</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRight } from '@element-plus/icons-vue'
import { getMyTeachingOverview } from '../../api/class'

const router = useRouter()
const loading = ref(true)
const overview = ref([])

const load = async () => {
  loading.value = true
  try {
    const res = await getMyTeachingOverview()
    if (res.success) overview.value = res.data || []
  } finally {
    loading.value = false
  }
}

const goDetail = (id) => {
  router.push(`/teacher/classes/${id}`)
}

onMounted(load)
</script>

<style scoped>
.page-class-grid {
  max-width: 1200px;
}

.page-head {
  margin-bottom: 24px;
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

.sk-main {
  padding: 16px 0;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}

.class-tile {
  background: #fff;
  border: 1px solid var(--sg-border);
  border-radius: var(--sg-radius-lg);
  padding: 22px 20px;
  cursor: pointer;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    border-color 0.2s ease;
  box-shadow: var(--sg-shadow-card);
}

.class-tile:hover {
  transform: translateY(-4px);
  border-color: rgba(22, 119, 255, 0.35);
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.1);
}

.class-tile:focus-visible {
  outline: 2px solid var(--sg-primary);
  outline-offset: 2px;
}

.tile-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 8px;
}

.tile-title {
  font-size: 17px;
  font-weight: 600;
  color: var(--sg-text);
  line-height: 1.35;
}

.tile-arrow {
  font-size: 18px;
  color: var(--sg-text-placeholder);
  flex-shrink: 0;
}

.tile-meta {
  margin: 0 0 14px;
  font-size: 13px;
  color: var(--sg-text-secondary);
}

.tile-stats {
  font-size: 14px;
  color: var(--sg-text);
  margin-bottom: 12px;
}

.tile-stats strong {
  font-weight: 700;
  color: var(--sg-primary);
}

.tile-stats .dot {
  margin: 0 6px;
  color: var(--sg-border);
}

.tile-hint {
  margin: 0;
  font-size: 12px;
  color: var(--sg-text-placeholder);
}
</style>
