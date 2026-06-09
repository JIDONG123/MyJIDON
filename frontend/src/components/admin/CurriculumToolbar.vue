<template>
  <div class="tab-toolbar">
    <div class="toolbar-left">
      <el-input
        v-if="showSearch"
        :model-value="keyword"
        placeholder="搜索关键词"
        clearable
        style="width: 200px"
        @update:model-value="$emit('update:keyword', $event)"
      />
      <el-select
        v-if="showCollege"
        :model-value="college"
        clearable
        placeholder="学院筛选"
        style="width: 160px"
        @update:model-value="$emit('update:college', $event)"
      >
        <el-option v-for="c in collegeOptions" :key="c" :label="c" :value="c" />
      </el-select>
      <el-select
        v-if="showMajor"
        :model-value="majorId"
        clearable
        filterable
        placeholder="专业筛选"
        style="width: 160px"
        @update:model-value="$emit('update:majorId', $event)"
      >
        <el-option v-for="m in majorOptions" :key="m.id" :label="m.name" :value="m.id" />
      </el-select>
      <el-select
        v-if="showCourse"
        :model-value="courseId"
        clearable
        filterable
        placeholder="课程筛选"
        style="width: 180px"
        @update:model-value="$emit('update:courseId', $event)"
      >
        <el-option v-for="c in courseOptions" :key="c.id" :label="c.course_name" :value="c.id" />
      </el-select>
      <el-select
        v-if="showTerm"
        :model-value="termId"
        clearable
        filterable
        placeholder="学期筛选"
        style="width: 160px"
        @update:model-value="$emit('update:termId', $event)"
      >
        <el-option v-for="t in termOptions" :key="t.id" :label="t.name" :value="t.id" />
      </el-select>
      <el-select
        v-if="showTeachingClass"
        :model-value="teachingClassId"
        clearable
        filterable
        placeholder="教学班筛选"
        style="width: 200px"
        @update:model-value="$emit('update:teachingClassId', $event)"
      >
        <el-option v-for="tc in teachingClassOptions" :key="tc.id" :label="tc.class_name" :value="tc.id" />
      </el-select>
      <el-select
        v-if="showStatus"
        :model-value="status"
        clearable
        placeholder="状态筛选"
        style="width: 120px"
        @update:model-value="$emit('update:status', $event)"
      >
        <el-option label="启用" value="1" />
        <el-option label="停用" value="0" />
      </el-select>
    </div>
    <div v-if="addLabel" class="toolbar-right">
      <el-button type="primary" @click="$emit('add')">{{ addLabel }}</el-button>
    </div>
  </div>
</template>

<script setup>
defineProps({
  keyword: { type: String, default: '' },
  college: { type: String, default: '' },
  majorId: { type: [Number, String], default: null },
  courseId: { type: [Number, String], default: null },
  termId: { type: [Number, String], default: null },
  teachingClassId: { type: [Number, String], default: null },
  status: { type: String, default: '' },
  collegeOptions: { type: Array, default: () => [] },
  majorOptions: { type: Array, default: () => [] },
  courseOptions: { type: Array, default: () => [] },
  termOptions: { type: Array, default: () => [] },
  teachingClassOptions: { type: Array, default: () => [] },
  showSearch: { type: Boolean, default: true },
  showCollege: Boolean,
  showMajor: Boolean,
  showCourse: Boolean,
  showTerm: Boolean,
  showTeachingClass: Boolean,
  showStatus: Boolean,
  addLabel: { type: String, default: '' },
})

defineEmits([
  'add',
  'update:keyword',
  'update:college',
  'update:majorId',
  'update:courseId',
  'update:termId',
  'update:teachingClassId',
  'update:status',
])
</script>

<style scoped>
.tab-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
  padding: 12px 14px;
  background: #f9fafb;
  border: 1px solid #eef1f6;
  border-radius: 10px;
}

.toolbar-left {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.toolbar-right {
  flex-shrink: 0;
}
</style>
