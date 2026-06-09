const pool = require('../config/database');
const { maskKey, chatCompletion } = require('../utils/llmClient');
const { embedTexts } = require('../utils/embeddingClient');
const cache = require('../utils/cacheService');
const rt = require('../utils/realtimeEmit');
const {
  getQwenVlConfigForAdmin,
  saveQwenVlSettings,
  testQwenVlConnection,
  DEFAULT_TEST_PROMPT,
} = require('../services/visionModelService');
const {
  getKgPublicConfig,
  saveKgNeo4jSettings,
} = require('../services/kgConfigService');
const {
  testNeo4jConnectionAndStats,
  testNeo4jStats,
  reconnectNeo4jDriverIfNeeded,
} = require('../services/neo4jHealthService');
const { reconcile } = require('../services/kgReconcileService');

async function attachQwenVlToPayload(data) {
  data.qwenVl = await getQwenVlConfigForAdmin();
  data.qwen_vl_enabled = data.qwenVl.enabled;
  data.qwen_vl_api_base = data.qwenVl.apiBase;
  data.qwen_vl_model = data.qwenVl.model;
  data.qwen_vl_api_key_set = data.qwenVl.apiKeyConfigured;
  data.qwen_vl_last_test_status = data.qwenVl.lastTestStatus;
  data.qwen_vl_last_test_at = data.qwenVl.lastTestAt;
  data.qwen_vl_last_test_message = data.qwenVl.lastTestMessage;
}

async function attachKgToPayload(data) {
  data.kg = await getKgPublicConfig();
}

async function getSettings(req, res) {
  try {
    const ckey = cache.kSettings();
    const hit = await cache.getJson(ckey);
    if (hit) {
      await attachQwenVlToPayload(hit.data || {});
      await attachKgToPayload(hit.data || {});
      return res.json(hit);
    }

    const [rows] = await pool.query(
      `SELECT config_key, config_value, description FROM system_config
       WHERE config_key LIKE ? OR config_key LIKE ? OR config_key LIKE ? OR config_key LIKE ? OR config_key = ? OR config_key LIKE ? OR config_key LIKE ? OR config_key LIKE ?`,
      ['llm_%', 'score_%', 'embedding_%', 'similarity_%', 'assistant_blocked_words', 'qwen_vl_%', 'kg_%', 'neo4j_%']
    );
    const data = {
      llm_api_base: '',
      llm_model: '',
      score_ai_weight: '0.4',
      score_human_weight: '0.6',
      llm_api_key_masked: '',
      llm_api_key_set: false,
      embedding_api_base: '',
      embedding_model: '',
      embedding_api_key_masked: '',
      embedding_api_key_set: false,
      similarity_warn_threshold: '40',
      similarity_suspect_threshold: '70',
      assistant_blocked_words: '',
      descriptions: {},
    };
    for (const row of rows) {
      data.descriptions[row.config_key] = row.description;
      if (row.config_key === 'llm_api_key') {
        data.llm_api_key_masked = row.config_value ? maskKey(row.config_value) : '';
        data.llm_api_key_set = Boolean(row.config_value && String(row.config_value).trim());
      } else if (row.config_key === 'embedding_api_key') {
        data.embedding_api_key_masked = row.config_value ? maskKey(row.config_value) : '';
        data.embedding_api_key_set = Boolean(row.config_value && String(row.config_value).trim());
      } else if (row.config_key === 'qwen_vl_api_key') {
        data.qwen_vl_api_key_masked = row.config_value ? maskKey(row.config_value) : '';
      } else if (row.config_key === 'neo4j_password') {
        data.neo4j_password_masked = row.config_value ? maskKey(row.config_value) : '';
      } else if (row.config_key.startsWith('qwen_vl_') && row.config_key !== 'qwen_vl_api_key') {
        data[row.config_key] = row.config_value ?? '';
      } else if (
        (row.config_key.startsWith('kg_') || row.config_key.startsWith('neo4j_')) &&
        row.config_key !== 'neo4j_password'
      ) {
        data[row.config_key] = row.config_value ?? '';
      } else if (row.config_key in data) {
        data[row.config_key] = row.config_value ?? '';
      }
    }

    try {
      const [[docRow]] = await pool.query(
        `SELECT COUNT(*) AS n FROM kb_documents WHERE status = 'ready'`
      );
      const [[chunkRow]] = await pool.query(`SELECT COUNT(*) AS n FROM kb_chunks`);
      const [[lastRow]] = await pool.query(
        `SELECT MAX(updated_at) AS t FROM kb_documents WHERE status = 'ready'`
      );
      data.rag_document_count = Number(docRow?.n) || 0;
      data.rag_chunk_count = Number(chunkRow?.n) || 0;
      data.rag_last_vectorized_at = lastRow?.t || null;
    } catch {
      data.rag_document_count = null;
      data.rag_chunk_count = null;
      data.rag_last_vectorized_at = null;
    }

    await attachQwenVlToPayload(data);
    await attachKgToPayload(data);

    const payload = { success: true, data };
    await cache.setJson(ckey, payload, cache.TTL.settings);
    res.json(payload);
  } catch (error) {
    res.status(500).json({ success: false, message: '读取系统设置失败', error: error.message });
  }
}

