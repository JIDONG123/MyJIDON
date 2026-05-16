<template>
  <div class="page-qb">
    <header class="page-head">
      <h1 class="page-title">在线考试</h1>
      <p class="page-desc">
        请在规定时间窗内进入作答。考试未开始时无法作答；进行中为全屏作答，切屏次数过多可能触发自动交卷。成绩未到公布时间不可查询。
      </p>
    </header>
    <el-card shadow="never" class="panel-card">
      <div class="toolbar">
        <el-input
          v-model="searchKey"
          placeholder="按考试名称搜索"
          clearable
          class="search-input"
          @clear="load"
          @keyup.enter="load"
        />
        <el-button type="primary" @click="load">查询</el-button>
      </div>
      <el-table v-loading="loading" :data="rows" border stripe>
        <el-table-column prop="title" label="考试" min-width="160" />
        <el-table-column label="开始" width="178">
          <template #default="{ row }">{{ formatDateTime(row.start_at) }}</template>
        </el-table-column>
        <el-table-column label="结束" width="178">
          <template #default="{ row }">{{ formatDateTime(row.end_at) }}</template>
        </el-table-column>
        <el-table-column label="阶段" width="120" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="qbExamPhaseTagType(row.phase?.phase)">{{ qbExamPhaseLabel(row.phase?.phase) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" align="right">
          <template #default="{ row }">
            <el-button
              v-if="row.phase?.phase === 'active' && !row.submitted_at"
              type="primary"
              size="small"
              @click="$router.push(`/student/qbank/exams/${row.id}/take`)"
            >
              进入考试
            </el-button>
            <el-button
              v-else-if="row.phase?.phase === 'active' && row.submitted_at"
              type="success"
              size="small"
              plain
              @click="$router.push(`/student/qbank/exams/${row.id}/take`)"
            >
              查看成绩
            </el-button>
            <el-tooltip v-else-if="row.phase?.phase === 'upcoming'" content="考试未开始，无法进入作答" placement="top">
              <span class="btn-wrap">
                <el-button size="small" disabled>未开始</el-button>
              </span>
            </el-tooltip>
            <el-button
              v-else-if="row.phase?.phase === 'ended' && row.submitted_at"
              size="small"
              @click="$router.push(`/student/qbank/exams/${row.id}/take`)"
            >
              查看成绩
            </el-button>
            <el-tooltip v-else-if="row.phase?.phase === 'ended' && !row.submitted_at" content="未参加本场考试" placement="top">
              <span class="btn-wrap">
                <el-button size="small" disabled>已结束</el-button>
              </span>
            </el-tooltip>
            <el-button v-else size="small" @click="$router.push(`/student/qbank/exams/${row.id}/take`)">查看</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { listStudentExams } from '../../api/qb'
import { qbExamPhaseLabel, qbExamPhaseTagType } from '../../utils/qbLabels'
import { formatDateTime } from '../../utils/format'
import { useRtOnDomains } from '../../composables/useRtOnDomains'

const loading = ref(false)
const rows = ref([])
const searchKey = ref('')

const load = async () => {
  loading.value = true
  try {
    const q = searchKey.value.trim()
    const res = await listStudentExams(q ? { q } : {})
    if (res.success) rows.value = res.data || []
  } finally {
    loading.value = false
  }
}

onMounted(load)

useRtOnDomains(['qb_exams', 'scores'], () => {
  void load()
})
</script>

<style scoped>
.page-qb {
  max-width: 1100px;
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
  line-height: 1.6;
}
.panel-card {
  border-radius: var(--sg-radius-lg);
  border: 1px solid var(--sg-border);
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-bottom: 14px;
}
.search-input {
  max-width: 280px;
}
.btn-wrap {
  display: inline-block;
}
</style>
