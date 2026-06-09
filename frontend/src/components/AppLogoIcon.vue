<template>
  <svg
    class="app-logo-icon"
    :width="size"
    :height="size"
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    :aria-label="title"
  >
    <title v-if="title">{{ title }}</title>

    <!-- 轨道（后侧） -->
    <ellipse
      cx="32"
      cy="36"
      rx="26"
      ry="9"
      stroke="url(#sg-orbit)"
      stroke-width="2"
      opacity="0.45"
    />

    <!-- 文档主体 -->
    <rect x="17" y="11" width="30" height="38" rx="5" fill="url(#sg-doc)" />
    <path d="M39 11h8v8h-8V11Z" fill="#7dd3fc" />
    <path d="M39 11l8 8H39V11Z" fill="#38bdf8" />

    <!-- 文档内文行 -->
    <rect x="21" y="19" width="16" height="2.2" rx="1.1" fill="rgba(255,255,255,0.55)" />
    <rect x="21" y="24" width="20" height="2.2" rx="1.1" fill="rgba(255,255,255,0.4)" />
    <rect x="21" y="29" width="14" height="2.2" rx="1.1" fill="rgba(255,255,255,0.35)" />
    <rect x="21" y="34" width="18" height="2.2" rx="1.1" fill="rgba(255,255,255,0.3)" />

    <!-- 核对标记 -->
    <circle cx="22" cy="44" r="7" fill="url(#sg-check-bg)" />
    <path
      d="M19.2 44.2l2.1 2.1 4.8-5.2"
      stroke="#fff"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />

    <!-- AI 角标 -->
    <rect x="35" y="38" width="20" height="13" rx="4" fill="url(#sg-ai)" />
    <path
      d="M39.5 47.2h2.1l1.4-4.6 1.4 4.6h2.1l-2.6-7.4h-1.8l-2.6 7.4Z"
      fill="#fff"
    />
    <path
      d="M49.2 42.8l1.1 3.2 1.1-3.2h1.6l-1.9 5.2h-2l-1.9-5.2h1.6Z"
      fill="#fff"
    />

    <!-- 轨道节点 -->
    <circle cx="56" cy="35" r="3.2" fill="#3b82f6" />
    <circle cx="8" cy="37" r="2.6" fill="#0ea5e9" opacity="0.85" />

  <!-- 轨道（前侧高光） -->
    <ellipse
      cx="32"
      cy="36"
      rx="26"
      ry="9"
      stroke="url(#sg-orbit-front)"
      stroke-width="1.5"
      opacity="0.7"
    />

    <defs>
      <linearGradient id="sg-doc" x1="17" y1="11" x2="47" y2="49" gradientUnits="userSpaceOnUse">
        <stop stop-color="#1e3a8a" />
        <stop offset="0.55" stop-color="#2563eb" />
        <stop offset="1" stop-color="#38bdf8" />
      </linearGradient>
      <linearGradient id="sg-ai" x1="35" y1="38" x2="55" y2="51" gradientUnits="userSpaceOnUse">
        <stop stop-color="#22d3ee" />
        <stop offset="1" stop-color="#2563eb" />
      </linearGradient>
      <linearGradient id="sg-check-bg" x1="15" y1="37" x2="29" y2="51" gradientUnits="userSpaceOnUse">
        <stop stop-color="#38bdf8" />
        <stop offset="1" stop-color="#0ea5e9" />
      </linearGradient>
      <linearGradient id="sg-orbit" x1="6" y1="36" x2="58" y2="36" gradientUnits="userSpaceOnUse">
        <stop stop-color="#38bdf8" stop-opacity="0" />
        <stop offset="0.5" stop-color="#60a5fa" />
        <stop offset="1" stop-color="#38bdf8" stop-opacity="0" />
      </linearGradient>
      <linearGradient id="sg-orbit-front" x1="6" y1="36" x2="58" y2="36" gradientUnits="userSpaceOnUse">
        <stop stop-color="#7dd3fc" stop-opacity="0.2" />
        <stop offset="0.5" stop-color="#bae6fd" />
        <stop offset="1" stop-color="#7dd3fc" stop-opacity="0.2" />
      </linearGradient>
    </defs>
  </svg>
</template>

<script setup>
defineProps({
  size: {
    type: [Number, String],
    default: 40,
  },
  title: {
    type: String,
    default: '智能实训作业批改',
  },
})
</script>

<style scoped>
.app-logo-icon {
  display: block;
  flex-shrink: 0;
}
</style>
