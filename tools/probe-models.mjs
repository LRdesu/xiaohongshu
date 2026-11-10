/**
 * 模型选型探针：带单价标注地实测各候选在当前账户的可用性
 * 用法：node tools/probe-models.mjs
 *
 * 换模型 / 怀疑额度变了时先跑这个，别凭记忆判断。百炼可用性是波动的：
 * 同一批模型昨天全 400、今天可能全通，单次失败不构成结论。
 * 价格标注来自 2026-09 百炼公开定价（元），以控制台为准。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const env = {}
for (const line of fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_.]+)\s*=\s*(.*)$/)
  if (m) env[m[1]] = m[2].trim()
}
const KEY = env.VISION_API_KEY
const CHAT = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
const T2I = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis'

const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAOklEQVR4nO3OMQEAAAgDoJnc/9F2ggcMJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJhYTPBgBAb0CQ8AAAAASUVORK5CYII='

function tag(msg) {
  if (/good standing|Arrearage|欠费/.test(msg)) return '欠费'
  if (/Free quota exhausted|FreeTierOnly/.test(msg)) return '免费额度耗尽'
  if (/does not exist|Model not exist|InvalidModel/i.test(msg)) return '无此模型'
  if (/Access denied/.test(msg)) return '无权限'
  return '拒绝'
}

async function call_(model, messages, maxTokens, pad, note) {
  const name = model.padEnd(pad)
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 30000)
    const r = await fetch(CHAT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, response_format: { type: 'json_object' } }),
      signal: ctrl.signal
    })
    clearTimeout(timer)
    const t = await r.text()
    if (!r.ok) {
      let msg = t.slice(0, 120)
      try { msg = JSON.parse(t)?.error?.message?.slice(0, 120) || msg } catch {}
      return `  ✗ ${tag(msg).padEnd(14)} ${name} ${note}`
    }
    const c = JSON.parse(t)?.choices?.[0]?.message?.content
    const content = Array.isArray(c) ? c.map((p) => p?.text || '').join('') : String(c || '')
    return `  ✓ 可用           ${name} ${note}   →${content.replace(/\s+/g, '').slice(0, 22)}`
  } catch (e) {
    return `  ✗ ${String(e?.name === 'AbortError' ? '超时' : e?.message || e).slice(0, 14).padEnd(14)} ${name} ${note}`
  }
}

console.log('══ A. 文本模型（文案生成）══   单位：元 / 百万 token')
console.log(await call_('qwen-flash', [{ role: 'user', content: '输出 JSON：{"ok":true}' }], 30, 24, '0.15入/1.5出  ← 最便宜'))
console.log(await call_('qwen-turbo', [{ role: 'user', content: '输出 JSON：{"ok":true}' }], 30, 24, '0.8入/2.0出'))
console.log(await call_('qwen3.5-omni-flash', [{ role: 'user', content: '输出 JSON：{"ok":true}' }], 30, 24, '2.2入/13.3出   现用'))
console.log(await call_('qwen3-vl-flash', [{ role: 'user', content: '输出 JSON：{"ok":true}' }], 30, 24, '0.15入/1.5出'))
console.log(await call_('glm-4-flash', [{ role: 'user', content: '输出 JSON：{"ok":true}' }], 30, 24, '百炼代售'))

console.log('\n══ B. 视觉模型（截图识别）══')
const VIS = [
  {
    role: 'user',
    content: [
      { type: 'text', text: '看图输出 JSON：{"artStyle":"","confidence":0.5}。只输出 JSON。' },
      { type: 'image_url', image_url: { url: `data:image/png;base64,${PNG}` } }
    ]
  }
]
console.log(await call_('qwen3-vl-flash', VIS, 200, 26, '0.15入/1.5出  ← 最便宜'))
console.log(await call_('qwen3-vl-plus', VIS, 200, 26, '1.0入/1.2出'))
console.log(await call_('qwen-vl-max', VIS, 200, 26, '旗舰，贵'))
console.log(await call_('qwen-vl-ocr', VIS, 200, 26, '0.3入/0.5出  专职OCR'))
console.log(await call_('qwen3.5-omni-flash', VIS, 200, 26, '2.2入/13.3出  现用'))

async function tryImage(model, note) {
  const name = model.padEnd(26)
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 15000)
    const r = await fetch(T2I, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}`, 'X-DashScope-Async': 'enable' },
      body: JSON.stringify({ model, input: { prompt: '暗色哥特风游戏宣传插画' }, parameters: { size: '720*1280', n: 1 } }),
      signal: ctrl.signal
    })
    clearTimeout(timer)
    const t = await r.text()
    let j
    try { j = JSON.parse(t) } catch { return `  ✗ 返回异常         ${name} ${note}` }
    if (j?.output?.task_id) return `  ✓ 可提交          ${name} ${note}`
    const msg = String(j?.message || JSON.stringify(j)).slice(0, 110)
    return `  ✗ ${tag(msg).padEnd(14)} ${name} ${note}`
  } catch (e) {
    return `  ✗ ${String(e?.name === 'AbortError' ? '超时' : e?.message || e).slice(0, 14).padEnd(14)} ${name} ${note}`
  }
}

console.log('\n══ C. 出图模型（按张）══')
console.log(await tryImage('wanx2.1-t2i-turbo', '~0.16 元/张  现用，最便宜'))
console.log(await tryImage('wanx2.0-t2i-turbo', '~0.16 元/张'))
console.log(await tryImage('qwen-image-plus', '0.2 元/张    快 25%'))
console.log(await tryImage('qwen-image-max', '0.5 元/张    画质最好'))
