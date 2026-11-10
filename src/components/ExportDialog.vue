<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import {
  composeCard,
  canvasToBlob,
  downloadBlob,
  safeName,
  loadStyle,
  saveStyle,
  defaultStyle,
  LAYOUTS,
  COLORS
} from '../utils/compose.js'

const props = defineProps({
  item: { type: Object, required: true },
  pages: { type: Array, default: () => [] },
  images: { type: Array, default: () => [] },
  cover: { type: String, default: '' }
})
const emit = defineEmits(['close'])

const stage = ref(null)
const idx = ref(0)
const busy = ref(false)
const exporting = ref('')
const err = ref('')

const style = ref(loadStyle() || defaultStyle())

// 导出页数 = 封面 + 每一页大纲，否则最后一页大纲会被挤掉
const total = computed(() => (props.pages.length ? props.pages.length + 1 : 1))

/** 当前页的内容：第 1 页用候选文案标题，其余用大纲各页 */
const cur = computed(() => {
  if (idx.value === 0) {
    const bullets = props.item.hook ? [props.item.hook] : []
    return { title: props.item.title || '', bullets, label: '封面' }
  }
  const p = props.pages[idx.value - 1] || {}
  return { title: p.title || '', bullets: p.bullets || [], label: `P${p.page || idx.value}` }
})

/** 封面用用户选的截图，大纲第 k 页用第 k 张 AI 配图（没出图就回落到截图） */
const curSrc = computed(() => {
  if (idx.value === 0) {
    const first = props.images[0]
    return props.cover || first?.dataUrl || first?.url || ''
  }
  const img = props.images[idx.value - 1]
  return img?.dataUrl || img?.url || props.cover || ''
})

const usingAI = computed(() =>
  idx.value === 0 ? false : Boolean(props.images[idx.value - 1])
)

async function render() {
  if (!stage.value) return
  const canvas = await composeCard({
    src: curSrc.value,
    title: cur.value.title,
    bullets: cur.value.bullets,
    pageLabel: `${idx.value + 1}/${total.value}`,
    style: style.value
  })
  stage.value.replaceChildren(canvas)
}

let timer = null
watch(
  [idx, style, () => props.cover, () => props.images.length],
  () => {
    clearTimeout(timer)
    timer = setTimeout(render, 60)
  },
  { deep: true }
)
onMounted(render)

function go(d) {
  idx.value = (idx.value + d + total.value) % total.value
}

watch(style, (v) => saveStyle(v), { deep: true })

function resetStyle() {
  style.value = defaultStyle()
}

async function exportOne() {
  err.value = ''
  busy.value = true
  try {
    const canvas = await composeCard({
      src: curSrc.value,
      title: cur.value.title,
      bullets: cur.value.bullets,
      pageLabel: `${idx.value + 1}/${total.value}`,
      style: style.value
    })
    const blob = await canvasToBlob(canvas)
    downloadBlob(blob, `${safeName(props.item.title)}-${idx.value + 1}.png`)
  } catch (e) {
    err.value = e.message || '导出失败'
  } finally {
    busy.value = false
  }
}

async function exportAll() {
  err.value = ''
  exporting.value = `正在导出 0/${total.value}`
  try {
    for (let i = 0; i < total.value; i++) {
      const isCover = i === 0
      const page = isCover ? cur.value : props.pages[i - 1] || {}
      const img = props.images[isCover ? 0 : i - 1]
      const src =
        (isCover ? props.cover : '') || img?.dataUrl || img?.url || props.cover || ''
      const canvas = await composeCard({
        src,
        title: isCover ? props.item.title : page.title,
        bullets: isCover ? (props.item.hook ? [props.item.hook] : []) : page.bullets || [],
        pageLabel: `${i + 1}/${total.value}`,
        style: style.value
      })
      const blob = await canvasToBlob(canvas)
      downloadBlob(blob, `${safeName(props.item.title)}-${i + 1}.png`)
      exporting.value = `正在导出 ${i + 1}/${total.value}`
      await new Promise((r) => setTimeout(r, 260))
    }
    exporting.value = `已导出 ${total.value} 张`
    setTimeout(() => (exporting.value = ''), 1800)
  } catch (e) {
    exporting.value = ''
    err.value = e.message || '导出失败'
  }
}
</script>

