import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const resendProxy = {
    target: 'https://api.resend.com',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api\/resend/, ''),
    configure: (proxy) => {
      proxy.on('proxyReq', (proxyReq) => {
        if (env.VITE_RESEND_API_KEY) {
          proxyReq.setHeader('Authorization', `Bearer ${env.VITE_RESEND_API_KEY}`)
        }
      })
    },
  }

  return {
    plugins: [react()],
    server: { proxy: { '/api/resend': resendProxy } },
    preview: { proxy: { '/api/resend': resendProxy } },
  }
})