async function getAiSettings(req, res) {
  try {
    const qwenVl = await getQwenVlConfigForAdmin();
    const kg = await getKgPublicConfig();
    res.json({ success: true, data: { qwenVl, kg } });
  } catch (error) {
    res.status(500).json({ success: false, message: '读取 AI 配置失败', error: error.message });
  }
}

async function updateSettings(req, res) {
  try {
    const body = req.body || {};
    const entries = [
      ['llm_api_base', body.llm_api_base],
      ['llm_model', body.llm_model],
      ['score_ai_weight', body.score_ai_weight],
      ['score_human_weight', body.score_human_weight],
      ['embedding_api_base', body.embedding_api_base],
      ['embedding_model', body.embedding_model],
      ['similarity_warn_threshold', body.similarity_warn_threshold],
      ['similarity_suspect_threshold', body.similarity_suspect_threshold],
      ['assistant_blocked_words', body.assistant_blocked_words],
    ];

    for (const [key, val] of entries) {
      if (val !== undefined && val !== null) {
        await pool.query(
          'UPDATE system_config SET config_value = ?, updated_at = NOW() WHERE config_key = ?',
          [String(val), key]
        );
      }
    }

    if (body.llm_api_key !== undefined && String(body.llm_api_key).trim() !== '' && !String(body.llm_api_key).includes('****')) {
      await pool.query(
        'UPDATE system_config SET config_value = ?, updated_at = NOW() WHERE config_key = ?',
        [String(body.llm_api_key).trim(), 'llm_api_key']
      );
    }

    if (
      body.embedding_api_key !== undefined &&
      String(body.embedding_api_key).trim() !== '' &&
      !String(body.embedding_api_key).includes('****')
    ) {
      await pool.query(
        'UPDATE system_config SET config_value = ?, updated_at = NOW() WHERE config_key = ?',
        [String(body.embedding_api_key).trim(), 'embedding_api_key']
      );
    }

    try {
      await cache.invalidateSettings();
    } catch {
      /* ignore */
    }
    res.json({ success: true, message: '保存成功' });
    try {
      rt.emitSystemSettings({});
    } catch {
      /* ignore */
    }
  } catch (error) {
    res.status(500).json({ success: false, message: '保存失败', error: error.message });
  }
}

async function updateQwenVlSettings(req, res) {
  try {
    const body = req.body || {};
    await saveQwenVlSettings({
      enabled: body.enabled !== false && body.enabled !== '0' && body.enabled !== 0,
      apiBase: body.apiBase ?? body.qwen_vl_api_base,
      apiKey: body.apiKey ?? body.qwen_vl_api_key,
      model: body.model ?? body.qwen_vl_model,
    });
    try {
      await cache.invalidateSettings();
    } catch {
      /* ignore */
    }
    res.json({ success: true, message: '视觉模型配置已保存' });
    try {
      rt.emitSystemSettings({});
    } catch {
      /* ignore */
    }
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({
      success: false,
      message: error.message || '保存视觉模型配置失败',
    });
  }
}

async function testQwenVlSettings(req, res) {
  try {
    const file = req.file;
    if (!file || !file.buffer) {
      return res.status(400).json({ success: false, message: '请上传测试图片（JPG / PNG / WEBP，最大 5MB）' });
    }
    const prompt = req.body?.prompt || DEFAULT_TEST_PROMPT;
    const data = await testQwenVlConnection({
      imageBuffer: file.buffer,
      mimeType: file.mimetype,
      fileName: file.originalname,
      prompt,
    });
    try {
      await cache.invalidateSettings();
    } catch {
      /* ignore */
    }
    res.json({ success: true, data });
  } catch (error) {
    const status = error.statusCode || 502;
    res.status(status).json({
      success: false,
      message: error.message || 'Qwen-VL 图像识别测试失败',
      data: error.elapsedMs != null
        ? { status: 'failed', model: error.model, elapsedMs: error.elapsedMs }
        : undefined,
    });
  }
}

