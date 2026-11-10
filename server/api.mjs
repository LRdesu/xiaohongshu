/**
 * 内容工作台 · 后端接口（挂在 Vite 中间件上）
 *
 *   POST /api/analyze   截图 -> 游戏玩法 / 视觉风格 / 引用证据
 *   POST /api/generate  识别结果 -> 5 套小红书图文（标题 / 正文 / 标签 / 卡片大纲）
 *   GET  /api/health    返回是否已配置模型 Key
 *
 * 模型走 OpenAI 兼容的 /chat/completions；VISION_API_KEY 为空时返回模拟数据。
 */

const MAX_BODY = 80 * 1024 * 1024
const MAX_IMAGES = 6

/* ------------------------------ 提示词 ------------------------------ */

function analyzePrompt(options = {}) {
  const focus = options.focus?.trim() || '游戏玩法、视觉风格、可用于种草的卖点'
  return `你是资深游戏内容分析师，请逐张仔细观察用户提供的游戏截图。

只输出一个 JSON 对象，不要 markdown 代码块，不要任何解释文字。结构如下：
{
  "gameplay": {
    "core": "一句话核心玩法",
    "type": "游戏类型，如 Roguelike / 卡牌构筑 / 模拟经营",
    "mechanics": ["机制1", "机制2", "机制3"],
    "progression": ["成长或解锁路径1", "路径2"],
    "hooks": ["最容易让人上头的点1", "点2"]
  },
  "visualStyle": {
    "artStyle": "美术风格，如 二次元厚涂 / 低多边形 / 像素",
    "palette": [{ "name": "主色名", "hex": "#RRGGBB" }, { "name": "", "hex": "" }],
    "uiElements": ["UI 元素1", "UI 元素2"],
    "typography": "字体气质描述",
    "mood": "整体氛围，如 治愈 / 紧张 / 荒诞"
  },
  "evidence": [
    { "field": "游戏玩法 或 视觉风格", "quote": "截图中真实可见的原文案或元素描述", "source": "图1", "confidence": 0.8 }
  ],
  "keywords": ["关键词1", "关键词2"],
  "gameName": "识别到的游戏名称；认不出写 \"未知\"",
  "platform": "平台：iOS / 安卓 / PC / 主机 / 未知",
  "confidence": 0.85,
  "notes": "不确定或缺失的信息说明"
}

重点关注：${focus}

硬性要求：
1. evidence 必须是截图里真实能看到的文字、数值、界面元素，禁止编造；看不清就写"未识别"，confidence 给低值。
2. palette 的 hex 从截图实际取色，必须是 #RRGGBB 六位格式。
3. 所有字符串用简体中文。
4. 数组最多 6 项，不要为空数组，至少给 1 项。
5. 类型约束（非常重要）：mechanics / progression / hooks / uiElements / palette / evidence / keywords 都必须是数组，绝不能写成单个字符串。
6. 只输出 JSON 本身，不要用 markdown 代码块包裹，结尾不要加任何说明。
7. 尽量识别 gameName（游戏官方名称）：截图里有明显游戏标题/Logo/角标就直接写；认不出写"未知"。platform 推断运行平台，无法确定写"未知"。`
}

