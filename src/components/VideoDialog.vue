<script setup>
import { ref, computed, watchEffect, onUnmounted } from 'vue'
import { submitVideo, videoStatus, videoProxyUrl } from '../api.js'
import { compressDataUrl } from '../utils/image.js'
import { composeCard, loadStyle } from '../utils/compose.js'

const props = defineProps({
  item: { type: Object, required: true },
  pages: { type: Array, default: () => [] },
  images: { type: Array, default: () => [] },
  cover: { type: String, default: '' },
  recognition: { type: Object, default: null },
  videoUrl: { type: String, default: '' }
})
const emit = defineEmits(['close', 'done'])

const MOTIONS = [
  { id: '镜头缓慢推进，画面轻微呼吸感', label: '缓慢推进' },
  { id: '镜头缓缓拉远，展现完整场景', label: '缓缓拉远' },
  { id: '镜头环绕主体平移，视差感', label: '环绕平移' },
  { id: '主体轻微动作，镜头保持静止', label: '主体微动' },
  { id: '光影流动，粒子与光效缓缓飘动', label: '光影流动' }
]

const RESOLUTIONS = [
  { id: '720P', label: '720P 横版', hint: '最快' },
  { id: '1080P', label: '1080P 横版' },
  { id: '720*1280', label: '720×1280 竖版', hint: '小红书' },
  { id: '1080*1920', label: '1080×1920 竖版' }
]

const mode = ref('i2v')
const srcKind = ref('raw') // raw | composed
const srcIdx = ref(0) // 0 = 封面，n = 大纲第 n 页
const motion = ref(MOTIONS[0].id)
const quality = ref('turbo')
const resolution = ref('720*1280')

const phase = ref('idle') // idle | running | done | error
const error = ref('')
const taskId = ref('')
const usedModel = ref('')
const videoUrl = ref(props.videoUrl || '')
const elapsed = ref(0)
const dims = ref('')
const stopFlag = ref(false)
const promptTouched = ref(false)
const prompt = ref('')

let timer = null
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/** 轮播槽位：封面 + 每一页大纲，跟卡片预览一致 */
const slots = computed(() => [
  { idx: 0, label: '封面' },
  ...props.pages.map((p, i) => ({ idx: i + 1, label: `第 ${p.page ?? i + 1} 页` }))
])
const curPage = computed(() => (srcIdx.value === 0 ? null : props.pages[srcIdx.value - 1] || null))

const baseSrc = computed(() => {
  if (srcIdx.value === 0) return props.cover
  const g = props.images[srcIdx.value - 1]
  return g?.dataUrl || g?.url || props.cover
})
const hasAI = computed(() => srcIdx.value > 0 && Boolean(props.images[srcIdx.value - 1]))

function autoPrompt() {
  const vs = props.recognition?.visualStyle || {}
  const palette = (vs.palette || [])
    .map((p) => [p.name, p.hex].filter(Boolean).join(' '))
    .filter(Boolean)
    .join('、')
  const page = curPage.value
  const parts = []

  if (mode.value === 'i2v') {
    parts.push(motion.value)
    parts.push('保持画面主体与构图不变，光影自然流动，细节稳定，不要出现任何文字、字母或水印')
    return parts.join('，') + '。'
  }

  const base = ['二次元游戏宣传画面', vs.artStyle, vs.mood].filter(Boolean).join('，')
  if (base) parts.push(base)
  if (palette) parts.push(`主色调参考 ${palette}`)
  parts.push(
    `画面主题：${props.item?.angle || '种草'}视角下的「${page?.title || props.item?.title || '游戏精彩瞬间'}」`
  )
  if (page?.bullets?.length) parts.push(`画面需要体现：${page.bullets.join('、')}`)
  if (props.recognition?.gameplay?.type) parts.push(`这是 ${props.recognition.gameplay.type} 类型的游戏`)
  parts.push(motion.value)
  parts.push('电影级光影，细节丰富，画面稳定不闪烁')
  parts.push('画面中绝对不要出现任何文字、字母或水印')
  return parts.join('。') + '。'
}

