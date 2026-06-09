<template>
  <div class="kg-page">
    <header class="kg-page-header">
      <h2 class="page-title">我的学习知识图谱</h2>
      <p class="page-desc">
        展示个人任务、知识点与薄弱点关联，帮助明确已掌握内容和待提升方向。
      </p>
    </header>

    <KgGraphWorkbench
      role="student"
      graph-mode="student"
      :load-graph="loadMine"
      :build-payload="buildPayload"
      :self-student-id="selfStudentNodeId"
    />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useUserStore } from '../../stores/user'
import KgGraphWorkbench from '../../components/kg/KgGraphWorkbench.vue'
import { getKgStudentGraph } from '../../api/kg'

const userStore = useUserStore()
const studentId = computed(() => userStore.user?.id)
const selfStudentNodeId = computed(() =>
  studentId.value ? `student_${studentId.value}` : ''
)

const buildPayload = computed(() => ({
  scopeType: 'student',
  scopeId: studentId.value ? String(studentId.value) : '',
}))

const loadMine = () => getKgStudentGraph(studentId.value)
</script>

<style scoped>
.kg-page {
  padding: 8px 4px 24px;
  background: #eef2f7;
  min-height: 100%;
}
.kg-page-header {
  margin-bottom: 16px;
}
.page-title {
  margin: 0 0 8px;
  font-size: 22px;
  font-weight: 700;
  color: #1e293b;
}
.page-desc {
  margin: 0 0 12px;
  font-size: 13px;
  color: #64748b;
  line-height: 1.55;
  max-width: 720px;
}
</style>
