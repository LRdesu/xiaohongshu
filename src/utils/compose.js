/**
 * 把标题 / 要点合成到配图上，输出小红书 3:4 成品图。
 * 纯前端 Canvas 实现，1080×1440 导出。
 */

export const CARD_W = 1080
export const CARD_H = 1440

const FONT = `"PingFang SC","Microsoft YaHei","Hiragino Sans GB",system-ui,sans-serif`

export const LAYOUTS = [
  { id: 'bottom', label: '底部压字' },
  { id: 'center', label: '居中大字' },
  { id: 'top', label: '顶部色条' }
]

export const COLORS = [
  { id: 'white', label: '白字', value: '#ffffff' },
  { id: 'black', label: '黑字', value: '#141414' }
]

export function defaultStyle() {
  return {
    layout: 'bottom',
    fontSize: 88,
    lineHeight: 1.34,
    color: 'white',
    scrim: 62,
    showBullets: true,
    showPager: true,
    watermark: ''
  }
}

export const STYLE_KEY = 'xhs_card_export_style'

export function loadStyle() {
  try {
    const s = JSON.parse(localStorage.getItem(STYLE_KEY) || 'null')
    return s ? { ...defaultStyle(), ...s } : null
  } catch {
    return null
  }
}

export function saveStyle(s) {
  try {
    localStorage.setItem(STYLE_KEY, JSON.stringify(s))
  } catch {
    /* 忽略隐私模式下的写入失败 */
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    if (!src) return reject(new Error('no src'))
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = src
  })
}

/** cover 方式铺满画布，居中裁剪 */
function drawCover(ctx, img) {
  const scale = Math.max(CARD_W / img.width, CARD_H / img.height)
  const dw = img.width * scale
  const dh = img.height * scale
  ctx.drawImage(img, (CARD_W - dw) / 2, (CARD_H - dh) / 2, dw, dh)
}

/** 按版式画蒙层，保证文字可读 */
function drawScrim(ctx, st) {
  const a = (st.scrim / 100) * (st.color === 'black' ? 0.55 : 1)
  if (a <= 0) return

  if (st.layout === 'center') {
    ctx.fillStyle = st.color === 'black' ? `rgba(255,255,255,${a * 0.9})` : `rgba(0,0,0,${a * 0.62})`
    ctx.fillRect(0, 0, CARD_W, CARD_H)
    return
  }

  const down = st.layout === 'top'
  const g = ctx.createLinearGradient(0, down ? 0 : CARD_H, 0, down ? CARD_H * 0.42 : CARD_H * 0.42)
  const c = st.color === 'black' ? '255,255,255' : '0,0,0'
  if (down) {
    g.addColorStop(0, `rgba(${c},${a})`)
    g.addColorStop(0.62, `rgba(${c},${a * 0.5})`)
    g.addColorStop(1, `rgba(${c},0)`)
  } else {
    g.addColorStop(0, `rgba(${c},0)`)
    g.addColorStop(0.55, `rgba(${c},${a * 0.45})`)
    g.addColorStop(1, `rgba(${c},${a})`)
  }
  ctx.fillStyle = g
  ctx.fillRect(0, 0, CARD_W, CARD_H)
}

/** 中英混排分词：英文单词整体不拆，中文逐字 */
function tokenize(s) {
  const out = []
  let buf = ''
  for (const ch of String(s || '')) {
    if (/\s/.test(ch)) {
      if (buf) {
        out.push(buf)
        buf = ''
      }
      continue
    }
    if (/[A-Za-z0-9@#$%&'’.,!?:;+\-/_]/.test(ch)) {
      buf += ch
    } else {
      if (buf) {
        out.push(buf)
        buf = ''
      }
      out.push(ch)
    }
  }
  if (buf) out.push(buf)
  return out
}

function wrapText(ctx, text, maxWidth) {
  const tokens = tokenize(text)
  const lines = []
  let cur = ''
  for (const t of tokens) {
    const next = cur + t
    if (ctx.measureText(next).width <= maxWidth || !cur) cur = next
    else {
      lines.push(cur)
      cur = t
    }
  }
  if (cur) lines.push(cur)
  return lines
}

function drawLine(ctx, line, x, y, st, strokeScale = 1) {
  const lw = st.fontSize * 0.09 * strokeScale
  if (st.layout === 'center' || st.scrim > 0) {
    ctx.lineWidth = lw
    ctx.strokeStyle = st.color === 'black' ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.5)'
    ctx.lineJoin = 'round'
    ctx.strokeText(line, x, y)
  }
  ctx.fillText(line, x, y)
}