async function updateKgNeo4jSettings(req, res) {
  try {
    const body = req.body || {};
    const { connectionChanged } = await saveKgNeo4jSettings({
      enabled: !(body.enabled === false || body.enabled === '0' || body.enabled === 0),
      uri: body.uri ?? body.neo4j_uri,
      user: body.user ?? body.neo4j_user,
      password: body.password ?? body.neo4j_password,
      database: body.database ?? body.neo4j_database,
      reconcileEnabled: !(
        (body.reconcileEnabled ?? body.kg_reconcile_enabled) === false ||
        (body.reconcileEnabled ?? body.kg_reconcile_enabled) === '0' ||
        (body.reconcileEnabled ?? body.kg_reconcile_enabled) === 0
      ),
      reconcileIntervalMs: body.reconcileIntervalMs ?? body.kg_reconcile_interval_ms,
      semanticMinSim: body.semanticMinSim ?? body.kg_semantic_min_sim,
      batchSize: body.batchSize ?? body.kg_neo4j_batch,
    });

    await reconnectNeo4jDriverIfNeeded();

    try {
      await cache.invalidateSettings();
    } catch {
      /* ignore */
    }

    let message = '知识图谱配置已保存';
    if (connectionChanged) {
      message +=
        '。连接地址、用户名、密码或数据库修改后，需要重启后端服务后完全生效；对账任务配置修改后，可能需要重启 backend / worker 后完全生效。';
    }

    res.json({ success: true, message });
    try {
      rt.emitSystemSettings({});
    } catch {
      /* ignore */
    }
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({
      success: false,
      message: error.message || '保存知识图谱配置失败',
    });
  }
}

async function testKgNeo4jSettings(req, res) {
  try {
    const data = await testNeo4jConnectionAndStats();
    await reconnectNeo4jDriverIfNeeded();
    try {
      await cache.invalidateSettings();
    } catch {
      /* ignore */
    }
    res.json({ success: true, data });
  } catch (error) {
    const status = error.statusCode || 502;
    res.status(status).json({
      success: false,
      message: error.message || 'Neo4j 连接失败',
      data:
        error.elapsedMs != null
          ? {
              status: 'failed',
              database: error.database,
              elapsedMs: error.elapsedMs,
            }
          : undefined,
    });
  }
}

async function getKgNeo4jStats(req, res) {
  try {
    const data = await testNeo4jStats();
    try {
      await cache.invalidateSettings();
    } catch {
      /* ignore */
    }
    res.json({ success: true, data });
  } catch (error) {
    const status = error.statusCode || 502;
    res.status(status).json({
      success: false,
      message: error.message || '获取图谱状态失败',
    });
  }
}

async function reconcileKgOnce(req, res) {
  try {
    const result = await reconcile();
    if (!result.ok) {
      return res.status(502).json({
        success: false,
        message: result.error || '知识图谱对账失败',
      });
    }
    res.json({
      success: true,
      message: '知识图谱对账已完成',
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || '知识图谱对账失败',
    });
  }
}

async function testLlmConnection(req, res) {
  try {
    const text = await chatCompletion(
      [{ role: 'user', content: '请仅回复单词：OK' }],
      { max_tokens: 32, temperature: 0 },
    );
    if (text == null || !String(text).trim()) {
      return res.status(400).json({
        success: false,
        message:
          '未返回有效内容。请确认已保存 API Base、API Key、模型名，且服务器可访问公网接口。',
      });
    }
    res.json({
      success: true,
      message: '大模型连接正常',
      data: { replyPreview: String(text).trim().slice(0, 500) },
    });
  } catch (e) {
    res.status(502).json({
      success: false,
      message: '调用失败（网络、密钥或服务商限制）',
      error: e.message,
    });
  }
}

async function testEmbeddingConnection(req, res) {
  try {
    const vecs = await embedTexts(['实训知识库向量连接测试']);
    if (!vecs?.[0]?.length) {
      return res.status(400).json({ success: false, message: '未返回有效向量' });
    }
    res.json({
      success: true,
      message: '向量模型连接正常',
      data: { dimensions: vecs[0].length },
    });
  } catch (e) {
    res.status(502).json({
      success: false,
      message: '向量接口调用失败（请检查 embedding API Base / Key / 模型名与网络）',
      error: e.message,
    });
  }
}

module.exports = {
  getSettings,
  getAiSettings,
  updateSettings,
  updateQwenVlSettings,
  updateKgNeo4jSettings,
  testQwenVlSettings,
  testKgNeo4jSettings,
  getKgNeo4jStats,
  reconcileKgOnce,
  testLlmConnection,
  testEmbeddingConnection,
};
