<script setup>
import { ref, computed } from 'vue'
import { copyText } from '../utils/image.js'
import { downloadBlob, safeName } from '../utils/compose.js'
import { generateImage } from '../api.js'
import ExportDialog from './ExportDialog.vue'
import VideoDialog from './VideoDialog.vue'

const MAX_IMAGES = 4

const props = defineProps({
  item: { type: Object, required: true },
  index: { type: Number, required: true },
  cover: { type: String, default: '' },
  recognition: { type: Object, default: null },
  research: { type: Object, default: null }
})

// 是否经过联网资料核验（事实依据）
const verified = computed(() => Boolean(props.research?.sources?.length))

const copied = ref('')
const preview = ref(false)
const slide = ref(0)
const exporting = ref(false)
const videoOpen = ref(false)
const videoUrl = ref('')

// 每页对应的 AI 配图，数组下标 = 页码
const images = ref([])
const imgLoading = ref(false)
const imgDone = ref(0)
const imgError = ref('')
const aborted = ref(false)
/** 出图被降级为本地底图时，记下原因好如实告诉用户 */
const localNote = ref('')

const pages = computed(() => props.item.cardOutline || [])
const targetPages = computed(() => pages.value.slice(0, MAX_IMAGES))
// 轮播 = 封面 + 每一页大纲，所以总页数是 大纲页数 + 1
const total = computed(() => (pages.value.length ? pages.value.length + 1 : 1))
// slide 0 是封面，slide k 对应大纲第 k 页
const cur = computed(() => (slide.value === 0 ? null : pages.value[slide.value - 1] || null))

// 假的互动数据，按标题长度稳定生成，避免每次渲染跳动
const stats = computed(() => {
  const n = (props.item.title || '').length
  return {
    like: 120 + ((n * 37) % 880),
    star: 30 + ((n * 17) % 270),
    comment: 5 + ((n * 7) % 95)
  }
})

function togglePreview() {
  preview.value = !preview.value
  slide.value = 0
}
function go(delta) {
  slide.value = (slide.value + delta + total.value) % total.value
}

/** 当前幻灯片用的图：AI 配图优先，否则用用户上传的截图 */
const slideSrc = computed(() => {
  // 封面用用户选的截图；大纲第 k 页用第 k 张 AI 配图
  if (slide.value === 0) return props.cover
  const gen = images.value[slide.value - 1]
  if (gen?.dataUrl) return gen.dataUrl
  if (gen?.url) return gen.url
  return props.cover
})
const slideIsAI = computed(() =>
  slide.value === 0 ? false : Boolean(images.value[slide.value - 1])
)

