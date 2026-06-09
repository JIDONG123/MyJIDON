import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget = env.VITE_PROXY_TARGET || 'http://localhost:3000'

  return {
    plugins: [vue()],
    build: {
      chunkSizeWarningLimit: 1600,
    },
    // 仅本地开发：npm run dev（5173 热更新 + 代理）
    server: {
      port: 5173,
      proxy: {
        '/api': { target: proxyTarget, changeOrigin: true },
        '/uploads': { target: proxyTarget, changeOrigin: true },
        '/socket.io': { target: proxyTarget, changeOrigin: true, ws: true },
      },
    },
    // 生产构建 dist 由 Nginx 托管，不使用 preview 代理
    preview: {
      port: 5173,
      host: true,
    },
  }
})
