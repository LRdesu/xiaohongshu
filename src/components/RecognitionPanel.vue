<script setup>
const props = defineProps({
  data: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  mocked: { type: Boolean, default: false }
})

const pct = (v) => `${Math.round((Number(v) || 0) * 100)}%`
</script>

<template>
  <div>
    <!-- 加载中 -->
    <div v-if="loading">
      <div class="rec-grid">
        <div class="rec-block">
          <h4>🎮 游戏玩法</h4>
          <div class="skeleton" style="width: 80%"></div>
          <div class="skeleton" style="width: 62%"></div>
          <div class="skeleton" style="width: 70%"></div>
        </div>
        <div class="rec-block">
          <h4>🎨 视觉风格</h4>
          <div class="skeleton" style="width: 74%"></div>
          <div class="skeleton" style="width: 55%"></div>
          <div class="skeleton" style="width: 66%"></div>
        </div>
      </div>
      <p class="card-desc" style="text-align: center; margin-top: 10px">视觉模型正在读图…</p>
    </div>

    <!-- 空态 -->
    <div v-else-if="!data" class="empty">
      还没有识别结果 —— 先上传截图，再点「识别截图」
    </div>

    <!-- 结果 -->
    <div v-else>
      <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center">
        <span v-if="mocked" class="tag warn">⚠️ 模拟数据（未配置 API Key）</span>
        <span v-else class="tag ok">✓ 真实识别</span>
        <span class="tag">置信度 {{ pct(data.confidence) }}</span>
        <span v-for="k in data.keywords || []" :key="k" class="tag brand">#{{ k }}</span>
      </div>

      <div class="rec-grid">
        <div class="rec-block">
          <h4>🎮 游戏玩法</h4>
          <div class="kv"><span class="k">核心</span><span>{{ data.gameplay?.core || '—' }}</span></div>
          <div class="kv"><span class="k">类型</span><span>{{ data.gameplay?.type || '—' }}</span></div>
          <div class="sub-h">机制</div>
          <ul class="list"><li v-for="(m, i) in data.gameplay?.mechanics || []" :key="i">{{ m }}</li></ul>
          <div class="sub-h">成长路径</div>
          <ul class="list"><li v-for="(m, i) in data.gameplay?.progression || []" :key="i">{{ m }}</li></ul>
          <div class="sub-h">上头点</div>
          <ul class="list"><li v-for="(m, i) in data.gameplay?.hooks || []" :key="i">{{ m }}</li></ul>
        </div>

        <div class="rec-block">
          <h4>🎨 视觉风格</h4>
          <div class="kv"><span class="k">美术</span><span>{{ data.visualStyle?.artStyle || '—' }}</span></div>
          <div class="kv"><span class="k">氛围</span><span>{{ data.visualStyle?.mood || '—' }}</span></div>
          <div class="kv"><span class="k">字体</span><span>{{ data.visualStyle?.typography || '—' }}</span></div>
          <div class="sub-h">取色</div>
          <div class="palette">
            <span v-for="(c, i) in data.visualStyle?.palette || []" :key="i" class="swatch">
              <i :style="{ background: c.hex }"></i>{{ c.name }} {{ c.hex }}
            </span>
          </div>
          <div class="sub-h">UI 元素</div>
          <ul class="list"><li v-for="(m, i) in data.visualStyle?.uiElements || []" :key="i">{{ m }}</li></ul>
        </div>
      </div>

      <div class="sub-h" style="margin-top: 14px">🔍 引用证据（均来自截图可见内容）</div>
      <div v-if="data.evidence?.length" class="table-scroll">
        <table class="evidence">
        <thead>
            <tr>
              <th style="width: 96px">维度</th>
              <th>截图中的证据</th>
              <th style="width: 78px">来源</th>
              <th style="width: 82px">置信度</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(e, i) in data.evidence" :key="i">
              <td>{{ e.field }}</td>
              <td class="quote">{{ e.quote }}</td>
              <td>{{ e.source }}</td>
              <td>{{ pct(e.confidence) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="empty">未识别到可引用的明确证据</div>

      <p v-if="data.notes" class="card-desc" style="margin-top: 10px">备注：{{ data.notes }}</p>
    </div>
  </div>
</template>
