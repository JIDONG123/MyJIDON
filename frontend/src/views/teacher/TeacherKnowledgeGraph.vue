<template>
  <div class="kg-page">
    <header class="kg-page-header">
      <h2 class="page-title">班级知识掌握图谱</h2>
      <p class="page-desc">
        基于任务提交、AI 批改结果与知识点关联，分析本班知识掌握与薄弱点。
      </p>
    </header>

    <el-alert
      v-if="!scopesLoading && !scopes.length"
      type="warning"
      show-icon
      :closable="false"
      title="暂无可查看的班级图谱，请确认已被分配为行政班负责人或教学班任课教师。"
      class="kg-alert"
    />

    <div v-if="scopes.length" class="kg-toolbar">
      <el-form inline class="kg-toolbar-form">
        <el-form-item label="班级范围">
          <el-select
            v-model="scopeKey"
            filterable
            clearable
            placeholder="选择班级范围"
            style="width: min(360px, 100%)"
            :loading="scopesLoading"
            @change="onScopeChange"
          >
            <el-option
              v-for="item in scopes"
              :key="scopeOptionKey(item)"
              :label="item.label"
              :value="scopeOptionKey(item)"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="任务（可选）">
          <el-select
            v-model="taskId"
            filterable
            clearable
            placeholder="聚焦某任务"
            style="width: min(320px, 100%)"
            :loading="tasksLoading"
            :disabled="!scopeKey"
          >
            <el-option
              v-for="t in tasks"
              :key="t.id"
              :label="taskOptionLabel(t)"
              :value="String(t.id)"
            />
          </el-select>
        </el-form-item>
      </el-form>
    </div>

    <KgGraphWorkbench
      v-if="scopeKey"
      role="teacher"
      :graph-mode="graphMode"
      :enabled="!!scopeKey"
      :load-graph="loadGraph"
      :build-payload="buildPayload"
      :context-banner="contextBanner"
    >
      <template #filters>
        <div class="kg-filter-group">
          <label class="kg-filter-label">班级范围</label>
          <el-select
            v-model="scopeKey"
            filterable
            clearable
            placeholder="选择班级范围"
            size="small"
            style="width: 100%"
            :loading="scopesLoading"
            @change="onScopeChange"
          >
            <el-option
              v-for="item in scopes"
              :key="scopeOptionKey(item)"
              :label="item.label"
              :value="scopeOptionKey(item)"
            />
          </el-select>
        </div>
        <div class="kg-filter-group">
          <label class="kg-filter-label">任务（可选）</label>
          <el-select
            v-model="taskId"
            filterable
            clearable
            placeholder="聚焦某任务"
            size="small"
            style="width: 100%"
            :loading="tasksLoading"
          >
            <el-option
              v-for="t in tasks"
              :key="t.id"
              :label="taskOptionLabel(t)"
              :value="String(t.id)"
            />
          </el-select>
        </div>
      </template>
    </KgGraphWorkbench>

    <el-empty
      v-else-if="!scopesLoading && scopes.length"
      description="请在上方选择班级范围以查看知识图谱"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import KgGraphWorkbench from '../../components/kg/KgGraphWorkbench.vue'
import { getKgCourseGraph, getKgTeacherGraph, getKgTeacherScopes } from '../../api/kg'
import { getTasksByClass, getTasksByTeachingClass } from '../../api/task'

const route = useRoute()

const scopeKey = ref('')
const taskId = ref('')
const scopes = ref([])
const tasks = ref([])
const scopesLoading = ref(false)
const tasksLoading = ref(false)

function scopeOptionKey(item) {
  return `${item.scopeType}:${item.scopeId}`
}

function parseScopeKey(key) {
  const [scopeType, scopeId] = String(key || '').split(':')
  return { scopeType, scopeId }
}

const currentScope = computed(() => {
  const { scopeType, scopeId } = parseScopeKey(scopeKey.value)
  return scopes.value.find((s) => s.scopeType === scopeType && String(s.scopeId) === String(scopeId)) || null
})

