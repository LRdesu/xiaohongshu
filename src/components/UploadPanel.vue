<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { formatSize } from '../utils/image.js'

const props = defineProps({
  files: { type: Array, default: () => [] },
  activeId: { type: String, default: '' },
  disabled: { type: Boolean, default: false }
})

const emit = defineEmits(['add', 'remove', 'select', 'clear'])

const inputRef = ref(null)
const over = ref(false)

function pick() {
  if (props.disabled) return
  inputRef.value?.click()
}

function onChange(e) {
  emit('add', Array.from(e.target.files || []))
  e.target.value = ''
}

function onDrop(e) {
  over.value = false
  if (props.disabled) return
  const list = Array.from(e.dataTransfer?.files || []).filter((f) => f.type.startsWith('image/'))
  if (list.length) emit('add', list)
}

/** Ctrl+V 直接粘贴剪贴板里的截图（截图工具复制后最常用） */
function onPaste(e) {
  if (props.disabled) return
  const items = Array.from(e.clipboardData?.items || [])
  const images = items
    .filter((it) => it.kind === 'file' && it.type.startsWith('image/'))
    .map((it) => it.getAsFile())
    .filter(Boolean)
  if (!images.length) return
  e.preventDefault()
  emit('add', images)
}

onMounted(() => window.addEventListener('paste', onPaste))
onUnmounted(() => window.removeEventListener('paste', onPaste))

const active = () => props.files.find((f) => f.id === props.activeId) || null
</script>

<template>
  <div class="card">
    <h3 class="card-title">📷 游戏截图</h3>
    <p class="card-desc">支持多张，最多 6 张；上传前会自动压缩到长边 1280px</p>

    <div
      class="dropzone"
      :class="{ over }"
      @click="pick"
      @dragover.prevent="over = true"
      @dragleave="over = false"
      @drop.prevent="onDrop"
    >
      <div class="icon">🖼️</div>
      <div class="t1">点击上传 / 拖拽截图</div>
      <div class="t2">
        <span class="paste-tip">也可以直接 <b>Ctrl + V</b> 粘贴剪贴板里的截图<br /></span>
        支持多张，最多 6 张 · PNG / JPG / WEBP
      </div>
      <input ref="inputRef" type="file" accept="image/*" multiple hidden @change="onChange" />
    </div>

    <template v-if="files.length">
      <div class="preview-main">
        <img :src="active()?.dataUrl" :alt="active()?.name" />
      </div>

      <div class="thumbs">
        <div
          v-for="f in files"
          :key="f.id"
          class="thumb"
          :class="{ active: f.id === activeId }"
          :title="f.name + ' · ' + formatSize(f.size)"
          @click="emit('select', f.id)"
        >
          <img :src="f.dataUrl" :alt="f.name" />
          <button class="del" @click.stop="emit('remove', f.id)">×</button>
        </div>
      </div>

      <div style="margin-top: 10px; display: flex; gap: 8px; align-items: center">
        <span class="tag">共 {{ files.length }} 张</span>
        <span class="spacer" style="flex: 1"></span>
        <button class="btn mini" @click="emit('clear')">清空</button>
      </div>
    </template>
  </div>
</template>
