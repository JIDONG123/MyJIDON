<template>
  <div class="settings-page">
    <div class="page-head">
      <h2>系统设置 · 大模型与评分权重</h2>
      <p class="sub">
        配置批改用大模型（如 DeepSeek）与向量模型（Qwen text-embedding-v4，默认 DashScope 兼容接口），用于智能核查、自动评分与教师私有知识库 RAG。
      </p>
    </div>

    <el-card class="card" shadow="hover">
      <template #header>
        <span>大模型服务</span>
      </template>
      <el-form :model="form" label-width="140px" class="form">
        <el-form-item label="API Base URL">
          <el-input
            v-model="form.llm_api_base"
            placeholder="示例：https://api.deepseek.com（不含路径）"
            clearable
          />
          <div class="hint">填写服务商根地址，系统将请求 <code>/v1/chat/completions</code></div>
        </el-form-item>
        <el-form-item label="API Key">
          <el-input
            v-model="form.llm_api_key"
            type="password"
            show-password
            :placeholder="form.llm_api_key_set ? '已配置，留空则不修改' : '请输入密钥'"
            clearable
          />
        </el-form-item>
        <el-form-item label="模型名称">
          <el-input v-model="form.llm_model" placeholder="如 deepseek-chat" clearable />
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="card" shadow="hover">
      <template #header>
        <span>向量模型（知识库 RAG）</span>
      </template>
      <el-form :model="form" label-width="140px" class="form">
        <el-form-item label="Embedding Base">
          <el-input
            v-model="form.embedding_api_base"
            placeholder="默认：https://dashscope.aliyuncs.com/compatible-mode/v1"
            clearable
          />
          <div class="hint">
            OpenAI 兼容地址（填到「不含 /embeddings」的 Base 即可，系统会自动请求
            <code>/v1/embeddings</code>）。<strong>密钥与区域必须一致：</strong>国际/新加坡控制台申请的 Key 用
            <code>https://dashscope-intl.aliyuncs.com/compatible-mode/v1</code>；中国大陆控制台申请的 Key 用默认的
            <code>https://dashscope.aliyuncs.com/compatible-mode/v1</code>。填完 Key 后请先点「保存设置」再测。
          </div>
        </el-form-item>
        <el-form-item label="Embedding Key">
          <el-input
            v-model="form.embedding_api_key"
            type="password"
            show-password
            :placeholder="form.embedding_api_key_set ? '已配置，留空则不修改' : 'DashScope API Key'"
            clearable
          />
        </el-form-item>
        <el-form-item label="Embedding 模型">
          <el-input v-model="form.embedding_model" placeholder="text-embedding-v4" clearable />
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="card" shadow="hover">
      <template #header>
        <span>综合得分权重</span>
      </template>
      <el-form :model="form" label-width="140px">
        <el-form-item label="AI 分权重">
          <el-input-number v-model="form.score_ai_weight" :min="0" :max="1" :step="0.05" />
        </el-form-item>
        <el-form-item label="教师分权重">
          <el-input-number v-model="form.score_human_weight" :min="0" :max="1" :step="0.05" />
        </el-form-item>
        <div class="hint">教师提交复核分后，最终分 = AI×AI权重 + 教师×教师权重（权重之和建议为 1）。</div>
      </el-form>
    </el-card>

    <el-card class="card" shadow="hover">
      <template #header>
        <span>查重与助手内容策略</span>
      </template>
      <el-form :model="form" label-width="180px" class="form">
        <el-form-item label="查重预警阈值 (%)">
          <el-input-number v-model="form.similarity_warn_threshold" :min="0" :max="100" :step="1" />
          <div class="hint">提交与历史稿相似度达到该值时给出预警提示（具体展示依前端列表）。</div>
        </el-form-item>
        <el-form-item label="查重嫌疑阈值 (%)">
          <el-input-number v-model="form.similarity_suspect_threshold" :min="0" :max="100" :step="1" />
          <div class="hint">达到或超过该值可标为高度相似；建议大于预警阈值。</div>
        </el-form-item>
        <el-form-item label="助手敏感词列表">
          <el-input
            v-model="form.assistant_blocked_words"
            type="textarea"
            :rows="4"
            placeholder="逗号、分号或换行分隔；学生提问命中任一子串将被拒绝"
          />
        </el-form-item>
      </el-form>
    </el-card>

    <div class="actions">
      <el-button type="primary" size="large" @click="save">保存设置</el-button>
      <el-button size="large" @click="testLlm">测试大模型连接</el-button>
      <el-button size="large" @click="testEmb">测试向量接口</el-button>
    </div>
    <p class="test-hint">「测试连接」使用当前已保存的配置调用云端；若刚改密钥请先保存再测。</p>
  </div>
