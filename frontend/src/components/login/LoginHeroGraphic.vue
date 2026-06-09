<template>
  <div class="login-hero-graphic" aria-hidden="true">
    <svg
      class="login-hero-graphic__svg"
      viewBox="0 0 400 460"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="龙芯智训平台品牌主视觉"
    >
      <defs>
        <radialGradient id="lhg-ambient" cx="50%" cy="38%" r="68%">
          <stop offset="0%" stop-color="rgba(56, 189, 248, 0.18)" />
          <stop offset="42%" stop-color="rgba(37, 99, 235, 0.08)" />
          <stop offset="100%" stop-color="rgba(6, 14, 32, 0)" />
        </radialGradient>
        <radialGradient id="lhg-core-glow" cx="50%" cy="42%" r="58%">
          <stop offset="0%" stop-color="rgba(125, 211, 252, 0.28)" />
          <stop offset="50%" stop-color="rgba(56, 189, 248, 0.12)" />
          <stop offset="100%" stop-color="rgba(37, 99, 235, 0)" />
        </radialGradient>
        <radialGradient id="lhg-sphere" cx="50%" cy="38%" r="62%">
          <stop offset="0%" stop-color="rgba(32, 78, 148, 0.42)" />
          <stop offset="68%" stop-color="rgba(16, 48, 98, 0.72)" />
          <stop offset="100%" stop-color="rgba(10, 32, 72, 0.88)" />
        </radialGradient>
        <linearGradient id="lhg-sphere-edge" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="rgba(125, 211, 252, 0.32)" />
          <stop offset="100%" stop-color="rgba(59, 130, 246, 0.18)" />
        </linearGradient>
        <linearGradient id="lhg-panel" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="rgba(22, 58, 118, 0.62)" />
          <stop offset="100%" stop-color="rgba(10, 32, 72, 0.75)" />
        </linearGradient>
        <linearGradient id="lhg-stream-a" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="rgba(56, 189, 248, 0)" />
          <stop offset="45%" stop-color="rgba(125, 211, 252, 0.32)" />
          <stop offset="100%" stop-color="rgba(56, 189, 248, 0)" />
        </linearGradient>
        <linearGradient id="lhg-stream-b" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="rgba(34, 211, 238, 0)" />
          <stop offset="50%" stop-color="rgba(96, 165, 250, 0.26)" />
          <stop offset="100%" stop-color="rgba(37, 99, 235, 0)" />
        </linearGradient>
        <radialGradient id="lhg-vignette" cx="50%" cy="40%" r="72%">
          <stop offset="52%" stop-color="rgba(6, 14, 32, 0)" />
          <stop offset="88%" stop-color="rgba(6, 14, 32, 0.55)" />
          <stop offset="100%" stop-color="rgba(6, 14, 32, 0.92)" />
        </radialGradient>
        <linearGradient id="lhg-fade-top" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(6, 14, 32, 0.92)" />
          <stop offset="28%" stop-color="rgba(6, 14, 32, 0)" />
        </linearGradient>
        <pattern id="lhg-grid" width="32" height="32" patternUnits="userSpaceOnUse">
          <path
            d="M 32 0 L 0 0 0 32"
            fill="none"
            stroke="rgba(96, 165, 250, 0.05)"
            stroke-width="0.6"
          />
        </pattern>
      </defs>

      <g class="lhg-scene" transform="translate(200, 198) scale(1.42) translate(-200, -178)">
        <!-- 背景烘托层 -->
        <g class="lhg-bg">
          <rect x="-40" y="-60" width="480" height="520" fill="url(#lhg-ambient)" />
          <rect x="-40" y="-60" width="480" height="520" fill="url(#lhg-grid)" opacity="0.45" />
          <circle cx="200" cy="178" r="152" class="lhg-ripple lhg-ripple--1" />
          <circle cx="200" cy="178" r="118" class="lhg-ripple lhg-ripple--2" />
          <circle cx="200" cy="178" r="84" class="lhg-ripple lhg-ripple--3" />
          <circle cx="200" cy="178" r="54" class="lhg-ripple lhg-ripple--4" />
          <circle cx="72" cy="48" r="1.2" class="lhg-particle" />
          <circle cx="328" cy="38" r="1" class="lhg-particle" />
          <circle cx="360" cy="298" r="1.3" class="lhg-particle" />
          <circle cx="42" cy="312" r="1" class="lhg-particle" />
          <circle cx="168" cy="22" r="0.9" class="lhg-particle" />
          <circle cx="248" cy="18" r="0.8" class="lhg-particle" />
          <circle cx="292" cy="348" r="0.9" class="lhg-particle" />
          <circle cx="118" cy="128" r="0.7" class="lhg-particle" />
          <circle cx="308" cy="148" r="0.7" class="lhg-particle" />
          <path
            d="M 52 328 Q 138 278 200 258 Q 268 238 348 208"
            class="lhg-stream"
            stroke="url(#lhg-stream-a)"
          />
          <path
            d="M 68 48 Q 158 92 200 142 Q 252 198 328 258"
            class="lhg-stream"
            stroke="url(#lhg-stream-b)"
          />
          <path
            d="M 318 62 Q 258 128 200 162 Q 138 198 68 268"
            class="lhg-stream lhg-stream--faint"
          />
          <path
            d="M 120 28 Q 168 68 200 108 Q 232 148 288 188"
            class="lhg-stream lhg-stream--faint"
          />
        </g>

        <!-- 流动连线层 -->
        <g class="lhg-flow">
          <path d="M 200 178 Q 162 132 138 88" class="lhg-filament" />
          <path d="M 200 178 Q 242 128 278 72" class="lhg-filament" />
          <path d="M 200 178 Q 278 168 328 168" class="lhg-filament" />
          <path d="M 200 188 Q 258 238 298 288" class="lhg-filament" />
          <path d="M 200 188 Q 158 248 118 298" class="lhg-filament" />
          <path d="M 200 184 Q 128 198 68 198" class="lhg-filament" />
          <path d="M 200 168 Q 200 118 200 68" class="lhg-filament lhg-filament--bright" />
          <path d="M 200 192 Q 248 268 288 318" class="lhg-filament" />
          <circle cx="168" cy="142" r="1.5" class="lhg-spark" />
          <circle cx="236" cy="132" r="1.2" class="lhg-spark" />
          <circle cx="258" cy="198" r="1" class="lhg-spark" />
          <circle cx="128" cy="208" r="1" class="lhg-spark" />
          <circle cx="200" cy="98" r="1.4" class="lhg-spark" />
          <circle cx="224" cy="258" r="1" class="lhg-spark" />
          <circle cx="148" cy="178" r="1" class="lhg-spark" />
        </g>

        <!-- 中心聚焦层：圆形核心，克制亮度 -->
        <g class="lhg-core" transform="translate(200, 178)">
          <ellipse cx="0" cy="50" rx="68" ry="12" class="lhg-pedestal lhg-pedestal--far" />
          <ellipse cx="0" cy="45" rx="52" ry="9" class="lhg-pedestal lhg-pedestal--mid" />
          <ellipse cx="0" cy="41" rx="38" ry="7" class="lhg-pedestal lhg-pedestal--near" />
          <ellipse cx="0" cy="46" rx="24" ry="4" class="lhg-pedestal-glow" />
          <circle cx="0" cy="0" r="50" class="lhg-halo lhg-halo--outer" />
          <circle
            cx="0"
            cy="0"
            r="38"
            fill="url(#lhg-sphere)"
            stroke="url(#lhg-sphere-edge)"
            stroke-width="1"
            class="lhg-sphere"
          />
          <circle cx="0" cy="0" r="28" class="lhg-halo lhg-halo--inner" />
          <circle cx="0" cy="0" r="18" fill="url(#lhg-core-glow)" class="lhg-orb" />
          <circle cx="0" cy="0" r="5" class="lhg-orb-core" />
        </g>

        <!-- 周边协同层：仅图标 -->
        <g class="lhg-modules">
          <g transform="translate(182, 42)" opacity="0.88">
            <rect width="36" height="36" rx="10" class="lhg-panel" />
            <g transform="translate(10, 10)" class="lhg-glyph">
              <path d="M3 1h7v9H3z M5 0h3v1H5z M8 11v2" />
              <path d="M12 5h3v5h-3z M13.5 3.5v1.5" />
            </g>
          </g>
          <g transform="translate(48, 72)">
            <rect width="42" height="42" rx="11" class="lhg-panel lhg-panel--lg" />
            <g transform="translate(13, 13)" class="lhg-glyph">
              <rect x="1" y="1" width="14" height="14" rx="2" />
              <path d="M0 5h1M0 8h1M0 11h1M15 5h1M15 8h1M15 11h1M5 0v1M8 0v1M11 0v1M5 15v1M8 15v1M11 15v1" />
              <circle cx="8" cy="8" r="2.5" />
            </g>
          </g>
          <g transform="translate(308, 58)" opacity="0.92">
            <rect width="40" height="40" rx="11" class="lhg-panel lhg-panel--md" />
            <g transform="translate(12, 12)" class="lhg-glyph">
              <circle cx="4" cy="8" r="2.5" />
              <circle cx="12" cy="3" r="2" />
              <circle cx="12" cy="13" r="2" />
              <path d="M6 7 L10 4.5 M6 9 L10 12" />
            </g>
          </g>
          <g transform="translate(338, 158)" opacity="0.85">
            <rect width="34" height="34" rx="9" class="lhg-panel lhg-panel--sm" />
            <g transform="translate(9, 9)" class="lhg-glyph">
              <circle cx="8" cy="5" r="3" />
              <path d="M2 14c0-3 2.5-5 6-5s6 2 6 5" />
            </g>
          </g>
          <g transform="translate(302, 272)" opacity="0.9">
            <rect width="38" height="38" rx="10" class="lhg-panel" />
            <g transform="translate(11, 11)" class="lhg-glyph">
              <circle cx="5" cy="5" r="2.5" />
              <circle cx="11" cy="5" r="2.5" />
              <path d="M1 12c0-2 1.8-3.5 4-3.5s4 1.5 4 3.5M8 12c0-2 1.8-3.5 4-3.5" />
            </g>
          </g>
          <g transform="translate(178, 318)" opacity="0.82">
            <rect width="36" height="36" rx="10" class="lhg-panel" />
            <g transform="translate(10, 10)" class="lhg-glyph">
              <path d="M3 1h7v11H3z M5 0h3v1H5z" />
              <path d="M5 5h4M5 7.5h4M5 10h2.5" />
            </g>
          </g>
          <g transform="translate(58, 248)" opacity="0.88">
            <rect width="36" height="36" rx="10" class="lhg-panel" />
            <g transform="translate(10, 10)" class="lhg-glyph">
              <path d="M2 3 L6 8 L2 13" />
              <path d="M10 3 L14 8 L10 13" />
              <path d="M9 2 L7 14" opacity="0.45" />
            </g>
          </g>
          <g transform="translate(32, 158)" opacity="0.9">
            <rect width="38" height="38" rx="10" class="lhg-panel lhg-panel--md" />
            <g transform="translate(11, 11)" class="lhg-glyph">
              <ellipse cx="8" cy="4" rx="6" ry="2.5" />
              <path d="M2 4v7c0 1.6 2.7 3 6 3s6-1.4 6-3V4" />
              <path d="M2 7.5c0 1.6 2.7 3 6 3" />
            </g>
          </g>
          <g transform="translate(108, 338)" opacity="0.78">
            <rect width="32" height="32" rx="9" class="lhg-panel lhg-panel--sm" />
            <g transform="translate(8, 8)" class="lhg-glyph">
              <path d="M8 1 L13 3.5v4.5c0 3.5-5 6-5 6s-5-2.5-5-6V3.5z" />
              <path d="M5.5 7l1.8 1.8L10.5 5.5" />
            </g>
          </g>
        </g>
      </g>

      <!-- 边缘渐隐，融入页面背景 -->
      <rect width="400" height="460" fill="url(#lhg-vignette)" class="lhg-vignette-overlay" />
      <rect width="400" height="460" fill="url(#lhg-fade-top)" class="lhg-vignette-overlay" />
    </svg>
  </div>
