<template>
  <section v-if="announcements.length" class="ann-section">
    <div class="ann-section-head">
      <h2 class="section-label">{{ title }}</h2>
      <el-button
        v-if="announcements.length > 2"
        link
        type="primary"
        class="ann-more-link"
        @click="$emit('view-all')"
      >
        查看全部公告
      </el-button>
    </div>

    <div class="ann-list">
      <article
        v-for="ann in previewList"
        :key="ann.id"
        class="ann-card"
        :class="{ 'ann-card--important': isImportantAnn(ann) }"
      >
        <div class="ann-card-head">
          <el-icon class="ann-card-icon"><Bell /></el-icon>
          <div class="ann-card-meta">
            <span class="ann-type-tag">{{ ann._sourceLabel || '班级公告' }}</span>
            <span v-if="isImportantAnn(ann)" class="ann-important-tag">重要</span>
          </div>
          <span class="ann-time">{{ formatDateTime(ann.created_at) }}</span>
        </div>
        <h3 class="ann-card-title">{{ ann.title }}</h3>
        <p class="ann-card-summary">{{ annSummary(ann.content) }}</p>
        <div class="ann-card-foot">
          <span v-if="ann.teacher_name" class="ann-publisher">发布人：{{ ann.teacher_name }}</span>
          <el-button link type="primary" class="ann-detail-btn" @click="$emit('detail', ann)">
            查看详情
          </el-button>
        </div>
      </article>
    </div>

    <el-button
      v-if="announcements.length <= 2"
      link
      type="primary"
      class="ann-more-link ann-more-link--block"
      @click="$emit('view-all')"
    >
      查看全部公告
    </el-button>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { Bell } from '@element-plus/icons-vue'
import { formatDateTime } from '../../utils/format'
import { isImportantAnn, annSummary } from '../../composables/useStudentLearningSpaces'

const props = defineProps({
  title: { type: String, default: '最新公告' },
  announcements: { type: Array, default: () => [] },
})

defineEmits(['view-all', 'detail'])

const previewList = computed(() => props.announcements.slice(0, 2))
</script>

<style scoped>
.ann-section {
  margin-bottom: 16px;
}

.ann-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.section-label {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #1f2d3d;
}

.ann-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ann-card {
  background: #fff;
  border: 1px solid #e5eaf2;
  border-radius: 12px;
  padding: 14px 16px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
}

.ann-card--important {
  background: #fff7ed;
  border-color: #fed7aa;
  border-left: 3px solid #f59e0b;
}

.ann-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.ann-card-icon {
  color: #1d5fd6;
  font-size: 16px;
}

.ann-card-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
}

.ann-type-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  background: #eff6ff;
  color: #1d5fd6;
  border: 1px solid #dbeafe;
}

.ann-important-tag {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: #fff7ed;
  color: #d97706;
  border: 1px solid #fed7aa;
}

.ann-time {
  font-size: 12px;
  color: #9ca3af;
  margin-left: auto;
}

.ann-card-title {
  margin: 0 0 6px;
  font-size: 15px;
  font-weight: 600;
  color: #1f2d3d;
}

.ann-card-summary {
  margin: 0 0 10px;
  font-size: 13px;
  line-height: 1.55;
  color: #6b7280;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.ann-card-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ann-publisher {
  font-size: 12px;
  color: #9ca3af;
}

.ann-detail-btn,
.ann-more-link {
  color: #1d5fd6 !important;
  font-weight: 500;
}

.ann-more-link--block {
  display: block;
  margin-top: 8px;
  text-align: right;
}
</style>
