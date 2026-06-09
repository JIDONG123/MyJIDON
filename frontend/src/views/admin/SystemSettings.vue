<template>
  <div class="tw-page ai-config-page">
    <header class="tw-head">
      <div class="tw-head__left">
        <div>
          <h1 class="tw-title">AI 与评价配置中心</h1>
          <p class="tw-subtitle">
            统一配置大模型服务、向量检索、视觉识别、知识图谱、综合评分权重与查重策略，支撑 AI 批改、知识库 RAG 和教学评价。
          </p>
        </div>
      </div>
    </header>

    <el-skeleton v-if="loading" animated :rows="14" />

    <template v-else-if="loadError">
      <section class="tw-panel tw-empty-panel">
        <el-empty :description="loadError" :image-size="88">
          <el-button type="primary" @click="load">重新加载</el-button>
        </el-empty>
      </section>
    </template>

    <template v-else>
      <section class="tw-metric-grid status-grid">
        <div v-for="card in statusCards" :key="card.key" class="tw-metric-card">
          <div class="tw-metric-card__icon" :class="`tw-metric-card__icon--${card.tone}`">
            <el-icon><component :is="card.icon" /></el-icon>
          </div>
          <div class="tw-metric-card__body">
            <span class="tw-metric-card__label">{{ card.label }}</span>
            <span class="tw-metric-card__value status-card__value">{{ card.value }}</span>
            <span class="tw-metric-card__hint">{{ card.hint }}</span>
          </div>
        </div>
      </section>

      <section class="tw-panel meta-bar">
        <div class="meta-bar__items">
          <span>上次保存：{{ lastSavedAt || '—' }}</span>
          <span>上次测试：{{ lastTestAt || '—' }}</span>
          <span>
            当前状态：
            <el-tag size="small" effect="light" :type="overallStatusTag">{{ overallStatusText }}</el-tag>
          </span>
          <el-tag v-if="hasUnsavedChanges" size="small" type="warning" effect="plain">有未保存修改</el-tag>
        </div>
      </section>

      <section class="tw-panel config-panel">
        <el-tabs v-model="activeTab" class="config-tabs">
          <!-- 大模型服务 -->
          <el-tab-pane label="大模型服务" name="llm">
            <div class="tab-pane">
              <el-form :model="form" label-width="148px" class="config-form">
                <el-form-item label="API Base URL" required>
                  <el-input
                    v-model="form.llm_api_base"
                    placeholder="示例：https://api.deepseek.com"
                    clearable
                  />
                  <p class="field-hint">
                    系统将自动请求 <code>/chat/completions</code> 接口，请填写 OpenAI 兼容服务地址。
                  </p>
                </el-form-item>
                <el-form-item label="API Key">
                  <div class="key-field">
                    <el-input
                      v-model="form.llm_api_key"
                      type="password"
                      show-password
                      :disabled="!llmKeyEditing && form.llm_api_key_set"
                      :placeholder="llmKeyPlaceholder"
                      clearable
                      autocomplete="new-password"
                    />
                    <el-button v-if="form.llm_api_key_set && !llmKeyEditing" plain @click="startEditLlmKey">
                      修改密钥
                    </el-button>
                  </div>
                  <p class="field-hint">已配置时留空表示不修改；修改后请先保存再测试连接。</p>
                </el-form-item>
                <el-form-item label="模型名称" required>
                  <el-input v-model="form.llm_model" placeholder="如 deepseek-chat" clearable />
                </el-form-item>
                <el-form-item>
                  <el-button type="primary" plain :loading="llmTesting" @click="testLlm">
                    测试大模型连接
                  </el-button>
                  <span v-if="hasUnsavedChanges" class="inline-hint">请先保存后测试</span>
                </el-form-item>
              </el-form>

              <div v-if="llmTestResult" class="test-result" :class="`test-result--${llmTestResult.ok ? 'ok' : 'fail'}`">
                <div class="test-result__head">
                  <el-tag :type="llmTestResult.ok ? 'success' : 'danger'" effect="light" size="small">
                    {{ llmTestResult.ok ? '连接成功' : '连接失败' }}
                  </el-tag>
                  <span v-if="llmTestResult.ms != null" class="test-result__ms">响应 {{ llmTestResult.ms }} ms</span>
                </div>
                <p v-if="llmTestResult.message" class="test-result__msg">{{ llmTestResult.message }}</p>
                <p v-if="llmTestResult.error" class="test-result__err">{{ llmTestResult.error }}</p>
              </div>
            </div>
          </el-tab-pane>

          <!-- 知识库 RAG -->
          <el-tab-pane label="知识库 RAG" name="rag">
            <div class="tab-pane">
              <el-alert
                type="info"
                :closable="false"
                show-icon
                class="module-alert"
                title="该配置用于知识库文档向量化、RAG 检索、AI 批改资料引用和学生 AI 答疑。"
              />

              <div class="rag-stats">
                <div class="rag-stat">
                  <span class="rag-stat__label">文档数</span>
                  <span class="rag-stat__value" :class="{ 'rag-stat__value--empty': ragStats.docCount == null }">
                    {{ formatRagStat(ragStats.docCount) }}
                  </span>
                </div>
                <div class="rag-stat">
                  <span class="rag-stat__label">分块数</span>
                  <span class="rag-stat__value" :class="{ 'rag-stat__value--empty': ragStats.chunkCount == null }">
                    {{ formatRagStat(ragStats.chunkCount) }}
                  </span>
                </div>
                <div class="rag-stat">
                  <span class="rag-stat__label">最近向量化</span>
                  <span
                    class="rag-stat__value rag-stat__value--time"
                    :class="{ 'rag-stat__value--empty': !ragStats.lastVectorizedAt }"
                  >
                    {{ ragStats.lastVectorizedAt ? formatDateTime(ragStats.lastVectorizedAt) : '暂无' }}
                  </span>
                </div>
              </div>

              <el-form :model="form" label-width="148px" class="config-form">
                <el-form-item label="Embedding Base">
                  <el-input
                    v-model="form.embedding_api_base"
                    placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1"
                    clearable
                  />
                  <p class="field-hint">
                    OpenAI 兼容地址（不含 <code>/embeddings</code>）。密钥与区域须一致：国际 Key 用
                    <code>dashscope-intl</code>，大陆 Key 用 <code>dashscope</code> 默认域。
                  </p>
                </el-form-item>
                <el-form-item label="Embedding Key">
                  <div class="key-field">
                    <el-input
                      v-model="form.embedding_api_key"
                      type="password"
                      show-password
                      :disabled="!embeddingKeyEditing && form.embedding_api_key_set"
                      :placeholder="embeddingKeyPlaceholder"
                      clearable
                      autocomplete="new-password"
                    />
                    <el-button
                      v-if="form.embedding_api_key_set && !embeddingKeyEditing"
                      plain
                      @click="startEditEmbeddingKey"
                    >
                      修改密钥
                    </el-button>
                  </div>
                </el-form-item>
                <el-form-item label="Embedding 模型">
                  <el-input v-model="form.embedding_model" placeholder="text-embedding-v4" clearable />
                </el-form-item>
                <el-form-item>
                  <el-button type="primary" plain :loading="embTesting" @click="testEmb">
                    测试向量接口
                  </el-button>
                  <span v-if="hasUnsavedChanges" class="inline-hint">请先保存后测试</span>
                </el-form-item>
              </el-form>

              <div v-if="embTestResult" class="test-result" :class="`test-result--${embTestResult.ok ? 'ok' : 'fail'}`">
                <div class="test-result__head">
                  <el-tag :type="embTestResult.ok ? 'success' : 'danger'" effect="light" size="small">
                    {{ embTestResult.ok ? '接口正常' : '接口失败' }}
                  </el-tag>
                  <span v-if="embTestResult.ms != null" class="test-result__ms">响应 {{ embTestResult.ms }} ms</span>
                </div>
                <p v-if="embTestResult.message" class="test-result__msg">{{ embTestResult.message }}</p>
                <p v-if="embTestResult.error" class="test-result__err">{{ embTestResult.error }}</p>
              </div>
            </div>
          </el-tab-pane>

          <!-- 视觉识别模型 -->
          <el-tab-pane label="视觉识别模型" name="vision">
            <div class="tab-pane">
              <el-alert
                type="info"
                :closable="false"
                show-icon
                class="module-alert"
                title="视觉识别模型（Qwen-VL）"
                description="用于识别学生提交的截图、项目界面、运行结果图片和报告图片，为 AI 批改与材料核查提供多模态依据。"
              />

              <el-form :model="vlForm" label-width="148px" class="config-form">
                <el-form-item label="启用图像识别">
                  <el-switch v-model="vlForm.qwen_vl_enabled" active-text="已启用" inactive-text="未启用" />
                </el-form-item>
                <el-form-item label="API Base URL" required>
                  <el-input
                    v-model="vlForm.qwen_vl_api_base"
                    placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1"
                    clearable
                  />
                  <p class="field-hint">系统将调用 OpenAI 兼容格式的视觉模型接口。</p>
                </el-form-item>
                <el-form-item label="API Key">
                  <div class="key-field">
                    <el-input
                      v-model="vlForm.qwen_vl_api_key"
                      type="password"
                      show-password
                      :disabled="!vlKeyEditing && vlForm.qwen_vl_api_key_set"
                      :placeholder="vlKeyPlaceholder"
                      clearable
                      autocomplete="new-password"
                    />
                    <el-button
                      v-if="vlForm.qwen_vl_api_key_set && !vlKeyEditing"
                      plain
                      @click="startEditVlKey"
                    >
                      修改密钥
                    </el-button>
                  </div>
                  <p class="field-hint">已配置时留空表示不修改；修改后请先保存再测试。</p>
                </el-form-item>
                <el-form-item label="模型名称" required>
                  <el-input v-model="vlForm.qwen_vl_model" placeholder="qwen3-vl-plus" clearable />
                </el-form-item>
                <el-form-item label="测试图像">
                  <el-upload
                    class="vl-upload"
                    drag
                    :auto-upload="false"
                    :limit="1"
                    accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                    :on-change="onVlTestImageChange"
                    :on-remove="onVlTestImageRemove"
                    :file-list="vlTestFileList"
                  >
                    <el-icon class="vl-upload__icon"><UploadFilled /></el-icon>
                    <div class="el-upload__text">拖拽或点击上传测试图片</div>
                    <template #tip>
                      <div class="el-upload__tip">支持 JPG / PNG / WEBP，最大 5MB</div>
                    </template>
                  </el-upload>
                </el-form-item>
                <el-form-item label="测试提示词">
                  <el-input
                    v-model="vlTestPrompt"
                    type="textarea"
                    :rows="3"
                    placeholder="请简要描述这张图片中的主要内容，并判断是否包含代码、运行结果或项目界面。"
                  />
                </el-form-item>
                <el-form-item>
                  <el-button type="primary" :loading="vlSaving" @click="saveVlSettings">
                    保存视觉模型配置
                  </el-button>
                  <el-button type="primary" plain :loading="vlTesting" @click="testVl">
                    测试视觉识别接口
                  </el-button>
                  <el-button :disabled="!vlHasUnsavedChanges" @click="resetVlUnsaved">重置未保存修改</el-button>
                  <span v-if="vlHasUnsavedChanges" class="inline-hint">视觉模型配置有未保存修改</span>
                </el-form-item>
              </el-form>

              <div
                v-if="vlTestResult"
                class="test-result"
                :class="`test-result--${vlTestResult.ok ? 'ok' : 'fail'}`"
              >
                <div class="test-result__head">
                  <el-tag :type="vlTestResult.ok ? 'success' : 'danger'" effect="light" size="small">
                    {{ vlTestResult.ok ? '识别成功' : '识别失败' }}
                  </el-tag>
                  <span v-if="vlTestResult.model" class="test-result__ms">模型 {{ vlTestResult.model }}</span>
                  <span v-if="vlTestResult.ms != null" class="test-result__ms">响应 {{ vlTestResult.ms }} ms</span>
                </div>
                <p v-if="vlTestResult.message" class="test-result__msg">{{ vlTestResult.message }}</p>
                <p v-if="vlTestResult.error" class="test-result__err">{{ vlTestResult.error }}</p>
              </div>
            </div>
          </el-tab-pane>

          <!-- 知识图谱 Neo4j -->
          <el-tab-pane label="知识图谱" name="kg">
            <div class="tab-pane">
              <el-alert
                type="info"
                :closable="false"
                show-icon
                class="module-alert"
                title="知识图谱配置（Neo4j）"
                description="用于维护课程知识点、学生能力画像、任务知识关联和图谱化学情分析，支撑知识关联查询与定时对账。"
              />

              <el-form :model="kgForm" label-width="168px" class="config-form">
                <el-form-item label="启用知识图谱">
                  <el-switch v-model="kgForm.kg_neo4j_enabled" active-text="已启用" inactive-text="未启用" />
                  <p class="field-hint">关闭后系统不再主动连接 Neo4j，图谱相关能力不可用。</p>
                </el-form-item>
                <el-form-item label="Neo4j URI" required>
                  <el-input v-model="kgForm.neo4j_uri" placeholder="bolt://127.0.0.1:7687" clearable />
                  <p class="field-hint">示例：bolt://127.0.0.1:7687</p>
                </el-form-item>
                <el-form-item label="Neo4j 用户名" required>
                  <el-input v-model="kgForm.neo4j_user" placeholder="neo4j" clearable />
                </el-form-item>
                <el-form-item label="Neo4j 密码">
                  <div class="key-field">
                    <el-input
                      v-model="kgForm.neo4j_password"
                      type="password"
                      show-password
                      :disabled="!kgPasswordEditing && kgForm.neo4j_password_set"
                      :placeholder="kgPasswordPlaceholder"
                      clearable
                      autocomplete="new-password"
                    />
                    <el-button
                      v-if="kgForm.neo4j_password_set && !kgPasswordEditing"
                      plain
                      @click="startEditKgPassword"
                    >
                      修改密码
                    </el-button>
                  </div>
                  <p class="field-hint">
                    已配置时留空表示不修改。不同部署环境请分别维护各自的 Neo4j 密码，不要将本地与龙芯 VM 密码写在同一配置中。
                  </p>
                </el-form-item>
                <el-form-item label="Neo4j 数据库" required>
                  <el-input v-model="kgForm.neo4j_database" placeholder="neo4j" clearable />
                </el-form-item>
                <el-form-item label="启用图谱对账">
                  <el-switch
                    v-model="kgForm.kg_reconcile_enabled"
                    active-text="已启用"
                    inactive-text="未启用"
                  />
                  <p class="field-hint">启用后系统按设定间隔进行图谱数据对账或同步。</p>
                </el-form-item>
                <el-form-item label="对账间隔">
                  <div class="interval-row">
                    <el-select v-model="kgIntervalPreset" placeholder="选择间隔" style="width: 180px" @change="applyKgIntervalPreset">
                      <el-option label="1 小时" :value="3600000" />
                      <el-option label="6 小时" :value="21600000" />
                      <el-option label="12 小时" :value="43200000" />
                      <el-option label="24 小时" :value="86400000" />
                      <el-option label="自定义" value="custom" />
                    </el-select>
                    <el-input-number
                      v-model="kgForm.kg_reconcile_interval_ms"
                      :min="60000"
                      :step="60000"
                      controls-position="right"
                    />
                    <span class="field-hint inline-ms">毫秒（≥ 60000）</span>
                  </div>
                </el-form-item>
                <el-form-item label="语义匹配阈值">
                  <div class="weight-row">
                    <el-slider
                      v-model="kgForm.kg_semantic_min_sim"
                      :min="0"
                      :max="1"
                      :step="0.01"
                      :format-tooltip="(v) => v.toFixed(2)"
                    />
                    <span class="weight-pct">{{ Number(kgForm.kg_semantic_min_sim).toFixed(2) }}</span>
                  </div>
                  <p class="field-hint">相似度越高，知识点自动匹配越谨慎；越低则越宽松。</p>
                </el-form-item>
                <el-form-item label="Neo4j 批处理大小">
                  <el-input-number v-model="kgForm.kg_neo4j_batch" :min="1" :max="1000" :step="10" />
                  <p class="field-hint">控制图谱写入或同步时的批量处理规模（1–1000）。</p>
                </el-form-item>
                <el-form-item>
                  <el-button type="primary" :loading="kgSaving" @click="saveKgSettings">
                    保存知识图谱配置
                  </el-button>
                  <el-button type="primary" plain :loading="kgTesting" @click="testKg">
                    测试 Neo4j 连接
                  </el-button>
                  <el-button plain :loading="kgStatsLoading" @click="viewKgStats">查看图谱状态</el-button>
                  <el-button plain :loading="kgReconciling" :disabled="!kgForm.kg_reconcile_enabled" @click="runKgReconcile">
                    立即对账
                  </el-button>
                  <el-button :disabled="!kgHasUnsavedChanges" @click="resetKgUnsaved">重置未保存修改</el-button>
                </el-form-item>
              </el-form>

              <div
                v-if="kgTestResult"
                class="test-result"
                :class="`test-result--${kgTestResult.ok ? 'ok' : 'fail'}`"
              >
                <div class="test-result__head">
                  <el-tag :type="kgTestResult.ok ? 'success' : 'danger'" effect="light" size="small">
                    {{ kgTestResult.ok ? '连接成功' : '连接失败' }}
                  </el-tag>
                  <span v-if="kgTestResult.database" class="test-result__ms">数据库 {{ kgTestResult.database }}</span>
                  <span v-if="kgTestResult.ms != null" class="test-result__ms">响应 {{ kgTestResult.ms }} ms</span>
                </div>
                <p v-if="kgTestResult.ok && kgTestResult.nodeCount != null" class="test-result__msg">
                  节点数 {{ formatKgCount(kgTestResult.nodeCount) }} · 关系数
                  {{ formatKgCount(kgTestResult.relationCount) }}
                </p>
                <p v-if="kgTestResult.message" class="test-result__msg">{{ kgTestResult.message }}</p>
                <p v-if="kgTestResult.error" class="test-result__err">{{ kgTestResult.error }}</p>
                <ul v-if="!kgTestResult.ok" class="kg-error-tips">
                  <li>检查 Neo4j 是否启动</li>
                  <li>检查 bolt 地址是否正确</li>
                  <li>检查用户名和密码</li>
                  <li>检查数据库名称</li>
                  <li>检查端口 7687 是否可访问</li>
                </ul>
              </div>

              <div v-if="kgStatsResult" class="test-result test-result--ok">
                <div class="test-result__head">
                  <el-tag type="info" effect="light" size="small">图谱状态</el-tag>
                  <span v-if="kgStatsResult.database" class="test-result__ms">数据库 {{ kgStatsResult.database }}</span>
                  <span v-if="kgStatsResult.ms != null" class="test-result__ms">查询 {{ kgStatsResult.ms }} ms</span>
                </div>
                <p class="test-result__msg">
                  节点数 {{ formatKgCount(kgStatsResult.nodeCount) }} · 关系数
                  {{ formatKgCount(kgStatsResult.relationCount) }}
                </p>
              </div>
            </div>
          </el-tab-pane>

          <!-- 评分权重 -->
          <el-tab-pane label="评分权重" name="weights">
            <div class="tab-pane">
              <el-form label-width="148px" class="config-form">
                <el-form-item label="AI 评分权重">
                  <div class="weight-row">
                    <el-slider v-model="aiWeightPercent" :min="0" :max="100" :step="5" show-stops />
                    <span class="weight-pct">{{ aiWeightPercent }}%</span>
                  </div>
                </el-form-item>
                <el-form-item label="教师评分权重">
                  <div class="weight-row">
                    <el-slider v-model="humanWeightPercent" :min="0" :max="100" :step="5" show-stops />
                    <span class="weight-pct">{{ humanWeightPercent }}%</span>
                  </div>
                </el-form-item>
                <el-alert
                  :type="weightsValid ? 'success' : 'warning'"
                  :closable="false"
                  show-icon
                  class="formula-alert"
                >
                  <template #title>
                    最终成绩 = AI 分 × {{ (aiWeightPercent / 100).toFixed(2) }} + 教师分 ×
                    {{ (humanWeightPercent / 100).toFixed(2) }}
                  </template>
                  <span v-if="!weightsValid">AI 权重与教师权重之和必须为 100%。</span>
                </el-alert>
              </el-form>
            </div>
          </el-tab-pane>

          <!-- 查重与内容策略 -->
          <el-tab-pane label="查重与内容策略" name="similarity">
            <div class="tab-pane">
              <el-form :model="form" label-width="148px" class="config-form">
                <el-form-item label="查重预警阈值">
                  <el-input-number v-model="form.similarity_warn_threshold" :min="0" :max="99" :step="1" />
                  <span class="pct-suffix">%</span>
                  <p class="field-hint">提交与历史相似度达到该值时，教师端给出预警提示。</p>
                </el-form-item>
                <el-form-item label="查重嫌疑阈值">
                  <el-input-number v-model="form.similarity_suspect_threshold" :min="1" :max="100" :step="1" />
                  <span class="pct-suffix">%</span>
                  <p class="field-hint">达到或超过该值时标记为高度相似，建议人工复核。</p>
                </el-form-item>
                <el-form-item label="助手敏感词">
                  <el-input
                    v-model="form.assistant_blocked_words"
                    type="textarea"
                    :rows="5"
                    placeholder="每行一个关键词，也支持逗号、分号分隔"
                  />
                  <p class="field-hint">
                    每行一个关键词，也支持逗号、分号或换行分隔；学生提问命中任一词时会被拒绝。
                  </p>
                </el-form-item>
              </el-form>

              <div class="strategy-preview">
                <h3 class="strategy-preview__title">策略预览</h3>
                <ul class="strategy-preview__list">
                  <li>预警阈值：{{ form.similarity_warn_threshold }}%</li>
                  <li>嫌疑阈值：{{ form.similarity_suspect_threshold }}%</li>
                  <li>敏感词数量：{{ blockedWordCount }} 个</li>
                </ul>
                <p v-if="!similarityValid" class="strategy-preview__warn">查重预警阈值必须小于查重嫌疑阈值。</p>
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
      </section>

      <section class="tw-panel footer-panel">
        <div class="footer-panel__note">
          <el-icon><Lock /></el-icon>
          <p>
            API Key 仅用于后端服务调用，不会在前端明文展示。留空表示不修改原密钥；修改密钥后请重新测试连接。
          </p>
        </div>
        <div class="footer-panel__actions">
          <el-button type="primary" size="large" :loading="saving" @click="save">保存设置</el-button>
          <el-button size="large" :disabled="!hasUnsavedChanges" @click="resetUnsaved">重置未保存修改</el-button>
          <el-button size="large" :loading="llmTesting" @click="testLlm">测试大模型连接</el-button>
          <el-button size="large" :loading="embTesting" @click="testEmb">测试向量接口</el-button>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { reactive, ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Cpu, Connection, Collection, ScaleToOriginal, Lock, PictureFilled, UploadFilled, Share } from '@element-plus/icons-vue'
