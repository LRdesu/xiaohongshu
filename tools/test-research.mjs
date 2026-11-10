import { researchGame } from '../server/api.mjs'

// 模拟一次识别结果（带真实游戏名 + 关键词）
const recognition = {
  gameName: '原神',
  platform: '未知',
  keywords: ['原神', '开放世界', '米哈游'],
  gameplay: { type: '开放世界 RPG' }
}

const t0 = Date.now()
const r = await researchGame({}, recognition)
console.log('耗时', ((Date.now() - t0) / 1000).toFixed(1) + 's')
console.log('gameName =', r.gameName, '| searched =', r.searched)
console.log('sources =', r.sources.length)
r.sources.forEach((s, i) => console.log(`  [${i + 1}] ${s.title}\n      ${s.url}`))
console.log('\nfacts 长度 =', (r.facts || '').length)
console.log('note =', r.note)
console.log('\n--- facts 前 600 字 ---\n' + (r.facts || '（空）').slice(0, 600))