</template>

<script setup>
import { reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getSettings, updateSettings, testLlmConnection, testEmbeddingConnection } from '../../api/settings'

const form = reactive({
  llm_api_base: '',
  llm_api_key: '',
  llm_model: '',
  score_ai_weight: 0.4,
  score_human_weight: 0.6,
  llm_api_key_set: false,
  embedding_api_base: '',
  embedding_api_key: '',
  embedding_model: '',
  embedding_api_key_set: false,
  similarity_warn_threshold: 40,
  similarity_suspect_threshold: 70,
  assistant_blocked_words: '',
})

const load = async () => {
  const res = await getSettings()
  if (!res.success) return
  const d = res.data
  form.llm_api_base = d.llm_api_base || ''
  form.llm_model = d.llm_model || ''
  form.llm_api_key = ''
  form.llm_api_key_set = d.llm_api_key_set
  form.score_ai_weight = Number(d.score_ai_weight) || 0.4
  form.score_human_weight = Number(d.score_human_weight) || 0.6
  form.embedding_api_base = d.embedding_api_base || ''
  form.embedding_model = d.embedding_model || ''
  form.embedding_api_key = ''
  form.embedding_api_key_set = d.embedding_api_key_set
  form.similarity_warn_threshold = Number(d.similarity_warn_threshold) || 40
  form.similarity_suspect_threshold = Number(d.similarity_suspect_threshold) || 70
  form.assistant_blocked_words = d.assistant_blocked_words != null ? String(d.assistant_blocked_words) : ''
}

const save = async () => {
  try {
    const payload = {
      llm_api_base: form.llm_api_base,
      llm_model: form.llm_model,
      score_ai_weight: String(form.score_ai_weight),
      score_human_weight: String(form.score_human_weight),
      embedding_api_base: form.embedding_api_base,
      embedding_model: form.embedding_model,
      similarity_warn_threshold: String(form.similarity_warn_threshold),
      similarity_suspect_threshold: String(form.similarity_suspect_threshold),
      assistant_blocked_words: form.assistant_blocked_words,
    }
    if (form.llm_api_key && !form.llm_api_key.includes('****')) {
      payload.llm_api_key = form.llm_api_key
    }
    if (form.embedding_api_key && !form.embedding_api_key.includes('****')) {
      payload.embedding_api_key = form.embedding_api_key
    }
    const res = await updateSettings(payload)
    if (res.success) {
      ElMessage.success('已保存')
      load()
    }
  } catch (e) {
    ElMessage.error('保存失败')
  }
}

const testLlm = async () => {
  try {
    const res = await testLlmConnection()
    if (res.success) {
      const prev = res.data?.replyPreview ? ` 返回片段：${res.data.replyPreview}` : ''
      ElMessage.success((res.message || '连接正常') + prev)
    }
  } catch (e) {
    const msg =
      e?.response?.data?.message ||
      e?.response?.data?.error ||
      e?.message ||
      '测试失败'
    ElMessage.error(msg)
  }
}

const testEmb = async () => {
  try {
    const res = await testEmbeddingConnection()
    if (res.success) {
      const dim = res.data?.dimensions ? ` 维度：${res.data.dimensions}` : ''
      ElMessage.success((res.message || '向量接口正常') + dim)
    } else {
      const detail = res.error || res.message || '测试失败'
      ElMessage.error(String(detail))
    }
  } catch (e) {
    const d = e?.response?.data
    const msg = [d?.message, d?.error].filter(Boolean).join(' — ') || e?.message || '测试失败'
    ElMessage.error(msg)
  }
}

onMounted(load)
</script>

<style scoped>
.settings-page {
  padding: 24px;
  max-width: 920px;
}
.page-head h2 {
  margin: 0 0 8px;
  font-size: 22px;
  color: #0b3d6d;
  font-weight: 600;
}
.sub {
  margin: 0 0 20px;
  color: #64748b;
  font-size: 14px;
}
.card {
  margin-bottom: 20px;
  border-radius: 12px;
}
.form {
  max-width: 720px;
}
.hint {
  font-size: 12px;
  color: #94a3b8;
  margin-top: 6px;
  line-height: 1.5;
}
.actions {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.test-hint {
  margin-top: 12px;
  font-size: 12px;
  color: #94a3b8;
}
</style>