/**
 * 合成一张卡片
 * @param {object} p
 * @param {string} p.src    底图（dataUrl / url）
 * @param {string} p.title  主标题
 * @param {string[]} p.bullets 要点
 * @param {string} p.pageLabel 页码，如 1/4
 * @param {object} p.style  版式参数
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function composeCard({ src, title, bullets = [], pageLabel = '', style }) {
  const st = { ...defaultStyle(), ...(style || {}) }
  const canvas = document.createElement('canvas')
  canvas.width = CARD_W
  canvas.height = CARD_H
  const ctx = canvas.getContext('2d')

  // 底：没有图时用深色占位
  ctx.fillStyle = '#1b1e26'
  ctx.fillRect(0, 0, CARD_W, CARD_H)

  let hasImg = false
  try {
    const img = await loadImage(src)
    drawCover(ctx, img)
    hasImg = true
  } catch {
    hasImg = false
  }

  drawScrim(ctx, st)

  const pad = CARD_W * 0.085
  const maxW = CARD_W - pad * 2
  const color = (COLORS.find((c) => c.id === st.color) || COLORS[0]).value

  // 主标题
  ctx.font = `bold ${st.fontSize}px ${FONT}`
  ctx.fillStyle = color
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  const titleLines = wrapText(ctx, title || '', maxW)

  // 要点
  const bSize = Math.round(st.fontSize * 0.44)
  const bLines = []
  if (st.showBullets && bullets?.length) {
    ctx.font = `${bSize}px ${FONT}`
    for (const b of bullets) {
      const wrapped = wrapText(ctx, `· ${b}`, maxW - bSize * 0.6)
      bLines.push(...wrapped)
    }
  }

  const titleLH = st.fontSize * st.lineHeight
  const bLH = bSize * 1.6
  const titleH = titleLines.length * titleLH
  const gap = bLines.length ? st.fontSize * 0.5 : 0
  const blockH = titleH + gap + bLines.length * bLH

  // 垂直起点
  let top
  if (st.layout === 'top') top = CARD_H * 0.055
  else if (st.layout === 'center') top = (CARD_H - blockH) / 2
  else top = CARD_H - CARD_H * 0.085 - blockH

  if (!hasImg && st.layout !== 'center') {
    // 无底图时统一居中，避免贴在深色块上看起来像出错了
    top = (CARD_H - blockH) / 2
  }

  let y = top + st.fontSize * 0.92
  ctx.font = `bold ${st.fontSize}px ${FONT}`
  ctx.fillStyle = color
  for (const line of titleLines) {
    drawLine(ctx, line, pad, y, st)
    y += titleLH
  }

  if (bLines.length) {
    y += gap - titleLH + bSize * 1.2
    ctx.font = `${bSize}px ${FONT}`
    ctx.fillStyle = color
    for (const line of bLines) {
      drawLine(ctx, line, pad, y, st, 0.8)
      y += bLH
    }
  }

  // 页码
  if (st.showPager && pageLabel) {
    const pSize = Math.round(st.fontSize * 0.34)
    ctx.font = `${pSize}px ${FONT}`
    ctx.fillStyle = st.color === 'black' ? 'rgba(20,20,20,0.55)' : 'rgba(255,255,255,0.72)'
    ctx.textAlign = 'right'
    ctx.fillText(pageLabel, CARD_W - pad, CARD_H - CARD_H * 0.042)
    ctx.textAlign = 'left'
  }

  // 水印 / 署名
  if (st.watermark) {
    const wSize = Math.round(st.fontSize * 0.32)
    ctx.font = `${wSize}px ${FONT}`
    ctx.fillStyle = st.color === 'black' ? 'rgba(20,20,20,0.5)' : 'rgba(255,255,255,0.7)'
    ctx.fillText(st.watermark, pad, CARD_H - CARD_H * 0.042)
  }

  return canvas
}

export function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('导出失败'))), 'image/png')
  })
}

/** 用 Blob URL 下载，比 dataUrl 更稳（iOS Safari 对超大 dataUrl 会失败） */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export function safeName(s, fallback = 'card') {
  const t = String(s || '')
    .replace(/[\\/:*?"<>|\n\r\t]/g, '')
    .trim()
    .slice(0, 24)
  return t || fallback
}
