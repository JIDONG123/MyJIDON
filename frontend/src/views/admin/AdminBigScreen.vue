<template>
  <BigScreenShell
    title="平台数据大屏"
    subtitle="班级实训总览与评价分析"
    :loading="loading"
    :data="data"
    :scope-ready="!!scopeKey"
    layout-root-selector=".admin-layout .bs-page"
    no-scope-text="请选择班级/教学班后查看数据"
  >
    <template #scope>
      <el-select
        v-if="scopeOptions.length"
        v-model="scopeKey"
        placeholder="选择班级 / 教学班"
        filterable
        @change="load"
      >
        <el-option v-for="o in scopeOptions" :key="o.key" :label="o.label" :value="o.key" />
      </el-select>
    </template>
  </BigScreenShell>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { getBigScreenStats } from '../../api/dashboard'
import { listTeachingClasses } from '../../api/teachingClass'
import { getAllClasses } from '../../api/class'
import BigScreenShell from '../../components/bigscreen/BigScreenShell.vue'

const loading = ref(true)
const data = ref(null)
const scopeKey = ref('')
const teachingClasses = ref([])
const legacyClasses = ref([])

const scopeOptions = computed(() => {
  const opts = []
  for (const c of legacyClasses.value) {
    opts.push({
      key: `class-${c.id}`,
      label: `行政班 · ${c.class_name || c.name || c.id}`,
    })
  }
  for (const tc of teachingClasses.value) {
    opts.push({
      key: `tc-${tc.id}`,
      label: `教学班 · ${[tc.class_name, tc.course_name].filter(Boolean).join(' ')}`,
    })
  }
  return opts
})

function bigScreenParams() {
  if (scopeKey.value.startsWith('tc-')) {
    return { teachingClassId: Number(scopeKey.value.replace('tc-', '')) }
  }
  if (scopeKey.value.startsWith('class-')) {
    return { classId: Number(scopeKey.value.replace('class-', '')) }
  }
  return {}
}

const load = async () => {
  if (!scopeKey.value) {
    data.value = { empty: true }
    loading.value = false
    return
  }
  loading.value = true
  try {
    const res = await getBigScreenStats(bigScreenParams())
    if (res.success) data.value = res.data
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  const [tcRes, clsRes] = await Promise.all([listTeachingClasses(), getAllClasses()])
  if (tcRes.success) teachingClasses.value = tcRes.data || []
  if (clsRes.success) legacyClasses.value = clsRes.data || []
  if (teachingClasses.value.length) {
    scopeKey.value = `tc-${teachingClasses.value[0].id}`
  } else if (legacyClasses.value.length) {
    scopeKey.value = `class-${legacyClasses.value[0].id}`
  }
  await load()
})
</script>
