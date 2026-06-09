<template>
  <el-drawer
    v-model="visible"
    title="企业导师授权"
    size="720px"
    destroy-on-close
    class="ent-auth-drawer"
    @closed="onClosed"
  >
    <div v-if="mentor" class="ent-auth-drawer__mentor">
      <div class="mentor-card">
        <div class="mentor-card__main">
          <span class="mentor-card__name">{{ mentor.real_name }}</span>
          <span class="mentor-card__username">@{{ mentor.username }}</span>
        </div>
        <div class="mentor-card__meta">
          <span>{{ mentor.department || '未填写企业 / 部门' }}</span>
          <el-tag
            :type="mentor.is_disabled ? 'danger' : 'success'"
            effect="plain"
            size="small"
          >
            {{ mentor.is_disabled ? '已禁用' : '已启用' }}
          </el-tag>
        </div>
      </div>
    </div>

    <el-skeleton v-if="loading" animated :rows="8" />

    <template v-else>
      <el-tabs v-model="activeTab" class="ent-auth-tabs">
        <el-tab-pane label="行政班授权" name="admin">
          <div class="tab-toolbar">
            <el-input
              v-model="adminKeyword"
              placeholder="搜索班级名称"
              clearable
              class="tab-toolbar__search"
            >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
            </el-input>
            <span class="tab-toolbar__hint">已选 {{ selectedClassIds.length }} 个</span>
          </div>
          <el-table
            ref="adminTableRef"
            :data="filteredAdminClasses"
            max-height="420"
            size="default"
            class="auth-table"
            @selection-change="onAdminSelectionChange"
          >
            <el-table-column type="selection" width="48" :reserve-selection="true" />
            <el-table-column prop="class_name" label="班级名称" min-width="140" show-overflow-tooltip />
            <el-table-column label="专业 / 年级" min-width="140" show-overflow-tooltip>
              <template #default="{ row }">
                {{ [row.major, row.grade].filter(Boolean).join(' · ') || '—' }}
              </template>
            </el-table-column>
            <el-table-column label="授权状态" width="96" align="center">
              <template #default="{ row }">
                <el-tag
                  :type="selectedClassIds.includes(row.id) ? 'success' : 'info'"
                  effect="plain"
                  size="small"
                >
                  {{ selectedClassIds.includes(row.id) ? '已授权' : '未授权' }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="教学班授权" name="teaching">
          <div class="tab-toolbar">
            <el-input
              v-model="teachingKeyword"
              placeholder="搜索班级名称"
              clearable
              class="tab-toolbar__search"
            >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
            </el-input>
            <span class="tab-toolbar__hint">已选 {{ selectedTeachingClassIds.length }} 个</span>
          </div>
          <el-table
            ref="teachingTableRef"
            :data="filteredTeachingClasses"
            max-height="420"
            size="default"
            class="auth-table"
            @selection-change="onTeachingSelectionChange"
          >
            <el-table-column type="selection" width="48" :reserve-selection="true" />
            <el-table-column prop="class_name" label="班级名称" min-width="120" show-overflow-tooltip />
            <el-table-column prop="course_name" label="课程" min-width="120" show-overflow-tooltip />
            <el-table-column prop="term_name" label="学期" width="120" show-overflow-tooltip />
            <el-table-column label="授权状态" width="96" align="center">
              <template #default="{ row }">
                <el-tag
                  :type="selectedTeachingClassIds.includes(row.id) ? 'success' : 'info'"
                  effect="plain"
                  size="small"
                >
                  {{ selectedTeachingClassIds.includes(row.id) ? '已授权' : '未授权' }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </template>

    <template #footer>
      <div class="ent-auth-drawer__footer">
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存授权</el-button>
      </div>
    </template>
  </el-drawer>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { Search } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import {
  getEnterpriseUserClasses,
  getEnterpriseUserTeachingClasses,
  setEnterpriseUserClasses,
  setEnterpriseUserTeachingClasses,
} from '../../api/user'
import { getAllClasses } from '../../api/class'
import { listTeachingClasses } from '../../api/teachingClass'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  mentor: { type: Object, default: null },
})

const emit = defineEmits(['update:modelValue', 'saved'])

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const loading = ref(false)
const saving = ref(false)
const activeTab = ref('admin')
const adminKeyword = ref('')
const teachingKeyword = ref('')
const allClasses = ref([])
const allTeachingClasses = ref([])
const selectedClassIds = ref([])
const selectedTeachingClassIds = ref([])
const adminTableRef = ref(null)
const teachingTableRef = ref(null)
const syncingSelection = ref(false)

const filteredAdminClasses = computed(() => {
  const kw = adminKeyword.value.trim().toLowerCase()
  if (!kw) return allClasses.value
  return allClasses.value.filter((c) => (c.class_name || '').toLowerCase().includes(kw))
})