watchEffect(() => {
  if (!promptTouched.value) prompt.value = autoPrompt()
})

onUnmounted(() => timer && clearInterval(timer))

/** 用导出用的合成器现做一张带标题的成品图当底图 */
async function composeSource() {
  const page = curPage.value
  const canvas = await composeCard({
    src: baseSrc.value,
    title: srcIdx.value === 0 ? props.item.title : page?.title,
    bullets: srcIdx.value === 0 ? (props.item.hook ? [props.item.hook] : []) : page?.bullets || [],
    pageLabel: '',
    style: { ...loadStyle(), showPager: false }
  })
  return canvas.toDataURL('image/jpeg', 0.92)
}

async function run() {
  if (phase.value === 'running') return
  error.value = ''
  stopFlag.value = false
  videoUrl.value = ''
  dims.value = ''
  phase.value = 'running'
  elapsed.value = 0

  const t0 = Date.now()
  timer = setInterval(() => (elapsed.value = Math.round((Date.now() - t0) / 1000)), 1000)

  try {
    let imgUrl = ''
    if (mode.value === 'i2v') {
      const raw = srcKind.value === 'composed' ? await composeSource() : baseSrc.value
      if (!raw) throw new Error('没有可用的底图，请先上传截图或生成配图')
      // 底图整张进请求体，不压的话提交就要等好几分钟
      imgUrl = await compressDataUrl(raw, 720, 0.82)
    }

    const sub = await submitVideo({
      mode: mode.value,
      prompt: prompt.value,
      imgUrl,
      quality: quality.value,
      resolution: resolution.value,
      duration: 5,
      recognition: props.recognition,
      candidate: props.item,
      page: curPage.value,
      options: { motion: motion.value }
    })
    taskId.value = sub.taskId
    usedModel.value = sub.model

    while (!stopFlag.value && Date.now() - t0 < 8 * 60 * 1000) {
      await wait(4000)
      const s = await videoStatus(taskId.value)
      if (s.status === 'SUCCEEDED') {
        videoUrl.value = s.url
        phase.value = 'done'
        emit('done', s.url)
        break
      }
      if (s.status === 'FAILED') throw new Error(s.message || '视频生成失败')
    }

    if (stopFlag.value && !videoUrl.value) {
      phase.value = 'idle'
      return
    }
    if (!videoUrl.value) throw new Error('视频生成超时（8 分钟），请重试')
  } catch (e) {
    error.value = e?.message || '生成失败'
    phase.value = 'error'
  } finally {
    timer && clearInterval(timer)
  }
}

function onMeta(e) {
  const v = e.target
  dims.value = v.videoWidth && v.videoHeight ? `${v.videoWidth}×${v.videoHeight}` : ''
}

const proxySrc = computed(() => (videoUrl.value ? videoProxyUrl(videoUrl.value) : ''))
const dlHref = computed(() => (videoUrl.value ? videoProxyUrl(videoUrl.value, true) : ''))

const eta = computed(() => (quality.value === 'plus' ? '约 1-2 分钟' : '约 20 秒 - 2 分钟'))
</script>

