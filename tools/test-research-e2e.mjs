const BASE = 'http://127.0.0.1:5199'

const recognition = {
  gameName: '原神',
  platform: 'iOS/安卓',
  keywords: ['原神', '开放世界', '米哈游'],
  gameplay: { type: '开放世界 RPG', mechanics: ['元素反应', '探索'], hooks: ['剧情', '美术'] },
  visualStyle: { artStyle: '二次元厚涂', palette: [{ name: '主色', hex: '#3a7bd5' }] },
  evidence: [{ field: '游戏名', quote: '标题可见「原神」', source: '图1', confidence: 0.9 }]
}

async function main() {
  console.log('── 1) /api/research ──')
  const r1 = await fetch(BASE + '/api/research', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recognition })
  })
  const research = await r1.json()
  console.log('ok =', research.ok, '| 来源数 =', research.sources?.length, '| facts长度 =', (research.facts || '').length)
  console.log('note =', research.note)
  research.sources?.forEach((s, i) => console.log(`  [${i + 1}] ${s.title}  —  ${s.url}`))

  console.log('\n── 2) /api/generate（注入 research）──')
  const r2 = await fetch(BASE + '/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recognition,
      options: { tone: '真诚种草', audience: '手游玩家', length: 300 },
      research
    })
  })
  const g = await r2.json()
  if (!g.ok) { console.log('FAIL', g.error); return }
  const list = g.data?.candidates || []
  console.log('候选数 =', list.length, '| mocked =', !!g.mocked, '| attempts =', g.attempts)
  const first = list[0]
  console.log('\n  ── 第 1 稿正文（看是否引用了真实资料，如 7.1 版本 / 神铸赋形）──')
  console.log('  ' + (first?.body || '').replace(/\n+/g, '\n  '))
  console.log('\n  标题:', first?.title, '| 标签数:', (first?.tags || []).length, '| 大纲页:', (first?.cardOutline || []).length)
}
main().catch((e) => console.log('ERR', e.message))