async function runGenerateImages() {
  if (imgLoading.value) return
  imgLoading.value = true
  imgError.value = ''
  localNote.value = ''
  aborted.value = false
  imgDone.value = 0
  images.value = []

  // 逐张生成，边生成边能在预览里看到进度
  for (let i = 0; i < targetPages.value.length; i++) {
    if (aborted.value) break
    try {
      const res = await generateImage({
        recognition: props.recognition,
        candidate: props.item,
        page: targetPages.value[i]
      })
      if (aborted.value) break
      images.value[i] = { url: res.url, dataUrl: res.dataUrl, local: !!res.local }
      // 万相走不通时服务端会给本地渐变底图，如实告诉用户，别让他以为是 AI 画得烂
      if (res.local && !localNote.value) localNote.value = res.degraded || '通义万相当前不可用'
      imgDone.value = i + 1
    } catch (e) {
      if (!aborted.value) imgError.value = e.message || '出图失败'
      break
    }
  }
  imgLoading.value = false
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/** 用 Blob URL 下载：iOS Safari 对超大 dataUrl 的 <a download> 会静默失败 */
async function download(slot) {
  const img = images.value[slot]
  const href = img?.dataUrl || img?.url
  if (!href) return
  // 本地降级底图是 SVG，扩展名要跟着换，否则存成 .png 打不开
  const ext = img?.local ? 'svg' : 'png'
  const name = `${safeName(props.item.title, 'card')}-P${slot + 1}.${ext}`
  try {
    const blob = await (await fetch(href)).blob()
    downloadBlob(blob, name)
  } catch {
    const a = document.createElement('a')
    a.href = href
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
  }
}

async function downloadAll() {
  for (let i = 0; i < images.value.length; i++) {
    if (images.value[i]) await download(i)
    await wait(220)
  }
}

async function copy(field, text) {
  const ok = await copyText(text || '')
  copied.value = ok ? field : ''
  setTimeout(() => (copied.value = ''), 1400)
}

function fullText() {
  const c = props.item
  const outline = (c.cardOutline || [])
    .map((p) => `P${p.page} ${p.title}\n  - ${(p.bullets || []).join('\n  - ')}`)
    .join('\n')
  return `【${c.angle}】\n${c.title}\n\n${c.body}\n\n${(c.tags || []).join(' ')}\n\n卡片大纲：\n${outline}`
}
</script>

<template>
  <div class="cand">
    <div class="cand-top">
      <span class="idx">{{ index + 1 }}</span>
      <span class="tag brand">{{ item.angle }}</span>
      <span v-if="verified" class="tag ok">✓ 已联网核验</span>
      <span class="spacer"></span>
      <button class="btn mini" :disabled="imgLoading" @click="runGenerateImages">
        <span v-if="imgLoading" class="spin dark"></span>
        {{ imgLoading ? `出图 ${imgDone}/${targetPages.length}` : images.length ? '🎨 重新出图' : '🎨 生成配图' }}
      </button>
      <button class="btn mini" @click="exporting = true">🖼️ 导出成品图</button>
      <button class="btn mini" @click="videoOpen = true">
        {{ videoUrl ? '🎬 重新生成视频' : '🎬 生成视频' }}
      </button>
      <button v-if="videoUrl" class="btn mini" @click="videoOpen = true">▶️ 看视频</button>
      <button class="btn mini" @click="togglePreview">
        {{ preview ? '收起预览' : '📱 小红书预览' }}
      </button>
      <button class="btn mini" @click="copy('title', item.title)">
        {{ copied === 'title' ? '已复制' : '复制标题' }}
      </button>
      <button class="btn mini" @click="copy('body', item.body)">
        {{ copied === 'body' ? '已复制' : '复制正文' }}
      </button>
      <button class="btn mini" @click="copy('all', fullText())">
        {{ copied === 'all' ? '已复制' : '复制全文' }}
      </button>
    </div>

    <!-- 小红书手机预览 -->
    <div v-if="preview" class="pv-wrap">
      <div class="phone">
        <div class="screen">
          <!-- 顶部状态栏 -->
          <div class="bar">
            <span>20:14</span>
            <span class="notch"></span>
            <span>🔋 78%</span>
          </div>

          <!-- 图片轮播区（3:4） -->
          <div class="carousel">
            <img v-if="slideSrc" class="slide-bg" :src="slideSrc" alt="封面" />
            <div v-else class="slide-bg noimg">未选择封面图</div>
            <div class="scrim"></div>

            <div v-if="imgLoading && !images[slide - 1]" class="gen-tip">🎨 正在生成这一页配图…</div>
            <div v-if="slideIsAI" class="gen-badge">
              {{ images[slide - 1]?.local ? '本地底图' : 'AI 配图' }}
            </div>

            <button v-if="slideIsAI" class="dl" @click="download(slide - 1)">下载本页</button>

            <div class="slide-text">
              <div v-if="slide === 0" class="slide-title">{{ item.title }}</div>
              <template v-else>
                <div class="slide-title">{{ cur?.title }}</div>
                <ul>
                  <li v-for="(b, i) in cur?.bullets || []" :key="i">{{ b }}</li>
                </ul>
              </template>
            </div>

            <div class="dots">
              <span v-for="i in total" :key="i" class="dot" :class="{ on: i - 1 === slide }"></span>
            </div>

            <button class="nav prev" @click="go(-1)">‹</button>
            <button class="nav next" @click="go(1)">›</button>
            <div class="pager">{{ slide + 1 }}/{{ total }}</div>
          </div>

          <!-- 正文区 -->
          <div class="detail">
            <div class="author">
              <span class="avatar">游</span>
              <span class="name">游戏安利局</span>
              <button class="follow">关注</button>
            </div>

            <div class="pv-title">{{ item.title }}</div>
            <div class="pv-body">{{ item.body }}</div>

            <div class="pv-tags">
              <span v-for="(t, i) in item.tags || []" :key="i">{{ t }}</span>
            </div>

            <div class="pv-meta">今天 20:14 · 上海</div>
          </div>

          <!-- 底部互动栏 -->
          <div class="actions">
            <span class="fake-input">说点什么...</span>
            <span>❤️ {{ stats.like }}</span>
            <span>⭐ {{ stats.star }}</span>
            <span>💬 {{ stats.comment }}</span>
          </div>
        </div>
      </div>

      <div v-if="imgError" class="pv-err">⚠️ {{ imgError }}</div>
      <div v-else-if="localNote" class="pv-err">
        ⚠️ AI 出图不可用，已改用本地渐变底图（免费）：{{ localNote }}
      </div>

      <div class="pv-foot">
        <template v-if="imgLoading">
          <span>🎨 正在逐页出图 {{ imgDone }}/{{ targetPages.length }}（每张约 15 秒）</span>
          <button class="btn mini" @click="aborted = true">停止</button>
        </template>
        <template v-else-if="images.length">
          <span>
            已生成 {{ images.filter(Boolean).length }} 张{{
              images.filter(Boolean).every((i) => i.local) ? '本地底图（免费）' : '配图'
            }}
          </span>
          <button class="btn mini" @click="downloadAll">下载全部</button>
          <button class="btn mini" @click="images = []">用回原截图</button>
        </template>
        <template v-else>
          <span>当前用你的截图占位 · 点「生成配图」按大纲 AI 出图</span>
        </template>
      </div>
    </div>

    <div class="cand-body">
      <div class="title-line">{{ item.title }}</div>
      <div v-if="item.hook" class="hook-line">钩子：{{ item.hook }}</div>

      <div class="body-text">{{ item.body }}</div>

      <div class="sub-h">🏷️ 标签</div>
      <div class="tags">
        <span v-for="(t, i) in item.tags || []" :key="i" class="tag">{{ t }}</span>
      </div>

      <div class="sub-h">🗂️ 卡片大纲</div>
      <div class="outline">
        <div v-for="p in pages" :key="p.page" class="ol-page">
          <div class="p">第 {{ p.page }} 页</div>
          <div class="t">{{ p.title }}</div>
          <ul>
            <li v-for="(b, i) in p.bullets || []" :key="i">{{ b }}</li>
          </ul>
        </div>
      </div>
    </div>

    <ExportDialog
      v-if="exporting"
      :item="item"
      :pages="pages"
      :images="images"
      :cover="cover"
      @close="exporting = false"
    />

    <VideoDialog
      v-if="videoOpen"
      :item="item"
      :pages="pages"
      :images="images"
      :cover="cover"
      :recognition="recognition"
      :video-url="videoUrl"
      @done="(u) => (videoUrl = u)"
      @close="videoOpen = false"
    />
  </div>
</template>

<style scoped>
.pv-wrap {
  padding: 16px;
  background: #fbfbfc;
  border-bottom: 1px solid var(--line);
}

.pv-hint {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--muted);
  text-align: center;
}

