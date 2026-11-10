<script setup>
import { ref, reactive, onMounted } from 'vue'
import { loadConfig, saveConfig, clearConfig, CONFIG_KEYS } from '../config.js'
import { testConnection, health } from '../api.js'

const emit = defineEmits(['close', 'saved'])

const env = ref({ base: '', model: '', textModel: '', configured: false })

const form = reactive({
  base: '',
  key: '',
  model: '',
  textModel: '',
  imageModel: '',
  imageSize: '',
  videoModel: ''
})

const testing = ref('')
const result = ref(null)

onMounted(async () => {
  const h = await health()
  env.value = {
    base: h.base || '',
    model: h.model || '',
    textModel: h.textModel || '',
    imageModel: h.imageModel || '',
    videoModel: h.videoModel || '',
    configured: Boolean(h.configured)
  }
  const saved = loadConfig()
  form.base = saved?.base || ''
  form.key = saved?.key || ''
  form.model = saved?.model || ''
  form.textModel = saved?.textModel || ''
  form.imageModel = saved?.imageModel || ''
  form.imageSize = saved?.imageSize || ''
})

const effective = (k) => form[k] || env.value[k] || ''
const usingOverride = () => Boolean(loadConfig())

async function runTest(which) {
  testing.value = which
  result.value = null
  const backup = loadConfig()
  // 先临时写入，让 /api/test 用上当前表单里的值
  saveConfig({ ...form })
  try {
    const r = await testConnection(which)
    result.value = { ok: true, text: `${which === 'text' ? '文本' : '视觉'}模型连通：${r.reply || 'OK'}` }
  } catch (e) {
    result.value = { ok: false, text: e.message }
  } finally {
    if (backup) saveConfig(backup)
    else clearConfig()
    testing.value = ''
  }
}

function save() {
  const cfg = {}
  for (const k of CONFIG_KEYS) {
    const v = String(form[k] || '').trim()
    if (v) cfg[k] = v
  }
  if (Object.keys(cfg).length) saveConfig(cfg)
  else clearConfig()
  emit('saved', cfg)
  emit('close')
}

function reset() {
  clearConfig()
  form.base = ''
  form.key = ''
  form.model = ''
  form.textModel = ''
  form.imageModel = ''
  form.imageSize = ''
  form.videoModel = ''
  result.value = { ok: true, text: '已清除，恢复使用 .env 里的配置' }
  emit('saved', null)
}
</script>

<template>
  <div class="mask" @click.self="emit('close')">
    <div class="dialog">
      <div class="d-head">
        <h3>⚙️ 模型设置</h3>
        <button class="btn ghost" @click="emit('close')">×</button>
      </div>

      <p class="note">
        留空则使用项目 <code>.env</code> 的配置。这里的设置保存在浏览器本地，改完立刻生效，不用重启。
      </p>

      <div class="field">
        <label>API Base（OpenAI 兼容）</label>
        <input class="control" v-model="form.base" :placeholder="env.base || 'https://.../v1'" />
      </div>

      <div class="field">
        <label>API Key</label>
        <input class="control" type="password" v-model="form.key" placeholder="留空沿用 .env" />
      </div>

      <div class="field">
        <label>视觉模型（识别截图）</label>
        <input class="control" v-model="form.model" :placeholder="env.model || 'qwen-vl-max'" />
      </div>

      <div class="field">
        <label>文本模型（写文案）</label>
        <input class="control" v-model="form.textModel" :placeholder="env.textModel || env.model || ''" />
      </div>

      <div class="field">
        <label>出图模型 / 尺寸</label>
        <div class="row2">
          <input class="control" v-model="form.imageModel" :placeholder="env.imageModel || 'wanx2.1-t2i-turbo'" />
          <input class="control sz" v-model="form.imageSize" placeholder="720*1280" />
        </div>
      </div>

      <div class="field">
        <label>视频模型</label>
        <input class="control" v-model="form.videoModel" :placeholder="env.videoModel || 'wanx2.1-t2v-turbo'" />
        <p class="tip">填 t2v / i2v 任一档即可，实际用哪个由「图生 / 文生 + 画质」自动推导</p>
      </div>

      <div class="d-actions">
        <button class="btn" :disabled="!!testing" @click="runTest('vision')">
          <span v-if="testing === 'vision'" class="spin dark"></span> 测试视觉模型
        </button>
        <button class="btn" :disabled="!!testing" @click="runTest('text')">
          <span v-if="testing === 'text'" class="spin dark"></span> 测试文本模型
        </button>
        <span class="spacer"></span>
        <button class="btn" @click="reset">恢复 .env</button>
        <button class="btn primary" @click="save">保存</button>
      </div>

      <div v-if="result" class="result" :class="result.ok ? 'ok' : 'bad'">{{ result.text }}</div>

      <div class="cur">
        当前生效：视觉 <b>{{ effective('model') || '—' }}</b> · 文本
        <b>{{ effective('textModel') || effective('model') || '—' }}</b>
        <span v-if="usingOverride()" class="tag brand">浏览器覆盖</span>
        <span v-else class="tag">.env</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  background: rgba(20, 24, 33, 0.4);
  display: grid;
  place-items: center;
  z-index: 50;
  padding: 20px;
}
.dialog {
  width: 520px;
  max-width: 100%;
  background: #fff;
  border-radius: 14px;
  padding: 18px 20px 20px;
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
.note {
  color: var(--muted);
  font-size: 12.5px;
  margin: 8px 0 14px;
}
.d-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 16px;
}
.spacer {
  flex: 1;
}
.result {
  margin-top: 12px;
  padding: 8px 11px;
  border-radius: 8px;
  font-size: 12.5px;
}
.result.ok {
  background: var(--ok-soft);
  color: var(--ok);
}
.result.bad {
  background: var(--warn-soft);
  color: var(--warn);
  word-break: break-all;
}
.row2 {
  display: flex;
  gap: 8px;
}

.row2 .sz {
  max-width: 130px;
}

.cur {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
  font-size: 12.5px;
  color: var(--muted);
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

/* 手机端：从底部弹出的抽屉 */
@media (max-width: 700px) {
  .mask {
    align-items: flex-end;
    padding: 0;
  }
  .dialog {
    width: 100%;
    max-width: 100%;
    border-radius: 16px 16px 0 0;
    padding: 14px 16px calc(18px + env(safe-area-inset-bottom));
    max-height: 88vh;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    animation: sheet-up 0.22s ease;
  }
  .d-actions {
    gap: 8px;
  }
  .d-actions .btn {
    flex: 1 1 44%;
  }
  .d-actions .spacer {
    display: none;
  }
}

@keyframes sheet-up {
  from {
    transform: translateY(24px);
    opacity: 0.6;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.tip {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.6;
}
</style>
