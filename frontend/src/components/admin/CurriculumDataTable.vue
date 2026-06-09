<template>
  <div class="table-wrap">
    <el-table
      v-loading="loading"
      :data="rows"
      border
      stripe
      class="reg-table"
      style="width: 100%"
    >
      <slot />
    </el-table>
    <div v-if="!loading && !rows?.length" class="table-empty">{{ emptyText }}</div>
    <div class="table-pagination">
      <el-pagination
        background
        layout="total, prev, pager, next, sizes"
        :total="total || 0"
        :page-size="pageSize"
        :current-page="page"
        :page-sizes="[10, 20, 50]"
        @update:current-page="$emit('update:page', $event)"
        @update:page-size="$emit('update:pageSize', $event)"
      />
    </div>
  </div>
</template>

<script setup>
defineProps({
  rows: { type: Array, default: () => [] },
  loading: Boolean,
  emptyText: { type: String, default: '暂无数据' },
  total: { type: Number, default: 0 },
  page: { type: Number, default: 1 },
  pageSize: { type: Number, default: 10 },
})

defineEmits(['update:page', 'update:pageSize'])
</script>

<style scoped>
.table-wrap {
  position: relative;
}

.reg-table :deep(.el-table__header th) {
  background: #f3f4f6 !important;
  color: #374151;
  font-weight: 600;
  font-size: 13px;
}

.reg-table :deep(.el-table__body tr:hover > td) {
  background: #eef4ff !important;
}

.table-empty {
  text-align: center;
  padding: 32px 16px;
  color: #9ca3af;
  font-size: 14px;
}

.table-pagination {
  display: flex;
  justify-content: flex-end;
  padding: 14px 4px 4px;
}
</style>
