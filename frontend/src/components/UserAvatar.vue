<template>
  <div
    class="user-avatar"
    :class="{ 'user-avatar--has-img': !!displaySrc }"
    :style="{ width: size + 'px', height: size + 'px', fontSize: Math.round(size * 0.38) + 'px' }"
  >
    <img v-if="displaySrc" :src="displaySrc" alt="" class="user-avatar__img" @error="imgErr = true" />
    <span v-else class="user-avatar__fallback">{{ initial }}</span>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  src: { type: String, default: '' },
  name: { type: String, default: '' },
  size: { type: Number, default: 40 },
})

const imgErr = ref(false)

watch(
  () => props.src,
  () => {
    imgErr.value = false
  }
)

const displaySrc = computed(() => {
  if (!props.src || imgErr.value) return ''
  return props.src
})

const initial = computed(() => {
  const n = props.name != null && props.name !== '' ? String(props.name).trim() : ''
  if (!n) return '?'
  return n.slice(0, 1).toUpperCase()
})
</script>

<style scoped>
.user-avatar {
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #0f766e 0%, #1677ff 55%, #38bdf8 100%);
  color: #fff;
  font-weight: 700;
  letter-spacing: -0.02em;
  box-shadow: 0 4px 14px rgba(22, 119, 255, 0.22);
  transition:
    transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1),
    box-shadow 0.3s ease;
}

.user-avatar--has-img {
  background: #e8ecf4;
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.12);
}

.user-avatar:hover {
  transform: scale(1.06);
  box-shadow: 0 8px 24px rgba(22, 119, 255, 0.28);
}

.user-avatar--has-img:hover {
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.15);
}

.user-avatar__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.user-avatar__fallback {
  line-height: 1;
  user-select: none;
}
</style>
