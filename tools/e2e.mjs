/**
 * 端到端验证：切到免费模型后，四条链路是否都通
 * 用法：node tools/e2e.mjs
 */
const BASE = 'http://127.0.0.1:5173'

async function get(p) {
  const r = await fetch(BASE + p)
  return r.json()
}
async function post(p, body) {
  const r = await fetch(BASE + p, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  return r.json()
}

const line = (t) => console.log('\n──── ' + t + ' ' + '─'.repeat(Math.max(0, 46 - t.length)))

line('1. /api/health 默认模型')
const h = await get('/api/health')
console.log('configured =', h.configured, '| model =', h.model, '| textModel =', h.textModel)
console.log('imageModel =', h.imageModel, '| videoModel =', h.videoModel)

line('2. /api/test 文本模型连通性')
const t1 = await post('/api/test', { which: 'text' })
console.log(t1.ok ? 'OK  ' + t1.reply : 'FAIL ' + t1.error)

line('3. /api/test 视觉模型连通性')
const t2 = await post('/api/test', { which: 'vision' })
console.log(t2.ok ? 'OK  ' + t2.reply : 'FAIL ' + t2.error)

const recognition = {
  gameplay: {
    core: '每回合 3 点费用打出技能牌，凑成 combo 秒杀 Boss',
    type: 'Roguelike 卡牌构筑',
    mechanics: ['3 点费用制', '卡牌升级合成', '遗物改变 Build'],
    progression: ['关卡递进解锁角色', '周目难度递增'],
    hooks: ['一回合秒杀 Boss', 'Build 成型的滚雪球']
  },
  visualStyle: {
    artStyle: '暗色哥特 + 手绘厚涂',
    palette: [
      { name: '暗红', hex: '#8E2B3F' },
      { name: '骨白', hex: '#EDE3D2' },
      { name: '金', hex: '#D8A24A' }
    ],
    uiElements: ['顶部血量与费用条', '底部手牌扇形排列'],
    typography: '衬线标题 + 无衬线数值',
    mood: '压抑但华丽'
  },
  evidence: [{ field: '游戏玩法', quote: '界面可见「费用 3/3」', source: '图1', confidence: 0.8 }],
  keywords: ['卡牌构筑', 'Roguelike', '哥特'],
  confidence: 0.8,
  notes: ''
}

line('4. /api/generate 免费模型产出 5 套方案')
const g = await post('/api/generate', {
  recognition,
  options: { tone: '真诚种草', audience: '喜欢手游的年轻玩家', length: 300 }
})
if (!g.ok) {
  console.log('FAIL', g.error)
} else {
  const list = g.data?.candidates || []
  console.log(`OK 候选数 = ${list.length}  mocked = ${!!g.mocked}`)
  list.forEach((c, i) => {
    console.log(
      `  ${i + 1}. [${c.angle}] ${c.title}  标签${(c.tags || []).length}个  大纲${(c.cardOutline || []).length}页  正文${(c.body || '').length}字`
    )
  })
  // 抽一稿正文出来人工扫一眼：有没有编造的具体数值/专有名词
  const first = list[0]
  if (first?.body) console.log('\n  ── 第 1 稿正文（抽查事实性）──\n  ' + first.body.replace(/\n+/g, '\n  '))
}

line('5. /api/image 出图（万相欠费 -> 应降级为本地底图）')
const cand = g?.data?.candidates?.[0]
if (!cand) {
  console.log('SKIP 上一步没拿到候选')
} else {
  const im = await post('/api/image', {
    recognition,
    candidate: cand,
    page: cand.cardOutline?.[0] || { page: 1, title: '封面', bullets: ['钩子', '标题'] },
    options: {}
  })
  if (!im.ok) {
    console.log('FAIL', im.error)
  } else {
    console.log('local(是否降级) =', im.local, '| degraded =', (im.degraded || '').slice(0, 90))
    console.log('dataUrl 长度 =', (im.dataUrl || '').length, '| 前缀 =', (im.dataUrl || '').slice(0, 40))
    console.log('prompt =', (im.prompt || '').slice(0, 120) + '...')

    // 降级底图必须是浏览器能直接画的 SVG：有宽高、无外部引用、无脚本
    if (im.local) {
      const svg = Buffer.from((im.dataUrl || '').split(',')[1] || '', 'base64').toString('utf8')
      const checks = [
        ['以 <svg 开头', svg.trimStart().startsWith('<svg')],
        ['声明 width/height', /width="\d+"\s+height="\d+"/.test(svg)],
        ['有 viewBox', /viewBox="0 0 \d+ \d+"/.test(svg)],
        ['无 <script>', !/<script/i.test(svg)],
        ['无外部引用(会被 canvas 拒绝)', !/href="http|xlink:href="http|<image/i.test(svg)],
        ['以 </svg> 结尾', svg.trimEnd().endsWith('</svg>')]
      ]
      for (const [label, pass] of checks) console.log(`    ${pass ? '✓' : '✗'} ${label}`)
      console.log('    SVG 前 120 字:', svg.slice(0, 120))
    }
  }
}

line('6. /api/video-submit 视频（应给出明确的欠费提示）')
if (!cand) {
  console.log('SKIP')
} else {
  const v = await post('/api/video-submit', {
    recognition,
    candidate: cand,
    page: cand.cardOutline?.[0],
    mode: 't2v',
    options: { motion: '镜头缓慢推进' }
  })
  console.log(v.ok ? 'OK taskId=' + v.taskId : '预期内失败：' + v.error)
}

console.log('\n完成。\n')