import {
  getSettings,
  updateSettings,
  saveQwenVlSettings,
  saveKgNeo4jSettings,
  testLlmConnection,
  testEmbeddingConnection,
  testQwenVlConnection,
  testKgNeo4jConnection,
  getKgNeo4jStats,
  reconcileKgOnce,
} from '../../api/settings'
import { formatDateTime } from '../../utils/format'

const DEFAULT_VL_API_BASE = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
const DEFAULT_VL_MODEL = 'qwen3-vl-plus'
const DEFAULT_VL_TEST_PROMPT =
  '请简要描述这张图片中的主要内容，并判断是否包含代码、运行结果或项目界面。'

const DEFAULT_NEO4J_URI = 'bolt://127.0.0.1:7687'
const DEFAULT_NEO4J_USER = 'neo4j'
const DEFAULT_NEO4J_DATABASE = 'neo4j'
const DEFAULT_KG_RECONCILE_MS = 21600000
const DEFAULT_KG_SEMANTIC_MIN_SIM = 0.72
const DEFAULT_KG_BATCH = 150
const KG_INTERVAL_PRESETS = [3600000, 21600000, 43200000, 86400000]

const loading = ref(true)
const saving = ref(false)
const loadError = ref('')
const activeTab = ref('llm')
const llmKeyEditing = ref(false)
const embeddingKeyEditing = ref(false)
const vlKeyEditing = ref(false)
const kgPasswordEditing = ref(false)
const llmTesting = ref(false)
const embTesting = ref(false)
const vlSaving = ref(false)
const vlTesting = ref(false)
const kgSaving = ref(false)
const kgTesting = ref(false)
const kgStatsLoading = ref(false)
const kgReconciling = ref(false)
const lastSavedAt = ref('')
const lastTestAt = ref('')
const llmTestResult = ref(null)
const embTestResult = ref(null)
const vlTestResult = ref(null)
const kgTestResult = ref(null)
const kgStatsResult = ref(null)
const vlTestPrompt = ref(DEFAULT_VL_TEST_PROMPT)
const vlTestFileList = ref([])
const vlTestImageFile = ref(null)
const kgIntervalPreset = ref(DEFAULT_KG_RECONCILE_MS)