</template>

<script setup>
</script>

<style scoped>
.login-hero-graphic {
  width: 100%;
  height: auto;
  contain: layout paint;
}

.login-hero-graphic__svg {
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
}

.lhg-ripple {
  fill: none;
  stroke: rgba(59, 130, 246, 0.06);
  stroke-width: 0.8;
}

.lhg-ripple--2 {
  stroke: rgba(96, 165, 250, 0.08);
}

.lhg-ripple--3 {
  stroke: rgba(125, 211, 252, 0.09);
}

.lhg-ripple--4 {
  stroke: rgba(56, 189, 248, 0.1);
}

.lhg-particle {
  fill: rgba(125, 211, 252, 0.28);
}

.lhg-stream {
  fill: none;
  stroke-width: 1;
}

.lhg-stream--faint {
  stroke: rgba(59, 130, 246, 0.07);
}

.lhg-filament {
  fill: none;
  stroke: rgba(96, 165, 250, 0.12);
  stroke-width: 0.8;
}

.lhg-filament--bright {
  stroke: rgba(125, 211, 252, 0.2);
  stroke-width: 0.9;
}

.lhg-spark {
  fill: rgba(56, 189, 248, 0.38);
}

.lhg-pedestal {
  fill: none;
  stroke: rgba(56, 189, 248, 0.14);
  stroke-width: 0.9;
}

