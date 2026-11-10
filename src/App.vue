<script setup>
import { ref, computed, onMounted } from 'vue'
import UploadPanel from './components/UploadPanel.vue'
import OptionPanel from './components/OptionPanel.vue'
import RecognitionPanel from './components/RecognitionPanel.vue'
import CandidateCard from './components/CandidateCard.vue'
import SettingsDialog from './components/SettingsDialog.vue'
import { analyze, generate, research as researchApi, health } from './api.js'
import { loadConfig } from './config.js'
import { fileToDataUrl } from './utils/image.js'

const MAX_IMAGES = 6

const files = ref([])
const activeId = ref('')

const options = ref({
  tone: '真诚种草',
  audience: '喜欢手游的年轻玩家',
  length: 300,
  focus: '',
  extra: ''
})

const recognition = ref(null)
const recMocked = ref(false)
const candidates = ref([])

// 联网检索到的真实资料（事实依据）
const research = ref(null)
const researching = ref(false)
const researchError = ref('')

const analyzing = ref(false)
const generating = ref(false)
const error = ref('')
const configured = ref(false)
const envInfo = ref({ model: '', textModel: '' })
const showSettings = ref(false)

const coverImage = computed(
  () => files.value.find((f) => f.id === activeId.value)?.dataUrl || files.value[0]?.dataUrl || ''
)

const canAnalyze = computed(() => files.value.length > 0 && !analyzing.value)
const canGenerate = computed(() => Boolean(recognition.value) && !generating.value && !analyzing.value)
const canResearch = computed(() => Boolean(recognition.value) && !researching.value && !analyzing.value)
const showSources = ref(false)

/** 手机端底部固定操作条：按当前进度决定这一步该点什么 */
const mobileStep = computed(() => {
  if (analyzing.value) return { label: '识别中…', step: '正在读图', disabled: true, act: null }
  if (generating.value) return { label: '生成中…', step: '正在写文案', disabled: true, act: null }
  if (!files.value.length) return { label: '上传截图', step: '第 1 步 · 传图', disabled: true, act: null }
  if (!recognition.value)
    return { label: '🔎 识别截图', step: '第 2 步 · 识别', disabled: false, act: runAnalyze }
  return {
    label: '✨ 生成小红书图文',
    step: recognition.value ? '第 3 步 · 生成' : '',
    disabled: false,
    act: runGenerate
  }
})

function runMobileStep() {
  const s = mobileStep.value
  if (!s.disabled && s.act) s.act()
}

let seq = 0
const uid = () => `f${++seq}_${Date.now()}`

function refreshStatus() {
  return health().then((h) => {
    configured.value = Boolean(h.configured)
    envInfo.value = { model: h.model || '', textModel: h.textModel || h.model || '' }
  })
}

const modelLabel = computed(() => {
  const c = loadConfig()
  const v = c?.model || envInfo.value.model
  const t = c?.textModel || envInfo.value.textModel || v
  return v ? `${v} / ${t}` : ''
})

onMounted(refreshStatus)

async function onAdd(list) {
  error.value = ''
  for (const file of list) {
    if (!file.type.startsWith('image/')) continue
    if (files.value.length >= MAX_IMAGES) {
      error.value = `最多上传 ${MAX_IMAGES} 张截图`
      break
    }
    const dataUrl = await fileToDataUrl(file)
    const id = uid()
    files.value.push({ id, name: file.name, size: file.size, dataUrl })
    if (!activeId.value) activeId.value = id
  }
  resetResult()
}

function onRemove(id) {
  files.value = files.value.filter((f) => f.id !== id)
  if (activeId.value === id) activeId.value = files.value[0]?.id || ''
  resetResult()
}

function onClear() {
  files.value = []
  activeId.value = ''
  resetResult()
}

function resetResult() {
  recognition.value = null
  recMocked.value = false
  candidates.value = []
  research.value = null
  researchError.value = ''
  showSources.value = false
}

async function onSaved() {
  await refreshStatus()
  error.value = ''
}

async function runAnalyze() {
  error.value = ''
  analyzing.value = true
  candidates.value = []
  try {
    const res = await analyze(files.value, options.value)
    recognition.value = res.data
    recMocked.value = Boolean(res.mocked)
  } catch (e) {
    error.value = e.message || '识别失败'
  } finally {
    analyzing.value = false
  }
}

async function runResearch() {
  if (!recognition.value) return
  researchError.value = ''
  researching.value = true
  try {
    const res = await researchApi(recognition.value)
    research.value = res
  } catch (e) {
    researchError.value = e.message || '检索失败'
  } finally {
    researching.value = false
  }
}

async function runGenerate() {
  error.value = ''
  generating.value = true
  candidates.value = []
  try {
    // 生成前尽量先联网核验资料（失败不影响生成，仅作为事实依据）
    if (!research.value && recognition.value) {
      try {
        await runResearch()
      } catch {
        /* 检索失败则跳过，用截图证据生成 */
      }
    }
    const res = await generate(recognition.value, options.value, research.value)
    candidates.value = res.data?.candidates || []
    if (res.mocked) recMocked.value = true
  } catch (e) {
    error.value = e.message || '生成失败'
  } finally {
    generating.value = false
  }
}
</script>