const filteredTeachingClasses = computed(() => {
  const kw = teachingKeyword.value.trim().toLowerCase()
  if (!kw) return allTeachingClasses.value
  return allTeachingClasses.value.filter((c) => {
    const hay = [c.class_name, c.course_name, c.term_name].filter(Boolean).join(' ').toLowerCase()
    return hay.includes(kw)
  })
})

const syncAdminTableSelection = async () => {
  await nextTick()
  const table = adminTableRef.value
  if (!table) return
  syncingSelection.value = true
  table.clearSelection()
  for (const row of filteredAdminClasses.value) {
    if (selectedClassIds.value.includes(row.id)) {
      table.toggleRowSelection(row, true)
    }
  }
  syncingSelection.value = false
}

const syncTeachingTableSelection = async () => {
  await nextTick()
  const table = teachingTableRef.value
  if (!table) return
  syncingSelection.value = true
  table.clearSelection()
  for (const row of filteredTeachingClasses.value) {
    if (selectedTeachingClassIds.value.includes(row.id)) {
      table.toggleRowSelection(row, true)
    }
  }
  syncingSelection.value = false
}

watch(filteredAdminClasses, () => {
  if (visible.value && activeTab.value === 'admin') syncAdminTableSelection()
})

watch(filteredTeachingClasses, () => {
  if (visible.value && activeTab.value === 'teaching') syncTeachingTableSelection()
})

watch(activeTab, (tab) => {
  if (tab === 'admin') syncAdminTableSelection()
  else syncTeachingTableSelection()
})

const loadData = async () => {
  if (!props.mentor?.id) return
  loading.value = true
  adminKeyword.value = ''
  teachingKeyword.value = ''
  activeTab.value = 'admin'
  try {
    const [cRes, aRes, tcRes, tRes] = await Promise.all([
      getEnterpriseUserClasses(props.mentor.id),
      getAllClasses(),
      getEnterpriseUserTeachingClasses(props.mentor.id),
      listTeachingClasses(),
    ])
    allClasses.value = aRes.success ? aRes.data || [] : []
    allTeachingClasses.value = tRes.success ? tRes.data || [] : []
    selectedClassIds.value = cRes.success ? (cRes.data || []).map((x) => x.id) : []
    selectedTeachingClassIds.value = tcRes.success ? (tcRes.data || []).map((x) => x.id) : []
    await syncAdminTableSelection()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || e?.message || '加载授权数据失败')
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.modelValue, props.mentor?.id],
  ([open]) => {
    if (open && props.mentor?.id) loadData()
  }
)

const onAdminSelectionChange = (selection) => {
  if (syncingSelection.value) return
  const visibleIds = new Set(filteredAdminClasses.value.map((r) => r.id))
  const selectedVisible = selection.map((r) => r.id)
  const kept = selectedClassIds.value.filter((id) => !visibleIds.has(id))
  selectedClassIds.value = [...kept, ...selectedVisible]
}

const onTeachingSelectionChange = (selection) => {
  if (syncingSelection.value) return
  const visibleIds = new Set(filteredTeachingClasses.value.map((r) => r.id))
  const selectedVisible = selection.map((r) => r.id)
  const kept = selectedTeachingClassIds.value.filter((id) => !visibleIds.has(id))
  selectedTeachingClassIds.value = [...kept, ...selectedVisible]
}

const save = async () => {
  if (!props.mentor?.id) return
  saving.value = true
  try {
    const [cRes, tcRes] = await Promise.all([
      setEnterpriseUserClasses(props.mentor.id, selectedClassIds.value),
      setEnterpriseUserTeachingClasses(props.mentor.id, selectedTeachingClassIds.value),
    ])
    if (cRes.success && tcRes.success) {
      ElMessage.success('授权范围已更新')
      visible.value = false
      emit('saved')
    } else {
      ElMessage.error(cRes.message || tcRes.message || '保存失败')
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

const onClosed = () => {
  allClasses.value = []
  allTeachingClasses.value = []
  selectedClassIds.value = []
  selectedTeachingClassIds.value = []
}
</script>

<style scoped>
.ent-auth-drawer__mentor {
  margin-bottom: 16px;
}

.mentor-card {
  padding: 14px 16px;
  background: #f8fafc;
  border: 1px solid #e8edf3;
  border-radius: 10px;
}

.mentor-card__main {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 6px;
}

.mentor-card__name {
  font-size: 16px;
  font-weight: 600;
  color: #0f172a;
}

.mentor-card__username {
  font-size: 13px;
  color: #64748b;
}

.mentor-card__meta {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: #64748b;
}

.tab-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.tab-toolbar__search {
  flex: 1;
  max-width: 320px;
}

.tab-toolbar__hint {
  font-size: 13px;
  color: #64748b;
}

.auth-table {
  --el-table-border-color: #eef2f7;
  --el-table-header-bg-color: #f8fafc;
}

.ent-auth-drawer__footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