.phone {
  width: 320px;
  margin: 0 auto;
  background: #10131a;
  border-radius: 34px;
  padding: 9px;
  box-shadow: 0 12px 30px rgba(16, 24, 40, 0.18);
}

.screen {
  background: #fff;
  border-radius: 27px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  height: 620px;
  position: relative;
}

.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px 2px;
  font-size: 11px;
  color: #333;
  flex-shrink: 0;
}

.notch {
  width: 56px;
  height: 14px;
  border-radius: 999px;
  background: #10131a;
}

.carousel {
  position: relative;
  aspect-ratio: 3 / 4;
  background: #ddd;
  flex-shrink: 0;
  overflow: hidden;
}

.slide-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.slide-bg.noimg {
  display: grid;
  place-items: center;
  color: #fff;
  font-size: 13px;
  background: linear-gradient(135deg, #8a94a6, #4d5666);
}

.scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.15) 0%, rgba(0, 0, 0, 0.15) 40%, rgba(0, 0, 0, 0.72) 100%);
}

.slide-text {
  position: absolute;
  left: 18px;
  right: 18px;
  bottom: 34px;
  color: #fff;
}

.slide-title {
  font-size: 19px;
  font-weight: 700;
  line-height: 1.4;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
}

.slide-text ul {
  margin: 8px 0 0;
  padding-left: 17px;
  font-size: 12.5px;
  line-height: 1.7;
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.45);
}

