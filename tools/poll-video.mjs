/** 轮询视频任务状态，确认真能出片 */
const BASE = 'http://127.0.0.1:5173'
const taskId = process.argv[2]

async function status() {
  const r = await fetch(BASE + '/api/video-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId })
  })
  return r.json()
}

const t0 = Date.now()
for (let i = 0; i < 40; i++) {
  const s = await status()
  const sec = Math.round((Date.now() - t0) / 1000)
  console.log(`[${sec}s] ${s.status} ${s.url ? s.url.slice(0, 60) : s.message || ''}`)
  if (s.status === 'SUCCEEDED') {
    console.log('\n视频地址:', s.url)
    const p = await fetch(BASE + '/api/video-proxy?url=' + encodeURIComponent(s.url))
    console.log('代理拉取:', p.status, p.headers.get('content-type'), (await p.arrayBuffer()).byteLength, 'bytes')
    break
  }
  if (s.status === 'FAILED') {
    console.log('失败:', s.message)
    break
  }
  await new Promise((r) => setTimeout(r, 10000))
}