<template>
  <div class="mask" @click.self="emit('close')">
    <div class="dialog">
      <div class="d-head">
        <span class="h">🎬 生成视频</span>
        <span v-if="usedModel" class="tag">{{ usedModel }}</span>
        <span class="spacer"></span>
        <button class="btn ghost" @click="emit('close')">×</button>
      </div>

      <div class="body">
        <!-- 左：底图 / 播放器 -->
        <div class="stage-col">
          <div class="stage">
            <video
              v-if="videoUrl"
              class="player"
              :src="proxySrc"
              controls
              playsinline
              loop
              @loadedmetadata="onMeta"
            ></video>

            <div v-else-if="phase === 'running'" class="running">
              <span class="spin dark"></span>
              <div class="t1">正在生成视频…</div>
              <div class="t2">已等待 {{ elapsed }} 秒 · {{ eta }}</div>
              <div class="t3">视频是异步任务，可以先把这页放着去干别的</div>
              <button class="btn mini" @click="stopFlag = true">停止</button>
            </div>

            <img v-else-if="mode === 'i2v' && baseSrc" class="srcimg" :src="baseSrc" alt="底图" />
            <div v-else-if="mode === 'i2v'" class="empty">没有可用底图，请先上传截图</div>
            <div v-else class="empty t2v">
              文生视频<br /><span class="s">画面完全由提示词生成，不需要底图</span>
            </div>
          </div>

          <div class="meta">
            <span v-if="dims" class="tag ok">{{ dims }}</span>
            <span v-if="videoUrl" class="tag ok">5 秒</span>
            <span v-if="mode === 'i2v'" class="tag">
              {{ srcKind === 'composed' ? '底图：合成成品图' : hasAI ? '底图：AI 配图' : '底图：你的截图' }}
            </span>
          </div>
        </div>

        <!-- 右：参数 -->
        <div class="ctrl-col">
          <div class="field">
            <label>生成方式</label>
            <div class="chips">
              <button class="chip" :class="{ on: mode === 'i2v' }" @click="mode = 'i2v'">图生视频</button>
              <button class="chip" :class="{ on: mode === 't2v' }" @click="mode = 't2v'">文生视频</button>
            </div>
            <p class="tip">
              <template v-if="mode === 'i2v'">
                让现有这张图动起来，画面主体不变 —— 出片最稳
              </template>
              <template v-else>
                从零生成画面，风格统一但要碰运气；适合还没有配图时先出个片
              </template>
            </p>
          </div>

          <template v-if="mode === 'i2v'">
            <div class="field">
              <label>用哪一页的画面</label>
              <div class="chips wrap">
                <button
                  v-for="s in slots"
                  :key="s.idx"
                  class="chip"
                  :class="{ on: srcIdx === s.idx }"
                  @click="srcIdx = s.idx"
                >
                  {{ s.label }}
                </button>
              </div>
            </div>

            <div class="field">
              <label>底图用什么</label>
              <div class="chips">
                <button class="chip" :class="{ on: srcKind === 'raw' }" @click="srcKind = 'raw'">
                  原图
                </button>
                <button class="chip" :class="{ on: srcKind === 'composed' }" @click="srcKind = 'composed'">
                  合成成品图（带标题）
                </button>
              </div>
              <p class="tip">
                选「合成成品图」会按导出设置把标题压到底图上再生成 —— 出来就是能直接发的带字视频
              </p>
            </div>
          </template>

          <div class="field">
            <label>镜头运动</label>
            <div class="chips wrap">
              <button
                v-for="m in MOTIONS"
                :key="m.id"
                class="chip"
                :class="{ on: motion === m.id }"
                @click="motion = m.id; promptTouched = false"
              >
                {{ m.label }}
              </button>
            </div>
          </div>

          <div class="field">
            <label>画质档位</label>
            <div class="chips">
              <button class="chip" :class="{ on: quality === 'turbo' }" @click="quality = 'turbo'">
                turbo · 快
              </button>
              <button class="chip" :class="{ on: quality === 'plus' }" @click="quality = 'plus'">
                plus · 精细
              </button>
            </div>
            <p class="tip">{{ eta }}（plus 明显更慢但细节更好）</p>
          </div>

          <div class="field">
            <label>分辨率</label>
            <div class="chips wrap">
              <button
                v-for="r in RESOLUTIONS"
                :key="r.id"
                class="chip"
                :class="{ on: resolution === r.id }"
                @click="resolution = r.id"
              >
                {{ r.label }}<span v-if="r.hint" class="hint"> · {{ r.hint }}</span>
              </button>
            </div>
            <p class="tip">
              竖版更贴小红书；模型若不支持会回落横版，生成后左上角会显示实际尺寸
            </p>
          </div>

          <div class="field">
            <label>提示词（可改）</label>
            <textarea
              class="control area"
              rows="5"
              v-model="prompt"
              @input="promptTouched = true"
            ></textarea>
            <button v-if="promptTouched" class="btn mini" @click="promptTouched = false">恢复自动</button>
          </div>
        </div>
      </div>

      <div class="d-actions">
        <span v-if="phase === 'running'" class="tag warn">生成中…不要关闭页面</span>
        <span class="spacer"></span>
        <button class="btn" @click="emit('close')">关闭</button>
        <a v-if="videoUrl" class="btn primary" :href="dlHref" download>⬇️ 下载视频</a>
        <button class="btn primary" :disabled="phase === 'running'" @click="run">
          <span v-if="phase === 'running'" class="spin dark"></span>
          {{ videoUrl ? '🎬 重新生成' : '🎬 开始生成' }}
        </button>
      </div>

      <div v-if="error" class="result bad">⚠️ {{ error }}</div>
      <div v-if="videoUrl" class="result ok">
        ✅ 视频已生成 · 可直接在上方播放，或下载后上传小红书
      </div>
    </div>
  </div>
