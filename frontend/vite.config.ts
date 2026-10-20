import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())
  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: env.VITE_API_TARGET || 'http://localhost:8080',
          changeOrigin: true,
          // 浏览器请求的是同源 /api；开发代理不把临时 Vite 端口带入后端 CORS 校验。
          configure(proxy) {
            proxy.on('proxyReq', (request, incoming) => {
              const origin = incoming.headers.origin
              if (!origin) return
              try {
                const protocol = 'encrypted' in incoming.socket && incoming.socket.encrypted ? 'https:' : 'http:'
                if (new URL(origin).origin === `${protocol}//${incoming.headers.host}`) request.removeHeader('origin')
              } catch {
                // 非同源或无效 Origin 原样交由后端判断。
              }
            })
          },
        },
      },
    },
  }
})
