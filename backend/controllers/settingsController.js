const pool = require('../config/database');
const { maskKey, chatCompletion } = require('../utils/llmClient');
const { embedTexts } = require('../utils/embeddingClient');
const cache = require('../utils/cacheService');
const rt = require('../utils/realtimeEmit');

async function getSettings(req, res) {
  try {
    const ckey = cache.kSettings();
    const hit = await cache.getJson(ckey);
    if (hit) {
      return res.json(hit);
    }

    const [rows] = await pool.query(
      `SELECT config_key, config_value, description FROM system_config
       WHERE config_key LIKE ? OR config_key LIKE ? OR config_key LIKE ? OR config_key LIKE ? OR config_key = ?`,
      ['llm_%', 'score_%', 'embedding_%', 'similarity_%', 'assistant_blocked_words']
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
      } else if (row.config_key in data) {
        data[row.config_key] = row.config_value ?? '';
      }
    }
    const payload = { success: true, data };
    await cache.setJson(ckey, payload, cache.TTL.settings);
    res.json(payload);
  } catch (error) {
    res.status(500).json({ success: false, message: '读取系统设置失败', error: error.message });
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

module.exports = { getSettings, updateSettings, testLlmConnection, testEmbeddingConnection };
