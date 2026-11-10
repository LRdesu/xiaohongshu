<script setup>
const props = defineProps({
  modelValue: { type: Object, required: true }
})
const emit = defineEmits(['update:modelValue'])

function set(key, value) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}

const TONES = ['真诚种草', '毒舌吐槽', '干货测评', '情绪共鸣', '幽默玩梗']
const AUDIENCES = ['喜欢手游的年轻玩家', '二次元玩家', '休闲轻量玩家', '硬核数值党', '泛娱乐路人']
const LENGTHS = [
  { label: '短文 200 字', value: 200 },
  { label: '标准 300 字', value: 300 },
  { label: '长文 500 字', value: 500 }
]
</script>

<template>
  <div class="card">
    <h3 class="card-title">🎛️ 生成设置</h3>
    <p class="card-desc">决定正文语气和篇幅，识别阶段也会用到关注重点</p>

    <div class="field">
      <label>语气风格</label>
      <div class="chips">
        <button
          v-for="t in TONES"
          :key="t"
          class="chip"
          :class="{ on: modelValue.tone === t }"
          @click="set('tone', t)"
        >
          {{ t }}
        </button>
      </div>
    </div>

    <div class="field">
      <label>目标受众</label>
      <select class="control" :value="modelValue.audience" @change="set('audience', $event.target.value)">
        <option v-for="a in AUDIENCES" :key="a" :value="a">{{ a }}</option>
      </select>
    </div>

    <div class="field">
      <label>正文长度</label>
      <div class="chips">
        <button
          v-for="l in LENGTHS"
          :key="l.value"
          class="chip"
          :class="{ on: modelValue.length === l.value }"
          @click="set('length', l.value)"
        >
          {{ l.label }}
        </button>
      </div>
    </div>

    <div class="field">
      <label>识别关注点（可选）</label>
      <input
        class="control"
        placeholder="如：重点看养成系统和付费点"
        :value="modelValue.focus"
        @input="set('focus', $event.target.value)"
      />
    </div>

    <div class="field">
      <label>额外要求（可选）</label>
      <textarea
        class="control"
        placeholder="如：不要提氪金；结尾引导收藏"
        :value="modelValue.extra"
        @input="set('extra', $event.target.value)"
      ></textarea>
    </div>
  </div>
</template>