function generatePrompt(recognition, options = {}, research = null) {
  const tone = options.tone || '真诚种草'
  const audience = options.audience || '喜欢手游的年轻玩家'
  const length = options.length || 300
  const extra = options.extra?.trim() ? `\n额外要求：${options.extra.trim()}` : ''

  // 联网检索到的真实资料：作为最高优先级的事实依据注入
  const researchBlock = research?.facts
    ? `\n【联网检索到的真实资料（来自官网 / 百科 / 评测媒体的真实文章，最高优先级事实依据）】\n${research.facts}\n\n引用其中事实时，可在正文自然提及来源（如"据官网介绍""测评提到"）。这些资料里的具体信息优先于你的记忆使用。\n`
    : ''

  return `你是小红书爆款图文作者，请根据下面的游戏截图识别结果，产出 5 个不同角度的小红书图文方案。

【识别结果】
${JSON.stringify(recognition, null, 2)}
${researchBlock}
【创作约束】
- 目标受众：${audience}
- 语气风格：${tone}
- 正文长度：约 ${length} 字（硬指标，宁长勿短，写不够会直接判不合格）${extra}

【事实依据（最高优先级，违反即不合格）】
1. 所有游戏信息必须来自以下来源之一（优先级从高到低）：
   ① 上面【联网检索到的真实资料】（若存在，这是最高优先级事实依据，里面的具体信息优先于你的记忆使用）；
   ② 上面【识别结果】里真实识别到的内容（gameplay / evidence / keywords / uiElements 等）；
   ③ 该游戏真实存在的公开资料与真实文章（官方公告、官网介绍、官方 wiki、真实玩家评测/攻略、权威媒体报道）。
   来源 ① 与 ② 冲突时，以 ① 检索资料为准；都未提及的细节不得自行补充。
2. 严禁编造任何游戏信息，包括但不限于：游戏名/角色名/武器名/地图名/活动名、数值（伤害、掉率、价格、等级、概率）、版本与上线时间、玩法机制、剧情设定、联动信息、官方公告内容。
3. 识别结果里没有、你也无法确认真实存在的细节，一律不得写进正文/标题/大纲；改用不含具体数字和专有名词的泛化表达（例如"前期资源紧张"而不是"开局只有 120 体力"），或直接不提。
4. 宁可写得笼统、信息量小，也绝对不能为了让内容更"丰富"而补脑。写错的代价远大于写得空。
5. 涉及版本、活动、限时内容时，只在你确信该游戏真实存在该内容时才写，并避免给出具体日期。

只输出一个 JSON 对象，不要 markdown 代码块，不要任何解释文字。结构如下：
{
  "candidates": [
    {
      "angle": "这一稿的切入角度，如 新手避坑 / 美术赏析 / 数值爽点",
      "title": "标题，20 字以内，有情绪钩子和悬念",
      "body": "正文，分段用 \\n\\n，含适量 emoji，结尾一句引导评论互动",
      "tags": ["#标签1", "#标签2"],
      "cardOutline": [
        { "page": 1, "title": "封面页标题", "bullets": ["要点1", "要点2"] },
        { "page": 2, "title": "", "bullets": [] }
      ],
      "hook": "前三秒抓人的一句话"
    }
  ]
}

硬性要求：
1. candidates 必须是 5 个，且 angle 互不相同。
2. 标题 ≤ 20 字，不要 5 个都一个套路。
3. tags 必须是字符串数组，每个方案 6-10 个，带 # 前缀。
4. cardOutline 必须是对象数组，每个方案 4-6 页，page 从 1 递增。
5. 正文必须基于识别结果里的真实信息，evidence 没提到的玩法不要编造。
6. 简体中文输出。
7. 类型约束（非常重要）：tags 和 bullets 都必须是字符串数组，绝不能写成单个字符串；cardOutline 每一项都要有 page / title / bullets 三个字段。
8. 每篇正文都要写满约 ${length} 字，用 \n\n 分成 4~6 段，不要只写两三句就收尾。
9. 只输出 JSON 本身，不要用 markdown 代码块包裹，结尾不要加任何说明。
10. 事实核查（一票否决）：写完后逐条自查——游戏名/角色名/活动名、数值、版本时间、玩法机制，是否都能在识别结果或该游戏真实公开资料中找到出处？任何一条找不到出处的，立刻改写成不含具体信息的泛化表达。宁可少写，不可编造。`
}

/* ------------------------------ 工具 ------------------------------ */

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(new Error('请求体过大'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
      } catch {
        reject(new Error('请求体不是合法 JSON'))
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(body)
}

function extractJson(raw) {
  if (typeof raw !== 'string') return raw
  let text = raw.trim()
  text = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('模型没有返回 JSON：' + text.slice(0, 200))
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    throw new Error('模型返回的 JSON 无法解析：' + text.slice(0, 200))
  }
}

/**
 * 把上游的英文报错翻成人能看懂的话，重点区分「欠费/无额度」和「模型名错」
 */
function friendlyError(status, text) {
  let msg = text
  try {
    msg = JSON.parse(text)?.error?.message || text
  } catch {}
  msg = String(msg).slice(0, 300)

  if (/account is in good standing|Arrearage|overdue|欠费/i.test(msg)) {
    return '阿里云百炼账户余额不足（或处于欠费状态），该模型不可用。请改用免费模型 qwen3.5-omni-flash，或去百炼控制台充值后再试。'
  }
  if (/does not exist or you do not have access/i.test(msg)) {
    return `模型名不存在或没有权限：${msg}。请到百炼控制台确认该模型已开通。`
  }
  if (status === 401 || /invalid api key|Incorrect API key/i.test(msg)) {
    return 'API Key 无效或已过期，请在设置面板重新填写。'
  }
  if (/quota|Rate limit|Throttling/i.test(msg)) {
    return `触发限流或额度上限：${msg}。稍等一会儿重试，或换个模型。`
  }
  return `模型接口 ${status}：${msg}`
}

/**
 * 免费小模型（omni-flash）偶尔会产出类型走形的 JSON：
 *   "bullets": "要点"   本该是 ["要点"]
 *   "tags": "#标签"     本该是 ["#标签"]
 * 这里统一掰正，避免因为一个字段毁掉整份结果。
 */
