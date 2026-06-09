<template>
  <BigScreenShell
    title="数据大屏"
    subtitle="班级实训总览与评价分析"
    :loading="loading"
    :data="data"
    :scope-ready="!!selectedClassId && classes.length > 0"
    layout-root-selector=".teacher-layout .bs-page"
    no-scope-text="暂无任教班级，无法展示大屏"
  >
    <template #alert>
      <el-alert
        v-if="!classes.length && !loading"
        type="warning"
        show-icon
        :closable="false"
        title="暂无任教班级，无法展示大屏。"
        class="bs-alert"
      />
    </template>

    <template #scope>
      <el-select
        v-if="classes.length"
        v-model="selectedClassId"
        placeholder="选择班级"
        filterable
        @change="load"
      >
        <el-option v-for="c in classes" :key="c.id" :label="classLabel(c)" :value="c.id" />
      </el-select>
    </template>
  </BigScreenShell>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { getBigScreenStats } from '../../api/dashboard'
import { getMyTeachingOverview } from '../../api/class'
import { ElMessage } from 'element-plus'
import BigScreenShell from '../../components/bigscreen/BigScreenShell.vue'

const classes = ref([])
const selectedClassId = ref(null)
const loading = ref(true)
const data = ref(null)

const classLabel = (c) => {
  const parts = [c.class_name, c.major, c.grade].filter(Boolean)
  return parts.length ? parts.join(' · ') : `班级 ${c.id}`
}

const load = async () => {
  if (!selectedClassId.value) {
    data.value = null
    loading.value = false
    return
  }
  loading.value = true
  try {
    const res = await getBigScreenStats({ classId: selectedClassId.value })
    if (res.success) data.value = res.data
    else ElMessage.error(res.message || '加载失败')
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  const res = await getMyTeachingOverview()
  if (res.success) {
    classes.value = res.data || []
    if (classes.value.length) {
      selectedClassId.value = classes.value[0].id
      await load()
    } else {
      loading.value = false
    }
  } else {
    loading.value = false
  }
})
</script>

<style scoped>
.bs-alert {
  margin-bottom: 16px;
}
</style>