const ragStats = reactive({
  docCount: null,
  chunkCount: null,
  lastVectorizedAt: null,
})

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

const vlForm = reactive({
  qwen_vl_enabled: true,
  qwen_vl_api_base: DEFAULT_VL_API_BASE,
  qwen_vl_api_key: '',
  qwen_vl_api_key_set: false,
  qwen_vl_model: DEFAULT_VL_MODEL,
  qwen_vl_last_test_status: '',
  qwen_vl_last_test_at: null,
  qwen_vl_last_test_message: '',
})

const kgForm = reactive({
  kg_neo4j_enabled: false,
  neo4j_uri: DEFAULT_NEO4J_URI,
  neo4j_user: DEFAULT_NEO4J_USER,
  neo4j_password: '',
  neo4j_password_set: false,
  neo4j_database: DEFAULT_NEO4J_DATABASE,
  kg_reconcile_enabled: false,
  kg_reconcile_interval_ms: DEFAULT_KG_RECONCILE_MS,
  kg_semantic_min_sim: DEFAULT_KG_SEMANTIC_MIN_SIM,
  kg_neo4j_batch: DEFAULT_KG_BATCH,
  kg_last_test_status: '',
  kg_last_test_at: null,
  kg_last_test_message: '',
  kg_last_node_count: null,
  kg_last_relation_count: null,
})