<template>
  <div class="mask" @click.self="emit('close')">
    <div class="dialog">
      <div class="d-head">
        <h3>🖼️ 导出成品图</h3>
        <button class="btn ghost" @click="emit('close')">×</button>
      </div>

      <div class="body">
        <!-- 预览 -->
        <div class="stage-col">
          <div class="stage">
            <div ref="stage" class="canvas-slot"></div>
          </div>

          <div class="pager">
            <button class="btn mini" @click="go(-1)">‹ 上一页</button>
            <span class="tag">{{ cur.label }} · {{ idx + 1 }}/{{ total }}</span>
            <button class="btn mini" @click="go(1)">下一页 ›</button>
            <span class="src-tag" :class="usingAI ? 'ok' : ''">
              {{ usingAI ? 'AI 配图' : '原始截图' }}
            </span>
          </div>
        </div>

        <!-- 参数 -->
        <div class="ctrl-col">
          <div class="field">
            <label>版式</label>
            <div class="chips">
              <button
                v-for="l in LAYOUTS"
                :key="l.id"
                class="chip"
                :class="{ on: style.layout === l.id }"
                @click="style.layout = l.id"
              >
                {{ l.label }}
              </button>
            </div>
          </div>

          <div class="field">
            <label>文字颜色</label>
            <div class="chips">
              <button
                v-for="c in COLORS"
                :key="c.id"
                class="chip"
                :class="{ on: style.color === c.id }"
                @click="style.color = c.id"
              >
                {{ c.label }}
              </button>
            </div>
          </div>

          <div class="field">
            <label>标题字号 <b>{{ style.fontSize }}</b></label>
            <input class="range" type="range" min="48" max="140" step="2" v-model.number="style.fontSize" />
          </div>

          <div class="field">
            <label>蒙层深浅 <b>{{ style.scrim }}</b></label>
            <input class="range" type="range" min="0" max="100" step="1" v-model.number="style.scrim" />
          </div>

          <div class="field">
            <label>行距 <b>{{ style.lineHeight.toFixed(2) }}</b></label>
            <input
              class="range"
              type="range"
              min="1.1"
              max="1.8"
              step="0.02"
              v-model.number="style.lineHeight"
            />
          </div>

          <div class="field">
            <label>署名 / 水印（可选）</label>
            <input class="control" placeholder="如 @游戏安利局" v-model="style.watermark" />
          </div>

          <div class="field">
            <div class="checks">
              <label class="ck"><input type="checkbox" v-model="style.showBullets" /> 显示要点</label>
              <label class="ck"><input type="checkbox" v-model="style.showPager" /> 显示页码</label>
            </div>
          </div>

          <p class="tip">AI 配图本身不含文字，标题由这里叠加；导出后可直接拿去发布。</p>
        </div>
      </div>

      <div class="d-actions">
        <button class="btn" @click="resetStyle">恢复默认</button>
        <button class="btn" :disabled="busy" @click="exportOne">
          <span v-if="busy" class="spin dark"></span> 导出当前页
        </button>
        <span class="spacer"></span>
        <button class="btn primary" :disabled="!!exporting" @click="exportAll">
          {{ exporting || `导出全部 ${total} 张` }}
        </button>
      </div>

      <div v-if="err" class="result bad">⚠️ {{ err }}</div>
    </div>
  </div>
</template>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  background: rgba(20, 24, 33, 0.45);
  display: grid;
  place-items: center;
  z-index: 60;
  padding: 20px;
}
.dialog {
  width: 880px;
  max-width: 100%;
  max-height: 92vh;
  overflow-y: auto;
  background: #fff;
  border-radius: 14px;
  padding: 16px 18px 18px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
}
.d-head {
  display: flex;
  align-items: center;
}
.d-head h3 {
  margin: 0;
  flex: 1;
  font-size: 15px;
}
.body {
  display: grid;
  grid-template-columns: 330px minmax(0, 1fr);
  gap: 18px;
  margin-top: 12px;
}
.stage {
  width: 330px;
  aspect-ratio: 3 / 4;
  border-radius: 10px;
  overflow: hidden;
  background: #f2f3f5;
  border: 1px solid var(--line);
}
.canvas-slot,
.canvas-slot canvas {
  display: block;
  width: 100% !important;
  height: 100% !important;
}
.pager {
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.src-tag {
  font-size: 11.5px;
  color: var(--muted);
  border: 1px solid var(--line-strong);
  border-radius: 999px;
  padding: 1px 8px;
}
.src-tag.ok {
  color: var(--brand);
  border-color: var(--brand-line);
  background: var(--brand-soft);
}
.ctrl-col .field:first-child {
  margin-top: 0;
}
.field > label {
  display: block;
  font-size: 12.5px;
  color: var(--text-sub);
  margin-bottom: 5px;
}
.field > label b {
  color: var(--brand);
  font-weight: 500;
}
.range {
  width: 100%;
  accent-color: var(--brand);
  height: 26px;
}
.checks {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
}
.ck {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12.5px;
  color: var(--text-sub);
}
.ck input {
  accent-color: var(--brand);
  width: 15px;
  height: 15px;
}
.tip {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--muted);
}
.d-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--line);
}
.spacer {
  flex: 1;
}
.result.bad {
  margin-top: 12px;
  padding: 8px 11px;
  border-radius: 8px;
  font-size: 12.5px;
  background: var(--warn-soft);
  color: var(--warn);
}

@media (max-width: 780px) {
  .mask {
    align-items: flex-start;
    padding: 0;
  }
  .dialog {
    width: 100%;
    max-width: 100%;
    max-height: 100vh;
    height: 100vh;
    border-radius: 0;
    padding: 12px 14px calc(18px + env(safe-area-inset-bottom));
  }
  .body {
    grid-template-columns: 1fr;
    gap: 14px;
  }
  .stage {
    width: 100%;
    max-width: 300px;
    margin: 0 auto;
  }
  .d-actions .btn {
    flex: 1 1 46%;
  }
  .d-actions .spacer {
    display: none;
  }
}
</style>