.lhg-pedestal--mid {
  stroke: rgba(96, 165, 250, 0.2);
}

.lhg-pedestal--near {
  stroke: rgba(96, 165, 250, 0.18);
}

.lhg-pedestal-glow {
  fill: rgba(56, 189, 248, 0.08);
}

.lhg-halo--outer {
  fill: none;
  stroke: rgba(59, 130, 246, 0.08);
  stroke-width: 0.9;
}

.lhg-halo--inner {
  fill: none;
  stroke: rgba(96, 165, 250, 0.1);
  stroke-width: 0.7;
}

.lhg-sphere {
  opacity: 0.95;
}

.lhg-orb {
  opacity: 0.75;
}

.lhg-orb-core {
  fill: rgba(186, 230, 253, 0.42);
}

.lhg-panel {
  fill: url(#lhg-panel);
  stroke: rgba(96, 165, 250, 0.2);
  stroke-width: 0.9;
}

.lhg-panel--lg {
  stroke: rgba(125, 211, 252, 0.3);
}

.lhg-panel--md {
  stroke: rgba(96, 165, 250, 0.24);
}

.lhg-panel--sm {
  stroke: rgba(59, 130, 246, 0.18);
}

.lhg-glyph {
  fill: none;
  stroke: rgba(186, 230, 253, 0.78);
  stroke-width: 1.15;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.lhg-vignette-overlay {
  pointer-events: none;
}

@media (max-width: 1100px) {
  .login-hero-graphic {
    display: none;
  }
}
</style>
