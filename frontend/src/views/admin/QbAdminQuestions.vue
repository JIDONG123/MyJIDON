<template>
  <div class="page-qb-admin">
    <header class="page-head">
      <h1 class="page-title">题库监管</h1>
      <p class="page-desc">管理员查看全平台教师题库条目，可按教师、题型与关键词筛选。</p>
    </header>

    <el-card shadow="never" class="panel-card">
      <div class="toolbar-row">
        <el-input-number v-model="filterTeacherId" :min="1" placeholder="教师用户 ID" controls-position="right" clearable />
        <el-select v-model="filterType" placeholder="题型" clearable style="width: 140px">
          <el-option label="单选" value="single" />
          <el-option label="多选" value="multi" />
          <el-option label="判断" value="judge" />
          <el-option label="填空" value="fill" />
          <el-option label="简答" value="short" />
          <el-option label="编程" value="code" />
        </el-select>
        <el-input v-model="filterQ" placeholder="题干 / 课程标签" clearable style="width: 220px" @keyup.enter="load" />
        <el-button type="primary" @click="load">查询</el-button>
      </div>
      <el-table v-loading="loading" :data="rows" border stripe class="qb-table admin-q-table" style="width: 100%; margin-top: 16px">
        <el-table-column label="序号" width="64" align="center">
          <template #default="{ $index }">{{ (page - 1) * pageSize + $index + 1 }}</template>
        </el-table-column>
        <el-table-column label="题库ID" width="88" align="center">
          <template #default="{ row }">
            <el-tooltip content="数据库主键，全平台唯一、连续递增" placement="top">
              <span class="col-id">{{ row.id }}</span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column prop="teacher_id" label="教师ID" width="88" />
        <el-table-column label="教师" min-width="140">
          <template #default="{ row }">
            {{ row.teacher_name || '—' }} <span class="muted">({{ row.teacher_username || '' }})</span>
          </template>
        </el-table-column>
        <el-table-column label="题型" width="100" align="center">
          <template #default="{ row }">
            <el-tag size="small" type="primary" effect="plain">{{ qbTypeLabel(row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="stem" label="题干" min-width="220" show-overflow-tooltip />
        <el-table-column prop="default_score" label="默认分" width="88" align="right" />
        <el-table-column label="难度" width="88" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="qbDifficultyTagType(row.difficulty)" effect="light">{{ qbDifficultyLabel(row.difficulty) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="178">
          <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
        </el-table-column>
      </el-table>
      <div class="pager">
        <el-pagination
          layout="prev, pager, next, total"
          :total="total"
          :page-size="pageSize"
          :current-page="page"
          @current-change="onPage"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { listAdminQuestions } from '../../api/qb'
import { qbDifficultyLabel, qbDifficultyTagType, qbTypeLabel } from '../../utils/qbLabels'
import { formatDateTime } from '../../utils/format'

const rows = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const loading = ref(false)
const filterTeacherId = ref(undefined)
const filterType = ref('')
const filterQ = ref('')

const load = async () => {
  loading.value = true
  try {
    const params = { page: page.value, pageSize: pageSize.value, q: filterQ.value || undefined, type: filterType.value || undefined }
    if (filterTeacherId.value) params.teacherId = filterTeacherId.value
    const res = await listAdminQuestions(params)
    if (res.success) {
      rows.value = res.data || []
      total.value = res.total || 0
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

const onPage = (p) => {
  page.value = p
  load()
}

onMounted(() => {
  load()
})
</script>

<style scoped>
.page-qb-admin {
  max-width: 1400px;
}
.page-head {
  margin-bottom: 16px;
}
.page-title {
  margin: 0 0 6px;
  font-size: 22px;
  font-weight: 600;
}
.page-desc {
  margin: 0;
  font-size: 14px;
  color: var(--sg-text-secondary);
}
.panel-card {
  border-radius: var(--sg-radius-lg);
  border: 1px solid var(--sg-border);
}
.toolbar-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
}
.pager {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
.muted {
  color: var(--sg-text-secondary);
  font-size: 12px;
}
.admin-q-table :deep(.col-id) {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--sg-text-secondary);
}
</style>