const graphMode = computed(() => (taskId.value ? 'course' : 'class'))

const contextBanner = computed(() => {
  const parts = []
  if (currentScope.value?.label) parts.push(`班级范围：${currentScope.value.label}`)
  const task = tasks.value.find((t) => String(t.id) === taskId.value)
  if (task) parts.push(`任务：${taskOptionLabel(task)}`)
  return parts.join(' · ')
})

const buildPayload = computed(() => {
  if (taskId.value) {
    return { scopeType: 'course', scopeId: taskId.value }
  }
  const { scopeType, scopeId } = parseScopeKey(scopeKey.value)
  return { scopeType, scopeId }
})

const loadGraph = () => {
  if (taskId.value) return getKgCourseGraph({ taskId: taskId.value })
  const { scopeType, scopeId } = parseScopeKey(scopeKey.value)
  return getKgTeacherGraph({ scopeType, scopeId })
}

function taskOptionLabel(t) {
  const title = t.title || `任务 ${t.id}`
  return t.deadline ? `${title} · 截止 ${String(t.deadline).slice(0, 10)}` : title
}

async function loadScopes() {
  scopesLoading.value = true
  try {
    const res = await getKgTeacherScopes()
    scopes.value = res.success ? res.data?.scopes || [] : []
    applyInitialScopeSelection()
  } finally {
    scopesLoading.value = false
  }
}

function applyInitialScopeSelection() {
  const fromScopeType = route.query.scopeType
  const fromScopeId = route.query.scopeId
  if (fromScopeType && fromScopeId) {
    const key = `${fromScopeType}:${fromScopeId}`
    if (scopes.value.some((s) => scopeOptionKey(s) === key)) {
      scopeKey.value = key
      void loadTasksForScope(key)
      return
    }
  }

  const fromClassId = route.query.classId
  if (fromClassId != null && String(fromClassId).trim() !== '') {
    const id = String(fromClassId).trim()
    const match =
      scopes.value.find(
        (s) => s.scopeType === 'administrative_class' && String(s.scopeId) === id
      ) || scopes.value.find((s) => String(s.scopeId) === id)
    if (match) {
      scopeKey.value = scopeOptionKey(match)
      void loadTasksForScope(scopeKey.value)
      return
    }
  }

  if (!scopeKey.value && scopes.value.length === 1) {
    scopeKey.value = scopeOptionKey(scopes.value[0])
    void loadTasksForScope(scopeKey.value)
  }
}

async function loadTasksForScope(key) {
  const { scopeType, scopeId } = parseScopeKey(key)
  if (!scopeId) {
    tasks.value = []
    return
  }
  tasksLoading.value = true
  try {
    const res =
      scopeType === 'teaching_class'
        ? await getTasksByTeachingClass(scopeId)
        : await getTasksByClass(scopeId)
    tasks.value = res.success ? res.data || [] : []
    const fromQueryTask = route.query.taskId
    if (fromQueryTask && tasks.value.some((t) => String(t.id) === String(fromQueryTask))) {
      taskId.value = String(fromQueryTask)
    } else if (taskId.value && !tasks.value.some((t) => String(t.id) === taskId.value)) {
      taskId.value = ''
    }
  } finally {
    tasksLoading.value = false
  }
}

function onScopeChange(key) {
  taskId.value = ''
  void loadTasksForScope(key)
}

watch(
  () => [route.query.scopeType, route.query.scopeId, route.query.classId],
  () => {
    if (!scopes.value.length) return
    applyInitialScopeSelection()
  }
)

onMounted(() => {
  void loadScopes()
})
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
.kg-alert {
  margin-bottom: 16px;
  border-radius: 12px;
}
.kg-toolbar {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 14px 16px;
  margin-bottom: 12px;
}
.kg-toolbar-form {
  margin: 0;
  flex-wrap: wrap;
}
</style>
