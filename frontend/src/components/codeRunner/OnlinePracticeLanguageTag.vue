<template>
  <el-tag size="small" effect="plain" :type="tagType">{{ label }}</el-tag>
</template>

<script setup>
import { computed } from 'vue'
import { languageTagType, langLabelSafe } from '../../utils/onlinePracticeDisplay'

const props = defineProps({
  language: { type: String, default: '' },
})

const label = computed(() => langLabelSafe(props.language))
const tagType = computed(() => languageTagType(props.language))
</script>
