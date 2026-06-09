<template>
  <div class="kg-page">
    <header class="kg-page-header">
      <h2 class="page-title">课程知识体系总览</h2>
      <p class="page-desc">
        汇总课程、任务、知识点与关系构建情况，辅助管理员监管课程资源建设质量。
      </p>
    </header>

    <KgGraphWorkbench
      role="admin"
      graph-mode="course"
      :load-graph="loadFull"
      :build-payload="{ scopeType: 'full' }"
      show-reconcile
      :reconciling="reconciling"
      @reconcile="onReconcile"
    />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import KgGraphWorkbench from '../../components/kg/KgGraphWorkbench.vue'
import { getKgCourseGraph, postKgReconcile } from '../../api/kg'

const reconciling = ref(false)

const loadFull = () => getKgCourseGraph({})

async function onReconcile() {
  reconciling.value = true
  try {
    const res = await postKgReconcile()
    if (res.success) {
      ElMessage.success(res.data?.mismatch ? '已检测到不一致并完成重同步' : '校验完成，数据一致')
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || e.message || '校验失败')
  } finally {
    reconciling.value = false
  }
}
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
