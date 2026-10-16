import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'

export default defineConfig({
  plugins: [uni()],
  // Vite does not read manifest.h5.devServer. Keep H5 API requests same-origin.
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080', changeOrigin: true,
        configure(proxy) { proxy.on('proxyReq', (request) => request.removeHeader('origin')) },
      },
    },
  },
})
