import { loadConfig, CONFIG_KEYS } from './config.js'

/** 运行时配置（浏览器里改的模型/Key），优先级高于 .env */
function withConfig(body) {
  const cfg = loadConfig()
  if (!cfg) return body
  const clean = {}
  for (const k of CONFIG_KEYS) {
    if (cfg[k] && String(cfg[k]).trim()) clean[k] = String(cfg[k]).trim()
  }
  return Object.keys(clean).length ? { ...body, config: clean } : body
}

async function post(path, body) {
  const resp = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(withConfig(body))
  })
  const data = await resp.json().catch(() => ({ ok: false, error: '接口返回异常' }))
  if (!data.ok) throw new Error(data.error || '接口调用失败')
  return data
}

/** 截图识别：玩法 / 视觉风格 / 引用证据 */
export function analyze(images, options) {
  return post('/api/analyze', { images, options })
}

/** 生成 5 套小红书图文；research 为可选的事实依据（联网检索结果） */
export function generate(recognition, options, research) {
  return post('/api/generate', { recognition, options, research: research || null })
}

/** 联网检索该游戏的真实资料（官网 / 百科 / 评测），返回 { sources, facts } */
export function research(recognition) {
  return post('/api/research', { recognition })
}

/** 按卡片大纲的某一页生成配图 */
export function generateImage(payload) {
  return post('/api/image', payload)
}

/**
 * 提交视频任务。视频是异步任务制（20s~5min），
 * 这里只拿 taskId，再由 videoStatus 轮询，避免请求挂太久被浏览器掐断。
 */
export function submitVideo(payload) {
  return post('/api/video-submit', payload)
}

export function videoStatus(taskId) {
  return post('/api/video-status', { taskId })
}

/** 结果直链会过期且可能跨域，统一走服务端代理；dl=1 时带下载头 */
export function videoProxyUrl(remoteUrl, dl = false) {
  return `/api/video-proxy?url=${encodeURIComponent(remoteUrl)}${dl ? '&dl=1' : ''}`
}

/** 连通性自检：which = 'vision' | 'text' */
export function testConnection(which = 'vision') {
  return post('/api/test', { which })
}

/** 检查服务端默认配置（.env） */
export async function health() {
  try {
    const resp = await fetch('/api/health')
    return await resp.json()
  } catch {
    return { ok: false, configured: false }
  }
}