let savedSnapshot = null
let vlSavedSnapshot = null
let kgSavedSnapshot = null

const aiWeightPercent = computed({
  get: () => Math.round(Number(form.score_ai_weight) * 100) || 0,
  set: (v) => {
    form.score_ai_weight = v / 100
  },
})

const humanWeightPercent = computed({
  get: () => Math.round(Number(form.score_human_weight) * 100) || 0,
  set: (v) => {
    form.score_human_weight = v / 100
  },
})

const weightsValid = computed(() => aiWeightPercent.value + humanWeightPercent.value === 100)

const similarityValid = computed(
  () => Number(form.similarity_warn_threshold) < Number(form.similarity_suspect_threshold)
)

const blockedWordCount = computed(() =>
  String(form.assistant_blocked_words || '')
    .split(/[,，;；\n\r]+/)
    .map((s) => s.trim())
    .filter(Boolean).length
)

const llmKeyPlaceholder = computed(() => {
  if (llmKeyEditing.value) return '请输入新的 API Key'
  if (form.llm_api_key_set) return '已配置，留空不修改'
  return '未配置，请输入 API Key'
})

const embeddingKeyPlaceholder = computed(() => {
  if (embeddingKeyEditing.value) return '请输入新的 Embedding Key'
  if (form.embedding_api_key_set) return '已配置，留空不修改'
  return '未配置，请输入 Embedding Key'
})

const vlKeyPlaceholder = computed(() => {
  if (vlKeyEditing.value) return '请输入新的 Qwen-VL API Key'
  if (vlForm.qwen_vl_api_key_set) return '已配置，留空不修改'
  return '未配置，请输入 API Key'
})

const vlConfigured = computed(
  () =>
    vlForm.qwen_vl_api_key_set &&
    !!vlForm.qwen_vl_api_base?.trim() &&
    !!vlForm.qwen_vl_model?.trim()
)

const vlTestStatusText = computed(() => {
  const s = String(vlForm.qwen_vl_last_test_status || '').toLowerCase()
  if (vlTestResult.value && !vlTestResult.value.ok) return '失败'
  if (vlTestResult.value?.ok) return '成功'
  if (s === 'success') return '成功'
  if (s === 'failed') return '失败'
  return '未测试'
})

const vlStatusValue = computed(() => {
  if (!vlForm.qwen_vl_enabled) return '未启用'
  if (!vlForm.qwen_vl_api_key_set) return '未配置'
  return '已启用'
})

const kgPasswordPlaceholder = computed(() => {
  if (kgPasswordEditing.value) return '请输入新的 Neo4j 密码'
  if (kgForm.neo4j_password_set) return '已配置，留空不修改'
  return '未配置，请输入密码'
})

const kgTestStatusText = computed(() => {
  const s = String(kgForm.kg_last_test_status || '').toLowerCase()
  if (kgTestResult.value && !kgTestResult.value.ok) return '失败'
  if (kgTestResult.value?.ok) return '成功'
  if (s === 'success') return '成功'
  if (s === 'failed') return '失败'
  return '未测试'
})

const kgStatusValue = computed(() => {
  if (!kgForm.kg_neo4j_enabled) return '未启用'
  if (!kgForm.neo4j_password_set) return '密码未配置'
  return '已启用'
})

function formatKgCount(value) {
  if (value == null || value === '') return '—'
  return String(value)
}

function syncKgIntervalPreset() {
  const ms = Number(kgForm.kg_reconcile_interval_ms)
  kgIntervalPreset.value = KG_INTERVAL_PRESETS.includes(ms) ? ms : 'custom'
}

function applyKgIntervalPreset(val) {
  if (val !== 'custom') {
    kgForm.kg_reconcile_interval_ms = Number(val)
  }
}

const llmConfigured = computed(
  () => form.llm_api_key_set && !!form.llm_api_base?.trim() && !!form.llm_model?.trim()
)

const embeddingConfigured = computed(
  () =>
    form.embedding_api_key_set &&
    !!form.embedding_api_base?.trim() &&
    !!form.embedding_model?.trim()
)