</template>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  background: rgba(16, 24, 40, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 60;
  padding: 20px;
}

.dialog {
  width: min(1000px, 100%);
  max-height: 92vh;
  background: #fff;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 24px 60px rgba(16, 24, 40, 0.28);
}

.d-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--line);
}
.d-head .h {
  font-size: 15px;
  font-weight: 700;
}
.spacer {
  flex: 1;
}

.body {
  display: flex;
  gap: 18px;
  padding: 16px 18px;
  overflow-y: auto;
  flex: 1;
}

.stage-col {
  width: 340px;
  flex-shrink: 0;
}

.stage {
  width: 100%;
  aspect-ratio: 3 / 4;
  background: #f4f5f7;
  border-radius: 12px;
  overflow: hidden;
  display: grid;
  place-items: center;
  border: 1px solid var(--line);
}

.player,
.srcimg {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #000;
  display: block;
}

.srcimg {
  object-fit: cover;
}

.empty {
  color: var(--muted);
  font-size: 13px;
  text-align: center;
  padding: 20px;
  line-height: 1.8;
}
.empty .s {
  font-size: 12px;
}

.running {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px;
  text-align: center;
}
.running .t1 {
  font-size: 14px;
  font-weight: 600;
}
.running .t2 {
  font-size: 12.5px;
  color: var(--muted);
}
.running .t3 {
  font-size: 12px;
  color: var(--muted);
  opacity: 0.8;
}

.meta {
  margin-top: 8px;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.ctrl-col {
  flex: 1;
  min-width: 0;
}

.chips {
  display: flex;
  gap: 6px;
}
.chips.wrap {
  flex-wrap: wrap;
}

.chip .hint {
  color: var(--muted);
  font-size: 11.5px;
}

.tip {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.6;
}

.area {
  resize: vertical;
  min-height: 90px;
  font-size: 13px;
  line-height: 1.6;
}

.d-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid var(--line);
  flex-shrink: 0;
}

.d-actions .btn {
  text-decoration: none;
  display: inline-flex;
  align-items: center;
}

.result {
  padding: 10px 18px;
  font-size: 12.5px;
  border-top: 1px solid var(--line);
}
.result.ok {
  background: #eefaf1;
  color: #1a7f37;
}
.result.bad {
  background: var(--warn-soft);
  color: var(--warn);
}

@media (max-width: 780px) {
  .mask {
    padding: 0;
    align-items: flex-end;
  }
  .dialog {
    width: 100%;
    max-height: 94vh;
    border-radius: 16px 16px 0 0;
  }
  .body {
    flex-direction: column;
    gap: 14px;
  }
  .stage-col {
    width: 100%;
  }
  .stage {
    max-height: 42vh;
  }
}
</style>
