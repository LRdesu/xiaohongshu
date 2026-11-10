/** 读取文件为 DataURL，并按需压缩，避免把超大截图直接丢给模型 */
export function fileToDataUrl(file, maxSide = 1280, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = async () => {
      const raw = reader.result
      try {
        const img = await loadImage(raw)
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
        if (scale === 1 && file.size < 1024 * 1024) return resolve(raw)

        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      } catch {
        resolve(raw)
      }
    }
    reader.onerror = () => reject(new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })
}

/**
 * 把已有的 DataURL 再压一道。
 * 图生视频会把底图整个塞进请求体，原图越大提交越慢（实测 4000px 的图能拖到 5 分钟），
 * 所以送进视频接口前统一压到 720px。
 */
export async function compressDataUrl(dataUrl, maxSide = 720, quality = 0.82) {
  try {
    const img = await loadImage(dataUrl)
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
    if (scale === 1 && dataUrl.length < 400 * 1024) return dataUrl

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * scale)
    canvas.height = Math.round(img.height * scale)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', quality)
  } catch {
    return dataUrl
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/** 复制到剪贴板，带降级方案 */
export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* 降级 */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

export function formatSize(bytes) {
  if (!bytes) return '0 B'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}
