import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { createApiMiddleware } from './server/api.mjs'

// 模型调用放在 Vite 中间件里，避免前端直连暴露 API Key，也省掉第二个进程 / 代理配置。
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const api = createApiMiddleware(env)

  return {
    plugins: [
      vue(),
      {
        name: 'workbench-api',
        configureServer(server) {
          server.middlewares.use(api)
        },
        configurePreviewServer(server) {
          server.middlewares.use(api)
        }
      }
    ],
    // 默认监听所有网卡，手机连同一 WiFi 就能用局域网 IP 打开；
    // 只想本机访问时在 .env 里写 EXPOSE_LAN=0
    server: {
      host: env.EXPOSE_LAN === '0' ? '127.0.0.1' : true,
      port: 5173
    },
    preview: {
      host: env.EXPOSE_LAN === '0' ? '127.0.0.1' : true,
      port: 4173
    }
  }
})