const llmStatusText = computed(() => {
  if (llmTestResult.value && !llmTestResult.value.ok) return '测试失败'
  if (llmTestResult.value?.ok) return '已配置'
  if (llmConfigured.value) return '已配置'
  if (form.llm_api_key_set || form.llm_api_base || form.llm_model) return '未完整配置'
  return '未配置'
})

const ragStatusText = computed(() => {
  if (embTestResult.value?.ok) return '可用'
  if (embTestResult.value && !embTestResult.value.ok) return '不可用'
  if (ragStats.docCount != null && ragStats.docCount > 0) return '有数据'
  if (embeddingConfigured.value) return '未测试'
  return '未配置'
})

function formatRagStat(value) {
  if (value == null) return '暂无'
  return String(value)
}

function ragHintText() {
  if (ragStats.docCount != null) {
    return `${ragStats.docCount} 篇 · ${ragStats.chunkCount ?? 0} 块`
  }
  return form.embedding_model?.trim() || '暂无统计'
}

const statusCards = computed(() => [
  {
    key: 'llm',
    label: '大模型服务',
    value: llmStatusText.value,
    hint: form.llm_model?.trim() || '—',
    icon: Cpu,
    tone: llmTestResult.value && !llmTestResult.value.ok ? 'orange' : llmConfigured.value ? 'blue' : 'slate',
  },
  {
    key: 'emb',
    label: '向量模型',
    value: embeddingConfigured.value ? '已配置' : '未配置',
    hint: form.embedding_model?.trim() || '—',
    icon: Connection,
    tone: embeddingConfigured.value ? 'teal' : 'slate',
  },
  {
    key: 'rag',
    label: '知识库 RAG',
    value: ragStatusText.value,
    hint: ragHintText(),
    icon: Collection,
    tone: embTestResult.value?.ok ? 'teal' : 'slate',
  },
  {
    key: 'weights',
    label: '评分权重',
    value: `${aiWeightPercent.value}% / ${humanWeightPercent.value}%`,
    hint: `AI ${aiWeightPercent.value}% · 教师 ${humanWeightPercent.value}%`,
    icon: ScaleToOriginal,
    tone: weightsValid.value ? 'indigo' : 'orange',
  },
  {
    key: 'vision',
    label: '视觉识别模型',
    value: vlStatusValue.value,
    hint: `${vlForm.qwen_vl_model?.trim() || DEFAULT_VL_MODEL} · 测试 ${vlTestStatusText.value}`,
    icon: PictureFilled,
    tone:
      !vlForm.qwen_vl_enabled || !vlForm.qwen_vl_api_key_set
        ? 'slate'
        : vlTestStatusText.value === '失败'
          ? 'orange'
          : 'teal',
  },
  {
    key: 'kg',
    label: '知识图谱 Neo4j',
    value: kgStatusValue.value,
    hint: `${kgForm.neo4j_database || DEFAULT_NEO4J_DATABASE} · 节点 ${formatKgCount(kgForm.kg_last_node_count)} · 关系 ${formatKgCount(kgForm.kg_last_relation_count)}`,
    icon: Share,
    tone:
      !kgForm.kg_neo4j_enabled || !kgForm.neo4j_password_set
        ? 'slate'
        : kgTestStatusText.value === '失败'
          ? 'orange'
          : 'teal',
  },
])

const overallStatusText = computed(() => {
  if (hasUnsavedChanges.value) return '有未保存修改'
  if (llmTestResult.value && !llmTestResult.value.ok) return '大模型测试失败'
  if (embTestResult.value && !embTestResult.value.ok) return '向量接口不可用'
  if (llmConfigured.value && embeddingConfigured.value) return '配置完整'
  return '部分未配置'
})

const overallStatusTag = computed(() => {
  if (hasUnsavedChanges.value) return 'warning'
  if (
    (llmTestResult.value && !llmTestResult.value.ok) ||
    (embTestResult.value && !embTestResult.value.ok)
  ) {
    return 'danger'
  }
  if (llmConfigured.value) return 'success'
  return 'info'
})

function snapshotVlForm() {
  return JSON.parse(
    JSON.stringify({
      ...vlForm,
      qwen_vl_api_key: '',
    })
  )
}

const vlHasUnsavedChanges = computed(() => {
  if (!vlSavedSnapshot) return false
  const cur = snapshotVlForm()
  const keys = Object.keys(vlSavedSnapshot)
  for (const k of keys) {
    if (cur[k] !== vlSavedSnapshot[k]) return true
  }
  if (vlForm.qwen_vl_api_key.trim()) return true
  return false
})

const KG_EDITABLE_KEYS = [
  'kg_neo4j_enabled',
  'neo4j_uri',
  'neo4j_user',
  'neo4j_database',
  'kg_reconcile_enabled',
  'kg_reconcile_interval_ms',
  'kg_semantic_min_sim',
  'kg_neo4j_batch',
]

function normalizeKgEditable(formLike) {
  return {
    kg_neo4j_enabled: !!formLike.kg_neo4j_enabled,
    neo4j_uri: String(formLike.neo4j_uri || '').trim(),
    neo4j_user: String(formLike.neo4j_user || '').trim(),
    neo4j_database: String(formLike.neo4j_database || '').trim(),
    kg_reconcile_enabled: !!formLike.kg_reconcile_enabled,
    kg_reconcile_interval_ms: Number(formLike.kg_reconcile_interval_ms) || DEFAULT_KG_RECONCILE_MS,
    kg_semantic_min_sim: Math.round(Number(formLike.kg_semantic_min_sim || DEFAULT_KG_SEMANTIC_MIN_SIM) * 100) / 100,
    kg_neo4j_batch: Number(formLike.kg_neo4j_batch) || DEFAULT_KG_BATCH,
  }
}

function snapshotKgForm() {
  return normalizeKgEditable(kgForm)
}

const kgHasUnsavedChanges = computed(() => {
  if (!kgSavedSnapshot) return false
  const cur = snapshotKgForm()
  for (const k of KG_EDITABLE_KEYS) {
    if (cur[k] !== kgSavedSnapshot[k]) return true
  }
  if (kgForm.neo4j_password.trim()) return true
  return false
})

function snapshotForm() {
  return JSON.parse(
    JSON.stringify({
      ...form,
      llm_api_key: '',
      embedding_api_key: '',
    })
  )
}

const hasUnsavedChanges = computed(() => {
  if (!savedSnapshot) return false
  const cur = snapshotForm()
  const keys = Object.keys(savedSnapshot)
  for (const k of keys) {
    if (cur[k] !== savedSnapshot[k]) return true
  }
  if (form.llm_api_key.trim()) return true
  if (form.embedding_api_key.trim()) return true
  return false
})