.dots {
  position: absolute;
  bottom: 12px;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  gap: 5px;
}

.dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.5);
}

.dot.on {
  background: #fff;
  width: 12px;
  border-radius: 3px;
}

.nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.32);
  color: #fff;
  font-size: 17px;
  line-height: 1;
  padding: 0;
  opacity: 0;
  transition: opacity 0.15s;
}

.carousel:hover .nav {
  opacity: 1;
}

.nav.prev {
  left: 8px;
}

.nav.next {
  right: 8px;
}

.pv-foot {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--muted);
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.pv-err {
  margin: 8px 0 0;
  padding: 7px 11px;
  border-radius: 8px;
  background: var(--warn-soft);
  color: var(--warn);
  font-size: 12.5px;
  text-align: center;
}

.gen-tip {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: #fff;
  font-size: 13px;
  background: rgba(20, 24, 33, 0.45);
  z-index: 3;
}

.gen-badge {
  position: absolute;
  top: 10px;
  left: 10px;
  background: linear-gradient(135deg, #ff6b81, #ff2442);
  color: #fff;
  font-size: 11px;
  padding: 2px 9px;
  border-radius: 999px;
  z-index: 2;
}

.dl {
  position: absolute;
  bottom: 52px;
  right: 12px;
  border: 1px solid rgba(255, 255, 255, 0.7);
  background: rgba(0, 0, 0, 0.35);
  color: #fff;
  font-size: 11.5px;
  padding: 3px 11px;
  border-radius: 999px;
  z-index: 2;
}

.dl:hover {
  background: rgba(0, 0, 0, 0.6);
}

.pager {
  position: absolute;
  top: 10px;
  right: 10px;
  background: rgba(0, 0, 0, 0.4);
  color: #fff;
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 999px;
}

.detail {
  flex: 1;
  overflow-y: auto;
  padding: 10px 14px 6px;
}

.author {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 8px;
}

.avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: linear-gradient(135deg, #ff6b81, #ff2442);
  color: #fff;
  display: grid;
  place-items: center;
  font-size: 13px;
  font-weight: 700;
  flex-shrink: 0;
}

.name {
  font-size: 13px;
  font-weight: 600;
  flex: 1;
}

.follow {
  border: 1px solid var(--brand);
  color: var(--brand);
  background: #fff;
  border-radius: 999px;
  padding: 2px 13px;
  font-size: 12px;
}

.pv-title {
  font-size: 15.5px;
  font-weight: 700;
  line-height: 1.45;
  margin-bottom: 5px;
}

.pv-body {
  font-size: 12.8px;
  line-height: 1.75;
  color: #333;
  white-space: pre-wrap;
}

.pv-tags {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.pv-tags span {
  color: #13386c;
  font-size: 12.5px;
}

.pv-meta {
  margin-top: 10px;
  font-size: 11.5px;
  color: #999;
}

.actions {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  border-top: 1px solid var(--line);
  font-size: 12px;
  color: #333;
  flex-shrink: 0;
  background: #fff;
}

.fake-input {
  flex: 1;
  background: #f4f4f6;
  border-radius: 999px;
  padding: 5px 12px;
  color: #999;
  font-size: 12px;
}

/* ---------- 手机端 ---------- */
@media (max-width: 700px) {
  .phone {
    width: 100%;
    max-width: 320px;
    border-radius: 30px;
  }
  .screen {
    height: min(620px, 76vh);
  }
  /* 手机上没有 hover，翻页箭头常显 */
  .nav {
    opacity: 1;
    width: 30px;
    height: 30px;
  }
  .pv-foot {
    flex-wrap: wrap;
    gap: 6px 10px;
  }
}
</style>