function toStrArray(v, fallback = []) {
  if (Array.isArray(v)) return v.map((x) => String(x ?? '').trim()).filter(Boolean)
  if (typeof v === 'string' && v.trim()) {
    // 有些模型会把数组写成 "['a','b']" 或 "a、b"
    try {
      const parsed = JSON.parse(v.replace(/'/g, '"'))
      if (Array.isArray(parsed)) return toStrArray(parsed, fallback)
    } catch {}
    return [v.trim()]
  }
  return fallback
}

/** 通用兜底标签，模型偷懒少写标签时用来补齐 */
const GENERIC_TAGS = ['#游戏推荐', '#手游', '#游戏日常', '#新游安利', '#游戏截图', '#种草']

/** 标签补齐到至少 6 个：先拿识别关键词，不够再补通用标签 */
function padTags(tags, recognition) {
  const out = []
  const seen = new Set()
  const push = (t) => {
    const s = String(t || '').trim()
    if (!s) return
    const tag = s.startsWith('#') ? s : `#${s}`
    const k = tag.toLowerCase()
    if (seen.has(k) || out.length >= 10) return
    seen.add(k)
    out.push(tag)
  }
  tags.forEach(push)
  ;(recognition?.keywords || []).forEach(push)
  GENERIC_TAGS.forEach(push)
  return out.slice(0, 10)
}

/** 把模型给的候选列表规范化成前端敢直接渲染的形状 */
function normalizeCandidates(list, recognition) {
  return (Array.isArray(list) ? list : [])
    .filter((c) => c && typeof c === 'object')
    .map((c, i) => {
      let outline = Array.isArray(c.cardOutline) ? c.cardOutline : []
      outline = outline
        .filter((p) => p && typeof p === 'object')
        .map((p, idx) => ({
          page: Number(p.page) > 0 ? Number(p.page) : idx + 1,
          title: String(p.title ?? '').trim() || `第 ${idx + 1} 页`,
          bullets: toStrArray(p.bullets)
        }))
      if (!outline.length) {
        outline = [
          { page: 1, title: '封面', bullets: [] },
          { page: 2, title: '玩法速览', bullets: [] },
          { page: 3, title: '画面欣赏', bullets: [] },
          { page: 4, title: '我的体验', bullets: [] }
        ]
      }
      return {
        angle: String(c.angle ?? '').trim() || `角度 ${i + 1}`,
        title: String(c.title ?? '').trim() || String(recognition?.gameplay?.type || '这款游戏') + '值得一试',
        body: String(c.body ?? '').trim() || '（模型这次没写出正文，点重新生成试试）',
        // 小模型常把标签写成 3 个，这里一律补齐到 6~10 个
        tags: padTags(toStrArray(c.tags), recognition),
        cardOutline: outline,
        hook: String(c.hook ?? '').trim() || ''
      }
    })
}

async function callLLM({
  base,
  key,
  model,
  messages,
  temperature = 0.7,
  jsonMode = true,
  maxTokens = 8192,
  timeoutMs = 120000,
  retries = 1
}) {
  const url = String(base || '').replace(/\/+$/, '') + '/chat/completions'
  const body = { model, messages, temperature, stream: false, max_tokens: maxTokens }
  if (jsonMode) body.response_format = { type: 'json_object' }

  let lastErr
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`
        },
        body: JSON.stringify(body),
        signal: ctrl.signal
      })
      clearTimeout(timer)

      const text = await resp.text()
      if (!resp.ok) {
        // 欠费 / 模型不存在这类错误重试也没用，直接抛
        if (resp.status === 400 || resp.status === 401 || resp.status === 404) {
          throw new Error(friendlyError(resp.status, text))
        }
        throw new Error(friendlyError(resp.status, text))
      }

      let data
      try {
        data = JSON.parse(text)
      } catch {
        throw new Error('模型接口返回不是 JSON')
      }

      const message = data?.choices?.[0]?.message
      let content = message?.content
      if (Array.isArray(content)) {
        content = content.map((p) => (typeof p === 'string' ? p : p?.text || '')).join('')
      }
      if (typeof content !== 'string' || !content.trim()) {
        // omni 系列偶发返回空，值得重试一次
        lastErr = new Error('模型返回内容为空')
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 1500))
          continue
        }
        throw lastErr
      }
      return content
    } catch (e) {
      clearTimeout(timer)
      lastErr = e?.name === 'AbortError' ? new Error(`模型请求超时（${Math.round(timeoutMs / 1000)}s）`) : e
      if (attempt < retries && !/余额不足|模型名不存在|API Key 无效/.test(lastErr.message)) {
        await new Promise((r) => setTimeout(r, 1500))
        continue
      }
      throw lastErr
    }
  }
  throw lastErr || new Error('模型调用失败')
}

/* ------------------------------ 模拟数据 ------------------------------ */

function mockAnalyze(images) {
  return {
    gameplay: {
      core: '（模拟）回合制卡牌构筑，每局随机抽取技能牌打出连招',
      type: 'Roguelike 卡牌构筑',
      mechanics: ['每回合 3 点费用', '卡牌可升级合成', '遗物改变 Build 走向'],
      progression: ['关卡递进解锁新角色', '周目难度递增'],
      hooks: ['一回合秒杀 Boss 的爽感', 'Build 成型后的滚雪球']
    },
    visualStyle: {
      artStyle: '（模拟）暗色哥特 + 手绘厚涂',
      palette: [
        { name: '主色 · 暗红', hex: '#8E2B3F' },
        { name: '辅色 · 骨白', hex: '#EDE3D2' },
        { name: '点缀 · 金', hex: '#D8A24A' }
      ],
      uiElements: ['顶部血量与费用条', '底部手牌扇形排列', '右侧遗物栏'],
      typography: '衬线体标题 + 无衬线数值，偏古典',
      mood: '压抑但华丽，危险感强'
    },
    evidence: [
      { field: '游戏玩法', quote: '（模拟）界面可见「费用 3/3」与手牌区 5 张卡', source: '图1', confidence: 0.62 },
      { field: '视觉风格', quote: '（模拟）主界面以暗红与金色描边为主', source: '图1', confidence: 0.58 }
    ],
    keywords: ['卡牌构筑', 'Roguelike', '高难度', '美术优秀'],
    gameName: '（模拟）未识别游戏名',
    platform: '未知',
    confidence: 0.6,
    notes: `未配置 VISION_API_KEY，当前为模拟数据（共 ${images?.length || 0} 张图）。在 .env 填入 Key 后重启即为真实识别。`
  }
}

function mockGenerate(recognition, options) {
  const angles = ['新手避坑', '美术赏析', '数值爽点', '上头实录', '同类对比']
  const type = recognition?.gameplay?.type || '这款游戏'
  return {
    candidates: angles.map((angle, i) => ({
      angle,
      title: `（模拟）${type}第 ${i + 1} 个角度标题`,
      body: `（模拟正文 · ${options.length || 300} 字档）\n\n先说结论：${type}真的有点上头 🎮\n\n① 核心循环很短，一局十几分钟就能打完\n② ${recognition?.gameplay?.hooks?.[0] || '成长反馈很直接'}\n③ 画面${recognition?.visualStyle?.artStyle || '风格统一'}，截图随手一拍就能发\n\n你们会为了美术买单吗？评论区聊聊 👇`,
      tags: ['#' + (recognition?.keywords?.[0] || '手游推荐'), '#游戏日常', '#手游', '#新游', '#卡牌', '#游戏截图'],
      cardOutline: [
        { page: 1, title: '封面', bullets: ['一句钩子', '大字标题'] },
        { page: 2, title: '玩法速览', bullets: ['核心循环', '上手门槛'] },
        { page: 3, title: '画面欣赏', bullets: ['美术风格', '配色'] },
        { page: 4, title: '我的体验', bullets: ['爽点', '劝退点'] },
        { page: 5, title: '总结', bullets: ['适合谁', '一句话建议'] }
      ],
      hook: '（模拟）打了一晚上，抬头天亮了'
    }))
  }
}

/* ------------------------------ 联网检索（事实依据） ------------------------------ */

const BING_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

/**
 * Bing 搜索（免 Key）。解析结果块里的标题 / 链接 / 摘要，返回 [{title,url,snippet}]。
 * 摘要来自官网 / 百科 / 评测媒体的真实页面，是模型写文案时最廉价可靠的事实源。
 */
async function bingSearch(query, n = 6) {
  const url =
    'https://www.bing.com/search?q=' + encodeURIComponent(query) + '&setlang=zh-CN&cc=CN'
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 10000)
  let html = ''
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': BING_UA, 'Accept-Language': 'zh-CN,zh;q=0.9' },
      signal: ctrl.signal
    })
    html = await resp.text()
  } catch {
    return []
  } finally {
    clearTimeout(timer)
  }

  const blocks = html.split('<li class="b_algo').slice(1)
  const out = []
  for (const b of blocks) {
    const end = b.indexOf('</li>')
    const block = end > 0 ? b.slice(0, end) : b
    const href = (block.match(/<h2[^>]*>\s*<a[^>]*href="(https?:\/\/[^"]+)"/) || [])[1] || ''
    if (!href || /bing\.com|microsoft\.com|msn\.com/.test(href)) continue
    const rawTitle = (block.match(/<h2[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/) || [])[1] || ''
    const title = rawTitle.replace(/<[^>]+>/g, '').replace(/&#0183;|&#183;/g, '·').trim()
    const rawSnip = (block.match(/<p class="b_lineclamp[^"]*"[^>]*>([\s\S]*?)<\/p>/) || [])[1] || ''
    const snippet = rawSnip
      .replace(/<[^>]+>/g, '')
      .replace(/&ensp;|&nbsp;/g, ' ')
      .replace(/&#0183;|&#183;/g, '·')
      .replace(/阅读更多|查看详情/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (!title) continue
    out.push({ title, url: href, snippet: snippet.slice(0, 300) })
    if (out.length >= n) break
  }
  return out
}

/** Tavily 搜索（可选，需 RESEARCH_TAVILY_KEY；返回更干净、带正文的内容，可用作升级方案） */
async function tavilySearch(query, key, n = 6) {
  const resp = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: key, query, max_results: n, search_depth: 'basic' })
  })
  if (!resp.ok) throw new Error('Tavily ' + resp.status)
  const j = await resp.json()
  return (j.results || []).map((r) => ({
    title: r.title || '',
    url: r.url || '',
    snippet: (r.content || '').slice(0, 300)
  }))
}

async function searchWeb(query, env, n = 6) {
  if (env.RESEARCH_TAVILY_KEY?.trim()) {
    try {
      return await tavilySearch(query, env.RESEARCH_TAVILY_KEY.trim(), n)
    } catch (e) {
      console.warn('[research] Tavily 失败，降级回 Bing：', e.message)
    }
  }
  return bingSearch(query, n)
}

/** 识别游戏名：优先用模型给的 gameName，否则退化成关键词拼接 */
function resolveGameName(recognition) {
  const g = String(recognition?.gameName || '').trim()
  if (g && g !== '未知' && g !== 'unknown' && g !== '未识别') return g
  const kw = (recognition?.keywords || []).filter(Boolean)
  if (kw.length) return kw.slice(0, 3).join(' ')
  return ''
}

/** 过滤明显噪声：词典/汉字解释页、无关字符页等 */
function isNoise(s) {
  const t = s.title || ''
  const u = s.url || ''
  if (/的意思|的解释|拼音|部首|笔顺|汉语文字|国学|字典/.test(t)) return true
  if (/hanyuguoxue|zidian/.test(u)) return true
  return false
}

function buildFacts(sources) {
  if (!sources.length) return ''
  return sources
    .filter((s) => s.url && s.title && !isNoise(s))
    .slice(0, 8)
    .map((s, i) => `来源${i + 1}：${s.title}\n链接：${s.url}\n摘要：${(s.snippet || '').slice(0, 280)}`)
    .join('\n\n')
}

/**
 * 检索该游戏的真实资料，整理成可塞进生成提示词的「事实依据」。
 * 不依赖模型联网，纯服务端抓取；抓不到也不报错，facts 留空即可。
 */
export async function researchGame(env, recognition) {
  const game = resolveGameName(recognition)
  const kw = (recognition?.keywords || []).join(' ')
  const queries = game
    ? [`${game} 官方 游戏介绍`, `${game} 玩法 机制 评测`, `${game} 攻略 wiki`]
    : [kw + ' 游戏 评测 玩法 机制']

  const seen = new Set()
  const sources = []
  for (const q of queries) {
    try {
      const res = await searchWeb(q, env, 5)
      for (const s of res) {
        if (!s.url || seen.has(s.url)) continue
        seen.add(s.url)
        sources.push(s)
      }
    } catch (e) {
      console.warn('[research] 查询失败：', q, e.message)
    }
    if (sources.length >= 8) break
  }

  const used = sources.filter((s) => !isNoise(s))
  const facts = buildFacts(used)

  return {
    ok: true,
    gameName: game,
    searched: Boolean(game),
    queries,
    sources: used,
    facts,
    note: used.length
      ? `已检索到 ${used.length} 条真实资料（官网 / 百科 / 评测媒体）`
      : game
        ? `未检索到「${game}」的公开资料，文案将仅依赖截图证据，且不得编造具体信息`
        : '未识别到游戏名，无法定向检索；文案将仅依赖截图证据'
  }
}

async function handleResearch(env, payload) {
  const recognition = payload.recognition
  if (!recognition) throw new Error('缺少识别结果，请先完成识别')
  return await researchGame(env, recognition)
}

/* ------------------------------ 路由 ------------------------------ */

/** 允许前端在运行时覆盖配置（改模型 / 换 Key 不用重启） */
function resolveConfig(env, payload) {
  const c = payload?.config || {}
  return {
    base: c.base?.trim() || env.VISION_API_BASE,
    key: c.key?.trim() || env.VISION_API_KEY?.trim() || '',
    model: c.model?.trim() || env.VISION_MODEL,
    textModel: c.textModel?.trim() || env.TEXT_MODEL?.trim() || c.model?.trim() || env.VISION_MODEL,
    imageModel: c.imageModel?.trim() || env.IMAGE_MODEL?.trim() || 'wanx2.1-t2i-turbo',
    imageSize: c.imageSize?.trim() || env.IMAGE_SIZE?.trim() || '720*1280',
    videoModel: c.videoModel?.trim() || env.VIDEO_MODEL?.trim() || 'wanx2.1-t2v-turbo',
    imageFallback: String(c.imageFallback ?? env.IMAGE_FALLBACK ?? '1') !== '0'
  }
}

/**
 * 视频模型按「文生 / 图生 + 画质」推导，省得让用户手写模型名。
 * 例：wanx2.1-t2v-plus + mode=i2v -> wanx2.1-i2v-plus
 */
function resolveVideoModel(base, mode, quality) {
  const q = quality === 'plus' ? 'plus' : 'turbo'
  const src = /wanx.*-(t2v|i2v)-(turbo|plus)/.test(base || '') ? base : `wanx2.1-t2v-${q}`
  return src.replace(/-(t2v|i2v)-/, `-${mode}-`).replace(/-(turbo|plus)$/, `-${q}`)
}

async function handleAnalyze(env, payload) {
  const images = (payload.images || []).filter((i) => typeof i?.dataUrl === 'string').slice(0, MAX_IMAGES)
  if (!images.length) throw new Error('请先上传至少一张截图')

  const cfg = resolveConfig(env, payload)
  if (!cfg.key) return { ok: true, mocked: true, data: mockAnalyze(images) }

  const messages = [
    {
      role: 'user',
      content: [
        { type: 'text', text: analyzePrompt(payload.options) },
        ...images.map((img) => ({ type: 'image_url', image_url: { url: img.dataUrl } }))
      ]
    }
  ]

  const raw = await callLLM({
    base: cfg.base,
    key: cfg.key,
    model: cfg.model,
    messages,
    temperature: 0.2,
    maxTokens: 4096
  })

  return { ok: true, mocked: false, data: extractJson(raw) }
}

async function handleGenerate(env, payload) {
  const recognition = payload.recognition
  if (!recognition) throw new Error('缺少识别结果，请先完成识别')

  const cfg = resolveConfig(env, payload)
  if (!cfg.key) return { ok: true, mocked: true, data: mockGenerate(recognition, payload.options) }

  const messages = [{ role: 'user', content: generatePrompt(recognition, payload.options, payload.research) }]

  // 免费小模型有概率吐出残缺 JSON，解析失败就换个温度重试，最多 3 次
  let lastErr
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const raw = await callLLM({
        base: cfg.base,
        key: cfg.key,
        model: cfg.textModel,
        messages,
        // 5 套方案 + 每套 4~6 页大纲，实测 4096 是它的舒适区，再大反而容易写飞
        temperature: attempt === 0 ? 0.9 : 0.6,
        maxTokens: 4096
      })

      const data = extractJson(raw)
      const list = normalizeCandidates(data?.candidates, recognition)
      if (!list.length) throw new Error('模型没有返回候选方案')
      return { ok: true, mocked: false, data: { candidates: list.slice(0, 5) }, attempts: attempt + 1 }
    } catch (e) {
      lastErr = e
      await new Promise((r) => setTimeout(r, 800))
    }
  }
  throw new Error(`连续 3 次生成失败，最后一次原因：${lastErr?.message || lastErr}`)
}

/* ------------------------------ 出图 ------------------------------ */

/** 根据识别结果 + 大纲页，拼一条出图提示词 */
function buildImagePrompt(recognition, candidate, page, opts = {}) {
  const vs = recognition?.visualStyle || {}
  const palette = (vs.palette || [])
    .map((p) => [p.name, p.hex].filter(Boolean).join(' '))
    .filter(Boolean)
    .join('、')

  const parts = []
  const base = [opts.imageStyle || '二次元游戏宣传插画', vs.artStyle, vs.mood].filter(Boolean).join('，')
  if (base) parts.push(base)
  if (palette) parts.push(`主色调参考 ${palette}`)
  parts.push(`画面主题：${candidate?.angle || '种草'}视角下的「${page?.title || candidate?.title || '游戏 moments'}」`)
  if (page?.bullets?.length) parts.push(`画面需要体现：${page.bullets.join('、')}`)
  if (recognition?.gameplay?.type) parts.push(`这是 ${recognition.gameplay.type} 类型的游戏`)
  parts.push('竖版构图，电影级光影，细节丰富，整体高级感')
  parts.push('画面中绝对不要出现任何文字、字母或水印，留出叠加标题的空间')
  return parts.join('。') + '。'
}

/**
 * 免费降级底图：万相不可用（欠费/无额度）时用，纯服务端手搓 SVG，零成本。
 * 取识别结果里的配色做渐变 + 几何光斑，不写字（文字由前端导出时叠加）。
 */
function buildFallbackSvg(recognition, size = '720*1280', seed = 1) {
  const [w, h] = String(size).split('*').map((n) => Number(n) || 0)
  const W = w > 0 ? w : 720
  const H = h > 0 ? h : 1280

  const pal = (recognition?.visualStyle?.palette || [])
    .map((p) => p?.hex)
    .filter((c) => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c.trim()))

  const c1 = pal[0] || '#2b3350'
  const c2 = pal[1] || '#6d4b7d'
  const c3 = pal[2] || '#c98a5e'

  const rnd = (n) => (Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453) % 1
  const blobs = [0, 1, 2, 3]
    .map((i) => {
      const cx = Math.abs(rnd(i + 1)) * W
      const cy = Math.abs(rnd(i + 7)) * H
      const r = (0.18 + Math.abs(rnd(i + 13)) * 0.26) * W
      const fill = [c2, c3, c1, c2][i]
      const op = (0.16 + Math.abs(rnd(i + 21)) * 0.22).toFixed(2)
      return `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${r.toFixed(0)}" fill="${fill}" opacity="${op}"/>`
    })
    .join('')

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<defs>` +
    `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${c1}"/><stop offset="0.55" stop-color="${c2}"/><stop offset="1" stop-color="#0f1117"/>` +
    `</linearGradient>` +
    `<filter id="b"><feGaussianBlur stdDeviation="${Math.round(W * 0.09)}"/></filter>` +
    `</defs>` +
    `<rect width="${W}" height="${H}" fill="url(#g)"/>` +
    `<g filter="url(#b)">${blobs}</g>` +
    `<rect width="${W}" height="${H}" fill="none"/>` +
    `</svg>`

  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`
}

/** 通义万相（异步任务制）：提交 -> 轮询 -> 取图 */
async function generateImage({ key, model, size, prompt }) {
  const submit = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      'X-DashScope-Async': 'enable'
    },
    body: JSON.stringify({
      model,
      input: { prompt },
      parameters: { size, n: 1 }
    })
  })

  const sub = await submit.json()
  const taskId = sub?.output?.task_id
  if (!taskId) {
    // 尺寸不支持时退到方图再试一次
    if (size !== '1024*1024') return generateImage({ key, model, size: '1024*1024', prompt })
    throw new Error(sub?.message || `提交出图任务失败（${submit.status}）`)
  }

  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 2500))
    const poll = await fetch(`https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${key}` }
    })
    const pj = await poll.json()
    const status = pj?.output?.task_status
    if (status === 'SUCCEEDED') {
      const url = pj.output?.results?.[0]?.url
      if (!url) throw new Error('任务成功但没有返回图片地址')
      return url
    }
    if (status === 'FAILED') throw new Error(pj.output?.message || '出图失败')
  }
  throw new Error('出图超时（150s）')
}

async function handleImage(env, payload) {
  const cfg = resolveConfig(env, payload)
  if (!cfg.key) throw new Error('未配置 API Key，无法生成图片')

  const page = payload.page
  if (!page) throw new Error('缺少卡片页数据')

  const prompt = buildImagePrompt(payload.recognition, payload.candidate, page, payload.options)

  let url = ''
  let degraded = ''
  try {
    url = await generateImage({
      key: cfg.key,
      model: cfg.imageModel,
      size: cfg.imageSize,
      prompt
    })
  } catch (e) {
    // 万相要真金白银，欠费时必然失败 —— 降级成本地渐变底图，保证「生成配图」不变成死按钮
    if (!cfg.imageFallback) throw new Error(`AI 出图失败：${e?.message || e}`)
    degraded = e?.message || String(e)
  }

  // 拉回本地转 DataURL，避免直链过期 / 跨域，也方便直接下载
  let dataUrl = ''
  if (url) {
    try {
      const img = await fetch(url)
      const buf = Buffer.from(await img.arrayBuffer())
      dataUrl = `data:image/png;base64,${buf.toString('base64')}`
    } catch {
      /* 拉不回来就只给 URL */
    }
  } else {
    const seed = (page?.page || 1) + String(payload.candidate?.title || '').length
    dataUrl = buildFallbackSvg(payload.recognition, cfg.imageSize, seed)
  }

  return { ok: true, prompt, url, dataUrl, local: !url, degraded }
}

/* ------------------------------ 视频 ------------------------------ */

const VIDEO_API = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis'

/** 文生视频：整段画面都要由模型造出来，所以要把视觉风格讲全 */
function buildVideoPrompt(recognition, candidate, page, opts = {}) {
  const vs = recognition?.visualStyle || {}
  const palette = (vs.palette || [])
    .map((p) => [p.name, p.hex].filter(Boolean).join(' '))
    .filter(Boolean)
    .join('、')

  const parts = []
  const base = [opts.imageStyle || '二次元游戏宣传画面', vs.artStyle, vs.mood].filter(Boolean).join('，')
  if (base) parts.push(base)
  if (palette) parts.push(`主色调参考 ${palette}`)
  parts.push(`画面主题：${candidate?.angle || '种草'}视角下的「${page?.title || candidate?.title || '游戏精彩瞬间'}」`)
  if (page?.bullets?.length) parts.push(`画面需要体现：${page.bullets.join('、')}`)
  if (recognition?.gameplay?.type) parts.push(`这是 ${recognition.gameplay.type} 类型的游戏`)
  parts.push(opts.motion?.trim() || '镜头缓慢推进')
  parts.push('电影级光影，细节丰富，画面稳定不闪烁')
  parts.push('画面中绝对不要出现任何文字、字母或水印')
  return parts.join('。') + '。'
}

/** 图生视频：画面已由底图决定，只描述镜头怎么动 */
function buildMotionPrompt(opts = {}) {
  const motion = opts.motion?.trim() || '镜头缓慢推进'
  return `${motion}，保持画面主体与构图不变，光影自然流动，细节稳定，不要出现任何文字、字母或水印。`
}

/** 提交视频任务，返回 taskId（异步任务制，之后靠 /api/video-status 轮询） */
async function submitVideo({ key, model, mode, prompt, imgUrl, resolution, duration }) {
  const input = mode === 'i2v' ? { img_url: imgUrl, prompt } : { prompt }

  const resp = await fetch(VIDEO_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      'X-DashScope-Async': 'enable'
    },
    body: JSON.stringify({
      model,
      input,
      parameters: { resolution, duration: Number(duration) || 5 }
    })
  })

  const j = await resp.json()
  const taskId = j?.output?.task_id
  if (!taskId) {
    const msg = String(j?.message || '')
    if (/good standing|Arrearage|overdue|欠费|no available/i.test(msg)) {
      throw new Error(
        '视频生成（通义万相）需要账户有余额，当前百炼账户欠费或额度不足。' +
          '免费模型只覆盖文字与识图，视频和 AI 出图得充值后才能用。'
      )
    }
    throw new Error(msg || `提交视频任务失败（${resp.status}）`)
  }
  return taskId
}

async function queryVideoTask(key, taskId) {
  const resp = await fetch(`https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`, {
    headers: { Authorization: `Bearer ${key}` }
  })
  const j = await resp.json()
  const o = j?.output || {}
  return {
    status: o.task_status || 'UNKNOWN',
    url: o.video_url || o.results?.[0]?.url || '',
    message: o.message || j?.message || ''
  }
}

async function handleVideoSubmit(env, payload) {
  const cfg = resolveConfig(env, payload)
  if (!cfg.key) throw new Error('未配置 API Key，无法生成视频')

  const mode = payload.mode === 'i2v' ? 'i2v' : 't2v'
  const imgUrl = mode === 'i2v' ? String(payload.imgUrl || '') : ''
  if (mode === 'i2v' && !imgUrl) throw new Error('图生视频需要一张底图')

  const prompt =
    payload.prompt?.trim() ||
    (mode === 'i2v'
      ? buildMotionPrompt(payload.options)
      : buildVideoPrompt(payload.recognition, payload.candidate, payload.page, payload.options))

  const model = resolveVideoModel(cfg.videoModel, mode, payload.quality)
  const taskId = await submitVideo({
    key: cfg.key,
    model,
    mode,
    prompt,
    imgUrl,
    resolution: payload.resolution || '720P',
    duration: payload.duration || 5
  })

  return { ok: true, taskId, model, prompt }
}

async function handleVideoStatus(env, payload) {
  const cfg = resolveConfig(env, payload)
  if (!cfg.key) throw new Error('未配置 API Key')
  if (!payload.taskId) throw new Error('缺少 taskId')

  const r = await queryVideoTask(cfg.key, payload.taskId)
  return { ok: true, ...r }
}

/** 连通性自检：只发一条极短的消息，验证 base / key / model 三件套 */
async function handleTest(env, payload) {
  const cfg = resolveConfig(env, payload)
  if (!cfg.key) throw new Error('还没有填 API Key')

  const which = payload.which === 'text' ? 'textModel' : 'model'
  const raw = await callLLM({
    base: cfg.base,
    key: cfg.key,
    model: cfg[which],
    messages: [{ role: 'user', content: '回复 JSON：{"ok":true}' }],
    temperature: 0
  })
  return { ok: true, reply: raw.slice(0, 120) }
}

export function createApiMiddleware(env = {}) {
  return async function apiMiddleware(req, res, next) {
    const url = req.url || ''
    if (!url.startsWith('/api/')) return next()

    try {
      if (req.method === 'GET' && url.startsWith('/api/health')) {
        return sendJson(res, 200, {
          ok: true,
          configured: Boolean(env.VISION_API_KEY?.trim()),
          base: env.VISION_API_BASE || '',
          model: env.VISION_MODEL || '',
          textModel: env.TEXT_MODEL?.trim() || env.VISION_MODEL || '',
          imageModel: env.IMAGE_MODEL?.trim() || 'wanx2.1-t2i-turbo',
          videoModel: env.VIDEO_MODEL?.trim() || 'wanx2.1-t2v-turbo'
        })
      }

      /**
       * 视频代理：结果直链是带签名的 OSS 地址，会过期且可能跨域。
       * 这里服务端中转一层，顺带支持 Range（拖动进度条要用）。
       */
      if (req.method === 'GET' && url.startsWith('/api/video-proxy')) {
        const q = new URL(url, 'http://127.0.0.1').searchParams
        const target = q.get('url') || ''
        const dl = q.get('dl') === '1'

        // 只允许中转阿里云 OSS，避免被当成任意代理（SSRF）
        if (!/^https:\/\/[a-z0-9.-]*aliyuncs\.com\//i.test(target)) {
          return sendJson(res, 400, { ok: false, error: '非法的视频地址' })
        }

        try {
          const headers = {}
          if (req.headers.range) headers.Range = req.headers.range
          const upstream = await fetch(target, { headers })
          const buf = Buffer.from(await upstream.arrayBuffer())

          res.statusCode = upstream.status === 206 ? 206 : 200
          res.setHeader('Content-Type', 'video/mp4')
          res.setHeader('Accept-Ranges', 'bytes')
          res.setHeader('Content-Length', buf.length)
          const cr = upstream.headers.get('content-range')
          if (cr) res.setHeader('Content-Range', cr)
          if (dl) {
            res.setHeader(
              'Content-Disposition',
              `attachment; filename="xhs-video.mp4"; filename*=UTF-8''${encodeURIComponent('小红书视频.mp4')}`
            )
          }
          res.end(buf)
        } catch (e) {
          return sendJson(res, 502, { ok: false, error: '视频拉取失败：' + (e?.message || e) })
        }
        return
      }

      if (req.method !== 'POST') {
        return sendJson(res, 405, { ok: false, error: '仅支持 POST' })
      }

      const payload = await readJson(req)

      if (url.startsWith('/api/analyze')) {
        return sendJson(res, 200, await handleAnalyze(env, payload))
      }
      if (url.startsWith('/api/research')) {
        return sendJson(res, 200, await handleResearch(env, payload))
      }
      if (url.startsWith('/api/generate')) {
        return sendJson(res, 200, await handleGenerate(env, payload))
      }
      if (url.startsWith('/api/image')) {
        return sendJson(res, 200, await handleImage(env, payload))
      }
      if (url.startsWith('/api/video-submit')) {
        return sendJson(res, 200, await handleVideoSubmit(env, payload))
      }
      if (url.startsWith('/api/video-status')) {
        return sendJson(res, 200, await handleVideoStatus(env, payload))
      }
      if (url.startsWith('/api/test')) {
        return sendJson(res, 200, await handleTest(env, payload))
      }

      return sendJson(res, 404, { ok: false, error: '接口不存在：' + url })
    } catch (err) {
      return sendJson(res, 200, { ok: false, error: err?.message || String(err) })
    }
  }
}