function applySettingsData(d) {
  form.llm_api_base = d.llm_api_base || ''
  form.llm_model = d.llm_model || ''
  form.llm_api_key = ''
  form.llm_api_key_set = !!d.llm_api_key_set
  form.score_ai_weight = Number(d.score_ai_weight) || 0.4
  form.score_human_weight = Number(d.score_human_weight) || 0.6
  form.embedding_api_base = d.embedding_api_base || ''
  form.embedding_model = d.embedding_model || ''
  form.embedding_api_key = ''
  form.embedding_api_key_set = !!d.embedding_api_key_set
  form.similarity_warn_threshold = Number(d.similarity_warn_threshold) || 40
  form.similarity_suspect_threshold = Number(d.similarity_suspect_threshold) || 70
  form.assistant_blocked_words =
    d.assistant_blocked_words != null ? String(d.assistant_blocked_words) : ''
  ragStats.docCount = d.rag_document_count != null ? Number(d.rag_document_count) : null
  ragStats.chunkCount = d.rag_chunk_count != null ? Number(d.rag_chunk_count) : null
  ragStats.lastVectorizedAt = d.rag_last_vectorized_at || null
  const qwenVl = d.qwenVl || {}
  vlForm.qwen_vl_enabled = qwenVl.enabled !== false && qwenVl.enabled !== '0'
  vlForm.qwen_vl_api_base = qwenVl.apiBase || d.qwen_vl_api_base || DEFAULT_VL_API_BASE
  vlForm.qwen_vl_model = qwenVl.model || d.qwen_vl_model || DEFAULT_VL_MODEL
  vlForm.qwen_vl_api_key = ''
  vlForm.qwen_vl_api_key_set = !!(qwenVl.apiKeyConfigured ?? d.qwen_vl_api_key_set)
  vlForm.qwen_vl_last_test_status = qwenVl.lastTestStatus || d.qwen_vl_last_test_status || ''
  vlForm.qwen_vl_last_test_at = qwenVl.lastTestAt || d.qwen_vl_last_test_at || null
  vlForm.qwen_vl_last_test_message = qwenVl.lastTestMessage || d.qwen_vl_last_test_message || ''
  const kg = d.kg || {}
  kgForm.kg_neo4j_enabled = !!(kg.enabled ?? (d.kg_neo4j_enabled === '1'))
  kgForm.neo4j_uri = String(kg.uri || d.neo4j_uri || DEFAULT_NEO4J_URI).trim()
  kgForm.neo4j_user = String(kg.user || d.neo4j_user || DEFAULT_NEO4J_USER).trim()
  kgForm.neo4j_database = String(kg.database || d.neo4j_database || DEFAULT_NEO4J_DATABASE).trim()
  kgForm.neo4j_password = ''
  kgForm.neo4j_password_set = !!(kg.passwordConfigured ?? d.neo4j_password_set)
  kgForm.kg_reconcile_enabled = !!(kg.reconcileEnabled ?? (d.kg_reconcile_enabled === '1'))
  kgForm.kg_reconcile_interval_ms = Number(
    kg.reconcileIntervalMs ?? d.kg_reconcile_interval_ms ?? DEFAULT_KG_RECONCILE_MS
  )
  kgForm.kg_semantic_min_sim =
    Math.round(Number(kg.semanticMinSim ?? d.kg_semantic_min_sim ?? DEFAULT_KG_SEMANTIC_MIN_SIM) * 100) / 100
  kgForm.kg_neo4j_batch = Number(kg.batchSize ?? d.kg_neo4j_batch ?? DEFAULT_KG_BATCH)
  kgForm.kg_last_test_status = kg.lastTestStatus || d.kg_last_test_status || ''
  kgForm.kg_last_test_at = kg.lastTestAt || d.kg_last_test_at || null
  kgForm.kg_last_test_message = kg.lastTestMessage || d.kg_last_test_message || ''
  kgForm.kg_last_node_count = kg.nodeCount ?? (d.kg_last_node_count !== '' ? Number(d.kg_last_node_count) : null)
  kgForm.kg_last_relation_count =
    kg.relationCount ?? (d.kg_last_relation_count !== '' ? Number(d.kg_last_relation_count) : null)
  syncKgIntervalPreset()
  llmKeyEditing.value = false
  embeddingKeyEditing.value = false
  vlKeyEditing.value = false
  kgPasswordEditing.value = false
  savedSnapshot = snapshotForm()
  vlSavedSnapshot = snapshotVlForm()
  kgSavedSnapshot = snapshotKgForm()
}

