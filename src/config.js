const KEY = 'xhs_workbench_llm_config'

export const CONFIG_KEYS = [
  'base',
  'key',
  'model',
  'textModel',
  'imageModel',
  'imageSize',
  'videoModel'
]

/** 运行时模型配置，存在浏览器本地，优先级高于 .env */
export function loadConfig() {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveConfig(cfg) {
  localStorage.setItem(KEY, JSON.stringify(cfg))
}

export function clearConfig() {
  localStorage.removeItem(KEY)
}