<template>
  <div class="app">
    <header class="topbar">
      <div class="logo">红</div>
      <div>
        <h1>内容工作台</h1>
        <div class="sub">游戏截图 → 小红书图文（第一屏只做图文流程）</div>
      </div>
      <div class="spacer"></div>
      <span v-if="modelLabel" class="tag mobile-hide">🤖 {{ modelLabel }}</span>
      <span class="tag" :class="configured ? 'ok' : 'warn'">
        {{ configured ? '模型已配置' : '未配置 Key'
        }}<span v-if="!configured" class="mobile-hide"> · 模拟模式</span>
      </span>
      <button class="btn mini" @click="showSettings = true">⚙️<span class="mobile-hide"> 模型设置</span></button>
    </header>

    <main class="layout">
      <!-- 左栏：素材 + 参数 -->
      <aside class="side">
        <UploadPanel
          :files="files"
          :active-id="activeId"
          @add="onAdd"
          @remove="onRemove"
          @select="activeId = $event"
          @clear="onClear"
        />
        <OptionPanel v-model="options" />
      </aside>

      <!-- 右栏：识别 → 生成 -->
      <section class="main">
        <div class="card">
          <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap">
            <h3 class="card-title">🔎 识别结果</h3>
            <span class="spacer" style="flex: 1"></span>
            <button class="btn" :disabled="!canAnalyze" @click="runAnalyze">
              <span v-if="analyzing" class="spin dark"></span>
              {{ analyzing ? '识别中…' : recognition ? '重新识别' : '识别截图' }}
            </button>
          </div>
          <p class="card-desc">调用视觉模型，拆解玩法、视觉风格，并给出截图里的引用证据</p>

          <RecognitionPanel :data="recognition" :loading="analyzing" :mocked="recMocked" />

          <!-- 联网核验资料：把官网 / 百科 / 评测的真实文章作为事实依据 -->
          <div v-if="recognition" class="research-box">
            <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center">
              <button class="btn ghost" :disabled="!canResearch" @click="runResearch">
                <span v-if="researching" class="spin dark"></span>
                {{ research ? '重新核验' : '🔍 联网核验资料' }}
              </button>
              <span v-if="researching" class="hint">正在检索官网 / 百科 / 评测…</span>
              <span v-else-if="research?.sources?.length" class="tag ok">已核验 {{ research.sources.length }} 条真实资料</span>
              <span v-else-if="research" class="tag warn">未检索到公开资料，仅用截图</span>
              <span v-if="researchError" class="tag warn">⚠️ {{ researchError }}</span>
              <a v-if="research?.sources?.length" class="link" @click="showSources = !showSources">{{ showSources ? '隐藏来源' : '查看来源' }}</a>
            </div>
            <ul v-if="showSources && research?.sources?.length" class="src-list">
              <li v-for="(s, i) in research.sources" :key="i">
                <a :href="s.url" target="_blank" rel="noopener">{{ s.title }}</a>
              </li>
            </ul>
            <p v-if="research?.note" class="card-desc" style="margin-top: 6px">{{ research.note }}</p>
          </div>

          <div class="generate-bar">
            <button class="btn primary big" :disabled="!canGenerate" @click="runGenerate">
              <span v-if="generating" class="spin"></span>
              {{ generating ? '生成中…' : '✨ 生成小红书图文' }}
            </button>
            <span class="hint">
              {{
                !recognition
                  ? '先完成识别，再生成（保证内容有据可依）'
                  : `将产出 5 套方案 · ${options.tone} · ${options.length} 字`
              }}
            </span>
          </div>
        </div>

        <div class="card" v-if="generating">
          <h3 class="card-title">✍️ 正在生成 5 套方案</h3>
          <div class="skeleton" style="width: 55%"></div>
          <div class="skeleton" style="width: 80%"></div>
          <div class="skeleton" style="width: 68%"></div>
        </div>

        <template v-else-if="candidates.length">
          <div class="cand-head">
            <h3 class="card-title">📝 小红书图文方案（{{ candidates.length }}）</h3>
            <span class="tag">点击右上角按钮直接复制</span>
          </div>
          <CandidateCard
            v-for="(c, i) in candidates"
            :key="i"
            :item="c"
            :index="i"
            :cover="coverImage"
            :recognition="recognition"
            :research="research"
          />
        </template>

        <div class="card" v-else>
          <div class="empty">
            还没有生成内容 —— 上传截图 → 识别 → 点「生成小红书图文」
          </div>
        </div>
      </section>
    </main>

    <p v-if="error" class="error-bar">⚠️ {{ error }}</p>

    <!-- 手机端底部固定操作条：小屏才显示，跟着流程走 -->
    <div class="mobile-bar">
      <button class="mbtn" :disabled="mobileStep.disabled" @click="runMobileStep">
        <span v-if="mobileStep.disabled && (analyzing || generating)" class="spin"></span>
        {{ mobileStep.label }}
      </button>
      <span class="mstep">{{ mobileStep.step }}</span>
    </div>

    <SettingsDialog v-if="showSettings" @close="showSettings = false" @saved="onSaved" />
  </div>
</template>

<style scoped>
.research-box {
  margin: 14px 0 4px;
  padding: 12px 14px;
  border: 1px dashed var(--line, #e3e3e8);
  border-radius: 12px;
  background: #fafbfc;
}
.btn.ghost {
  background: #fff;
  border: 1px solid #d6d8e0;
  color: #3a3f51;
}
.btn.ghost:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.link {
  color: #c0392b;
  cursor: pointer;
  font-size: 13px;
  text-decoration: underline;
}
.src-list {
  margin: 10px 0 0;
  padding-left: 18px;
  max-height: 180px;
  overflow: auto;
}
.src-list li {
  margin: 4px 0;
  font-size: 13px;
}
.src-list a {
  color: #2b6cb0;
  text-decoration: none;
  word-break: break-all;
}
.src-list a:hover {
  text-decoration: underline;
}
</style>