const load = async () => {
  loading.value = true
  loadError.value = ''
  try {
    const res = await getSettings()
    if (res.success) {
      applySettingsData(res.data || {})
    } else {
      loadError.value = res.message || '加载配置失败'
    }
  } catch (e) {
    loadError.value = e?.response?.data?.message || '加载配置失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

function startEditLlmKey() {
  llmKeyEditing.value = true
  form.llm_api_key = ''
}

function startEditEmbeddingKey() {
  embeddingKeyEditing.value = true
  form.embedding_api_key = ''
}

function startEditVlKey() {
  vlKeyEditing.value = true
  vlForm.qwen_vl_api_key = ''
}

function onVlTestImageChange(uploadFile) {
  const raw = uploadFile?.raw
  if (!raw) return
  const allowed = ['image/jpeg', 'image/png', 'image/webp']
  if (!allowed.includes(raw.type)) {
    ElMessage.warning('仅支持 JPG / PNG / WEBP 图片')
    vlTestFileList.value = []
    vlTestImageFile.value = null
    return
  }
  if (raw.size > 5 * 1024 * 1024) {
    ElMessage.warning('测试图片不能超过 5MB')
    vlTestFileList.value = []
    vlTestImageFile.value = null
    return
  }
  vlTestImageFile.value = raw
  vlTestFileList.value = [uploadFile]
}

function onVlTestImageRemove() {
  vlTestImageFile.value = null
  vlTestFileList.value = []
}

function validateVlBeforeSave() {
  if (!vlForm.qwen_vl_api_base?.trim()) {
    ElMessage.warning('请填写 Qwen-VL API Base URL')
    activeTab.value = 'vision'
    return false
  }
  if (!vlForm.qwen_vl_model?.trim()) {
    ElMessage.warning('请填写 Qwen-VL 模型名称')
    activeTab.value = 'vision'
    return false
  }
  return true
}

async function saveVlSettings() {
  if (!validateVlBeforeSave()) return
  vlSaving.value = true
  try {
    const payload = {
      enabled: vlForm.qwen_vl_enabled,
      apiBase: vlForm.qwen_vl_api_base.trim(),
      model: vlForm.qwen_vl_model.trim(),
    }
    if (vlForm.qwen_vl_api_key.trim()) {
      payload.apiKey = vlForm.qwen_vl_api_key.trim()
    }
    const res = await saveQwenVlSettings(payload)
    if (res.success) {
      ElMessage.success('视觉模型配置已保存')
      await load()
    } else {
      ElMessage.error(res.message || '保存失败')
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '保存视觉模型配置失败')
  } finally {
    vlSaving.value = false
  }
}

function resetVlUnsaved() {
  if (!vlSavedSnapshot) return
  Object.assign(vlForm, { ...vlSavedSnapshot, qwen_vl_api_key: '' })
  vlKeyEditing.value = false
  ElMessage.info('已恢复为上次保存的视觉模型配置')
}

async function testVl() {
  if (vlHasUnsavedChanges.value) {
    ElMessage.warning('当前有未保存修改，请先保存后再测试（测试使用已保存的配置）')
    return
  }
  if (!vlTestImageFile.value) {
    ElMessage.warning('请先上传测试图片')
    activeTab.value = 'vision'
    return
  }
  vlTesting.value = true
  const t0 = performance.now()
  try {
    const fd = new FormData()
    fd.append('image', vlTestImageFile.value)
    fd.append('prompt', vlTestPrompt.value.trim() || DEFAULT_VL_TEST_PROMPT)
    const res = await testQwenVlConnection(fd)
    const ms = res.data?.elapsedMs ?? Math.round(performance.now() - t0)
    lastTestAt.value = formatDateTime(new Date())
    if (res.success) {
      vlTestResult.value = {
        ok: true,
        ms,
        model: res.data?.model || vlForm.qwen_vl_model,
        message: res.data?.result || '识别完成',
        error: '',
      }
      await load()
    } else {
      vlTestResult.value = {
        ok: false,
        ms,
        model: res.data?.model || vlForm.qwen_vl_model,
        message: '',
        error: res.message || '测试失败',
      }
    }
  } catch (e) {
    const ms = Math.round(performance.now() - t0)
    lastTestAt.value = formatDateTime(new Date())
    vlTestResult.value = {
      ok: false,
      ms,
      model: vlForm.qwen_vl_model,
      message: '',
      error: e?.response?.data?.message || e?.message || '测试失败',
    }
  } finally {
    vlTesting.value = false
  }
}

function startEditKgPassword() {
  kgPasswordEditing.value = true
  kgForm.neo4j_password = ''
}

function validateKgBeforeSave() {
  if (!kgForm.neo4j_uri?.trim()) {
    ElMessage.warning('请填写 Neo4j URI')
    activeTab.value = 'kg'
    return false
  }
  if (!kgForm.neo4j_user?.trim()) {
    ElMessage.warning('请填写 Neo4j 用户名')
    activeTab.value = 'kg'
    return false
  }
  if (!kgForm.neo4j_database?.trim()) {
    ElMessage.warning('请填写 Neo4j 数据库名')
    activeTab.value = 'kg'
    return false
  }
  if (kgForm.kg_reconcile_interval_ms < 60000) {
    ElMessage.warning('对账间隔不能小于 60000 毫秒')
    activeTab.value = 'kg'
    return false
  }
  if (kgForm.kg_semantic_min_sim < 0 || kgForm.kg_semantic_min_sim > 1) {
    ElMessage.warning('语义匹配阈值必须在 0 到 1 之间')
    activeTab.value = 'kg'
    return false
  }
  if (kgForm.kg_neo4j_batch < 1 || kgForm.kg_neo4j_batch > 1000) {
    ElMessage.warning('Neo4j 批处理大小必须在 1 到 1000 之间')
    activeTab.value = 'kg'
    return false
  }
  return true
}

async function saveKgSettings() {
  if (!validateKgBeforeSave()) return
  kgSaving.value = true
  try {
    const payload = {
      enabled: kgForm.kg_neo4j_enabled,
      uri: kgForm.neo4j_uri.trim(),
      user: kgForm.neo4j_user.trim(),
      database: kgForm.neo4j_database.trim(),
      reconcileEnabled: kgForm.kg_reconcile_enabled,
      reconcileIntervalMs: kgForm.kg_reconcile_interval_ms,
      semanticMinSim: kgForm.kg_semantic_min_sim,
      batchSize: kgForm.kg_neo4j_batch,
    }
    if (kgForm.neo4j_password.trim()) {
      payload.password = kgForm.neo4j_password.trim()
    }
    const res = await saveKgNeo4jSettings(payload)
    if (res.success) {
      ElMessage.success(res.message || '知识图谱配置已保存')
      await load()
    } else {
      ElMessage.error(res.message || '保存失败')
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '保存知识图谱配置失败')
  } finally {
    kgSaving.value = false
  }
}

function resetKgUnsaved() {
  if (!kgSavedSnapshot) return
  Object.assign(kgForm, {
    ...kgSavedSnapshot,
    neo4j_password: '',
    neo4j_password_set: kgForm.neo4j_password_set,
    kg_last_test_status: kgForm.kg_last_test_status,
    kg_last_test_at: kgForm.kg_last_test_at,
    kg_last_test_message: kgForm.kg_last_test_message,
    kg_last_node_count: kgForm.kg_last_node_count,
    kg_last_relation_count: kgForm.kg_last_relation_count,
  })
  kgPasswordEditing.value = false
  syncKgIntervalPreset()
  ElMessage.info('已恢复为上次保存的知识图谱配置')
}

async function testKg() {
  if (kgHasUnsavedChanges.value) {
    ElMessage.warning('当前有未保存修改，请先保存后再测试（测试使用已保存的配置）')
    return
  }
  kgTesting.value = true
  const t0 = performance.now()
  try {
    const res = await testKgNeo4jConnection()
    const ms = res.data?.elapsedMs ?? Math.round(performance.now() - t0)
    lastTestAt.value = formatDateTime(new Date())
    if (res.success) {
      kgTestResult.value = {
        ok: true,
        ms,
        database: res.data?.database || kgForm.neo4j_database,
        nodeCount: res.data?.nodeCount,
        relationCount: res.data?.relationCount,
        message: res.data?.message || 'Neo4j 连接正常',
        error: '',
      }
      await load()
    } else {
      kgTestResult.value = {
        ok: false,
        ms,
        database: res.data?.database || kgForm.neo4j_database,
        message: '',
        error: res.message || '测试失败',
      }
    }
  } catch (e) {
    const ms = Math.round(performance.now() - t0)
    lastTestAt.value = formatDateTime(new Date())
    kgTestResult.value = {
      ok: false,
      ms,
      database: kgForm.neo4j_database,
      message: '',
      error: e?.response?.data?.message || e?.message || '测试失败',
    }
  } finally {
    kgTesting.value = false
  }
}

async function viewKgStats() {
  if (kgHasUnsavedChanges.value) {
    ElMessage.warning('当前有未保存修改，请先保存后再查看（查询使用已保存的配置）')
    return
  }
  kgStatsLoading.value = true
  const t0 = performance.now()
  try {
    const res = await getKgNeo4jStats()
    const ms = res.data?.elapsedMs ?? Math.round(performance.now() - t0)
    if (res.success) {
      kgStatsResult.value = {
        database: res.data?.database || kgForm.neo4j_database,
        nodeCount: res.data?.nodeCount,
        relationCount: res.data?.relationCount,
        ms,
      }
      kgForm.kg_last_node_count = res.data?.nodeCount ?? kgForm.kg_last_node_count
      kgForm.kg_last_relation_count = res.data?.relationCount ?? kgForm.kg_last_relation_count
    } else {
      ElMessage.error(res.message || '获取图谱状态失败')
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '获取图谱状态失败')
  } finally {
    kgStatsLoading.value = false
  }
}

async function runKgReconcile() {
  if (!kgForm.kg_reconcile_enabled) return
  if (kgHasUnsavedChanges.value) {
    ElMessage.warning('请先保存知识图谱配置后再执行对账')
    return
  }
  kgReconciling.value = true
  try {
    const res = await reconcileKgOnce()
    if (res.success) {
      ElMessage.success(res.message || '知识图谱对账已完成')
    } else {
      ElMessage.error(res.message || '对账失败')
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '对账失败')
  } finally {
    kgReconciling.value = false
  }
}

function validateBeforeSave() {
  if (!form.llm_api_base?.trim()) {
    ElMessage.warning('请填写 API Base URL')
    activeTab.value = 'llm'
    return false
  }
  if (!form.llm_model?.trim()) {
    ElMessage.warning('请填写模型名称')
    activeTab.value = 'llm'
    return false
  }
  if (!weightsValid.value) {
    ElMessage.error('AI 权重与教师权重之和必须为 100%。')
    activeTab.value = 'weights'
    return false
  }
  if (!similarityValid.value) {
    ElMessage.error('查重预警阈值必须小于查重嫌疑阈值。')
    activeTab.value = 'similarity'
    return false
  }
  return true
}

const save = async () => {
  if (!validateBeforeSave()) return

  const weightsChanged =
    savedSnapshot &&
    (savedSnapshot.score_ai_weight !== form.score_ai_weight ||
      savedSnapshot.score_human_weight !== form.score_human_weight)

  if (weightsChanged) {
    try {
      await ElMessageBox.confirm(
        '该配置将影响后续教师复核后的综合成绩计算，历史成绩不自动重算。',
        '确认修改综合评分权重？',
        { type: 'warning', confirmButtonText: '确认保存', cancelButtonText: '取消' }
      )
    } catch {
      return
    }
  }

  saving.value = true
  try {
    const payload = {
      llm_api_base: form.llm_api_base.trim(),
      llm_model: form.llm_model.trim(),
      score_ai_weight: String(form.score_ai_weight),
      score_human_weight: String(form.score_human_weight),
      embedding_api_base: form.embedding_api_base.trim(),
      embedding_model: form.embedding_model.trim(),
      similarity_warn_threshold: String(form.similarity_warn_threshold),
      similarity_suspect_threshold: String(form.similarity_suspect_threshold),
      assistant_blocked_words: form.assistant_blocked_words,
    }
    if (form.llm_api_key.trim()) {
      payload.llm_api_key = form.llm_api_key.trim()
    }
    if (form.embedding_api_key.trim()) {
      payload.embedding_api_key = form.embedding_api_key.trim()
    }
    const res = await updateSettings(payload)
    if (res.success) {
      lastSavedAt.value = formatDateTime(new Date())
      ElMessage.success('配置已保存，部分配置需重新测试后确认可用。')
      await load()
    } else {
      ElMessage.error(res.message || '保存失败')
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || e?.response?.data?.error || '保存失败')
  } finally {
    saving.value = false
  }
}

function resetUnsaved() {
  if (!savedSnapshot) return
  Object.assign(form, { ...savedSnapshot, llm_api_key: '', embedding_api_key: '' })
  llmKeyEditing.value = false
  embeddingKeyEditing.value = false
  ElMessage.info('已恢复为上次保存的配置')
}

async function testLlm() {
  if (hasUnsavedChanges.value) {
    ElMessage.warning('当前有未保存修改，请先保存后再测试（测试使用已保存的配置）')
    return
  }
  llmTesting.value = true
  const t0 = performance.now()
  try {
    const res = await testLlmConnection()
    const ms = Math.round(performance.now() - t0)
    lastTestAt.value = formatDateTime(new Date())
    if (res.success) {
      llmTestResult.value = {
        ok: true,
        ms,
        message: res.message || '大模型连接正常',
        error: res.data?.replyPreview ? `返回：${res.data.replyPreview}` : '',
      }
    } else {
      llmTestResult.value = { ok: false, ms, message: '', error: res.message || res.error || '测试失败' }
    }
  } catch (e) {
    const ms = Math.round(performance.now() - t0)
    lastTestAt.value = formatDateTime(new Date())
    llmTestResult.value = {
      ok: false,
      ms,
      message: '',
      error: e?.response?.data?.message || e?.response?.data?.error || e?.message || '测试失败',
    }
  } finally {
    llmTesting.value = false
  }
}

async function testEmb() {
  if (hasUnsavedChanges.value) {
    ElMessage.warning('当前有未保存修改，请先保存后再测试（测试使用已保存的配置）')
    return
  }
  embTesting.value = true
  const t0 = performance.now()
  try {
    const res = await testEmbeddingConnection()
    const ms = Math.round(performance.now() - t0)
    lastTestAt.value = formatDateTime(new Date())
    if (res.success) {
      embTestResult.value = {
        ok: true,
        ms,
        message: `${res.message || '向量接口正常'}${res.data?.dimensions ? `，维度 ${res.data.dimensions}` : ''}`,
        error: '',
      }
    } else {
      embTestResult.value = {
        ok: false,
        ms,
        message: '',
        error: res.error || res.message || '测试失败',
      }
    }
  } catch (e) {
    const ms = Math.round(performance.now() - t0)
    lastTestAt.value = formatDateTime(new Date())
    embTestResult.value = {
      ok: false,
      ms,
      message: '',
      error: e?.response?.data?.message || e?.response?.data?.error || e?.message || '测试失败',
    }
  } finally {
    embTesting.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.ai-config-page {
  max-width: 1080px;
  padding-bottom: 24px;
}

.status-grid {
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  position: relative;
  z-index: 0;
}

.status-card__value {
  font-size: 20px;
}

.tw-metric-card__hint {
  font-size: 12px;
  color: #94a3b8;
  margin-top: 2px;
}

.meta-bar {
  padding: 12px 18px;
  margin-bottom: 20px;
}

.meta-bar__items {
  display: flex;
  flex-wrap: wrap;
  gap: 16px 24px;
  font-size: 13px;
  color: #64748b;
  align-items: center;
}

.config-panel {
  margin-bottom: 20px;
}

.config-tabs :deep(.el-tabs__header) {
  margin: 0;
  padding: 0 18px;
}

.config-tabs :deep(.el-tabs__content) {
  padding: 0;
}

.tab-pane {
  padding: 20px 18px 24px;
}

.config-form {
  max-width: 720px;
}

.field-hint {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.55;
  color: #94a3b8;
}

.field-hint code {
  font-size: 11px;
  background: #f1f5f9;
  padding: 1px 4px;
  border-radius: 4px;
}

.key-field {
  display: flex;
  gap: 10px;
  width: 100%;
  max-width: 520px;
}

.key-field .el-input {
  flex: 1;
}

.inline-hint {
  margin-left: 12px;
  font-size: 12px;
  color: #d97706;
}

.module-alert {
  margin-bottom: 16px;
  border-radius: 10px;
}

.rag-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 20px;
  max-width: 720px;
}

.rag-stat {
  padding: 12px 14px;
  background: #f8fafc;
  border: 1px solid #eef2f7;
  border-radius: 10px;
}

.rag-stat__label {
  display: block;
  font-size: 12px;
  color: #64748b;
  margin-bottom: 4px;
}

.rag-stat__value {
  display: block;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.3;
  color: #0f172a;
}

.rag-stat__value--empty {
  font-size: 14px;
  font-weight: 500;
  color: #94a3b8;
}

.rag-stat__value--time {
  font-size: 14px;
  font-weight: 600;
}

.rag-stat__value--time.rag-stat__value--empty {
  font-weight: 500;
}

.test-result {
  margin-top: 16px;
  max-width: 720px;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid #e8edf3;
}

.test-result--ok {
  background: #f0fdf4;
  border-color: #bbf7d0;
}

.test-result--fail {
  background: #fef2f2;
  border-color: #fecaca;
}

.test-result__head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 6px;
}

.test-result__ms {
  font-size: 12px;
  color: #64748b;
}

.test-result__msg {
  margin: 0;
  font-size: 13px;
  color: #334155;
}

.test-result__err {
  margin: 4px 0 0;
  font-size: 13px;
  color: #b91c1c;
}

.weight-row {
  display: flex;
  align-items: center;
  gap: 16px;
  max-width: 480px;
  width: 100%;
}

.weight-row .el-slider {
  flex: 1;
}

.weight-pct {
  min-width: 44px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: #0f172a;
}

.formula-alert {
  margin-top: 8px;
  border-radius: 10px;
}

.pct-suffix {
  margin-left: 8px;
  color: #64748b;
}

.strategy-preview {
  margin-top: 20px;
  max-width: 720px;
  padding: 14px 16px;
  background: #f8fafc;
  border-radius: 10px;
  border: 1px solid #eef2f7;
}

.strategy-preview__title {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 600;
  color: #334155;
}

.strategy-preview__list {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  color: #475569;
  line-height: 1.8;
}

.strategy-preview__warn {
  margin: 10px 0 0;
  font-size: 12px;
  color: #c2410c;
}

.footer-panel {
  padding: 16px 18px 18px;
  margin-bottom: 0;
}

.footer-panel__note {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding-bottom: 16px;
  margin-bottom: 16px;
  border-bottom: 1px solid #eef2f7;
  font-size: 13px;
  color: #64748b;
  line-height: 1.55;
}

.footer-panel__note .el-icon {
  flex-shrink: 0;
  margin-top: 2px;
  color: #64748b;
}

.footer-panel__note p {
  margin: 0;
}

.footer-panel__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.interval-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.inline-ms {
  margin: 0;
}

.kg-error-tips {
  margin: 10px 0 0;
  padding-left: 18px;
  font-size: 12px;
  color: #64748b;
  line-height: 1.7;
}

.vl-upload {
  width: 100%;
  max-width: 520px;
}

.vl-upload__icon {
  font-size: 42px;
  color: #94a3b8;
  margin-bottom: 8px;
}

@media (max-width: 640px) {
  .rag-stats {
    grid-template-columns: 1fr;
  }
}
</style>
