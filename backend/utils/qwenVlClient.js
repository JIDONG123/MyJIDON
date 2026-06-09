/**
 * 通义千问 Qwen3-VL-Plus 视觉识别客户端（仅图像 → 结构化文本，不参与批改）
 * 密钥与端点通过环境变量配置，与 DeepSeek / 向量模型隔离。
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_API_BASE = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const DEFAULT_MODEL = 'qwen3-vl-plus';

const RECOGNITION_SYSTEM_PROMPT =
  '你是实训作业图片内容识别助手。只提取图片中的客观信息，禁止批改、禁止打分、禁止评价、禁止给出改进建议。';

const RECOGNITION_USER_PROMPT = `请识别这张实训相关图片，提取全部可见信息。

必须只输出一个 JSON 对象（不要 markdown 代码块、不要额外说明），字段如下：
{
  "imageType": "操作截图|手写作业|代码截图|流程界面|成果文档|其他",
  "extractedText": "图中全部可见文字，按阅读顺序",
  "operationSteps": ["操作或步骤1", "操作或步骤2"],
  "answerContent": "学生作答、填写或配置的内容",
  "pageFlow": "页面、界面或流程描述",
  "otherNotes": "其他与实训相关的关键信息"
}

若某字段无内容，使用空字符串或空数组。`;

function resolveVlConfig(override) {
  if (override && typeof override === 'object') {
    const apiBase = normalizeApiBase(override.apiBase);
    return {
      apiKey: String(override.apiKey || '').trim(),
      apiBase,
      model: String(override.model || DEFAULT_MODEL).trim() || DEFAULT_MODEL,
      timeoutMs: parseInt(override.timeoutMs || process.env.QWEN_VL_TIMEOUT_MS || '120000', 10),
      maxImageBytes: parseInt(
        override.maxImageBytes || process.env.QWEN_VL_MAX_IMAGE_BYTES || String(8 * 1024 * 1024),
        10
      ),
    };
  }
  return getVlConfigFromEnv();
}

function normalizeApiBase(apiBase) {
  const base = String(apiBase || DEFAULT_API_BASE).trim() || DEFAULT_API_BASE;
  return base.replace(/\/$/, '');
}

function getVlConfigFromEnv() {
  const apiKey = (process.env.QWEN_VL_API_KEY || '').trim();
  const apiBase = normalizeApiBase(process.env.QWEN_VL_API_BASE);
  const model = (process.env.QWEN_VL_MODEL || '').trim() || DEFAULT_MODEL;
  const timeoutMs = parseInt(process.env.QWEN_VL_TIMEOUT_MS || '120000', 10);
  const maxImageBytes = parseInt(
    process.env.QWEN_VL_MAX_IMAGE_BYTES || String(8 * 1024 * 1024),
    10
  );
  return { apiKey, apiBase, model, timeoutMs, maxImageBytes };
}

/** @deprecated 优先使用 visionModelService.getQwenVlConfig() */
function getVlConfig() {
  return getVlConfigFromEnv();
}

function buildChatUrl(apiBase) {
  const trimmed = apiBase.replace(/\/$/, '');
  if (/\/v1(\/|$)/.test(trimmed)) {
    return `${trimmed}/chat/completions`;
  }
  return `${trimmed}/v1/chat/completions`;
}

function guessMime(fileName, mimeType) {
  if (mimeType && String(mimeType).startsWith('image/')) return mimeType;
  const ext = path.extname(fileName || '').toLowerCase();
  const map = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
  };
  return map[ext] || 'image/png';
}

function bufferToDataUrl(buffer, mimeType) {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

function fileToDataUrl(filePath, mimeType, maxBytes) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error('图片文件不存在或无法读取');
  }
  const stat = fs.statSync(filePath);
  if (stat.size > maxBytes) {
    throw new Error(
      `图片超过视觉识别大小限制（最大 ${Math.round(maxBytes / 1024 / 1024)}MB）`
    );
  }
  const buf = fs.readFileSync(filePath);
  return bufferToDataUrl(buf, mimeType);
}

/**
 * @param {object} structured
 * @returns {string}
 */
function formatRecognitionForGrading(structured) {
  const s = structured && typeof structured === 'object' ? structured : {};
  const steps = Array.isArray(s.operationSteps)
    ? s.operationSteps.filter((x) => String(x || '').trim())
    : [];
  const lines = [
    '---------- 图片视觉识别（Qwen-VL） ----------',
    `【图片类型】${s.imageType || '其他'}`,
    `【提取文字】${(s.extractedText || '').trim() || '（无）'}`,
  ];
  if (steps.length) {
    lines.push('【操作步骤】');
    steps.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
  }
  lines.push(`【作答内容】${(s.answerContent || '').trim() || '（无）'}`);
  lines.push(`【页面流程】${(s.pageFlow || '').trim() || '（无）'}`);
  if ((s.otherNotes || '').trim()) {
    lines.push(`【其他信息】${String(s.otherNotes).trim()}`);
  }
  return lines.join('\n');
}

function tryParseRecognitionJson(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  const direct = text.match(/\{[\s\S]*\}/);
  const candidate = direct ? direct[0] : text;
  try {
    const obj = JSON.parse(candidate);
    if (obj && typeof obj === 'object') return obj;
  } catch (_) {
    /* fall through */
  }
  return {
    imageType: '其他',
    extractedText: text.slice(0, 12000),
    operationSteps: [],
    answerContent: '',
    pageFlow: '',
    otherNotes: '',
  };
}

/**
 * @param {{ dataUrl: string, fileName?: string, signal?: AbortSignal, config?: object, systemPrompt?: string, userPrompt?: string }} params
 * @returns {Promise<{ structured: object, plainText: string, raw: string }>}
 */
async function recognizeImageVision(params) {
  const { apiKey, apiBase, model, timeoutMs } = resolveVlConfig(params.config);
  if (!apiKey) {
    throw new Error('未配置 Qwen-VL API Key');
  }
  const url = buildChatUrl(apiBase);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (params.signal) {
    params.signal.addEventListener('abort', () => controller.abort());
  }

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 4096,
        messages: [
          { role: 'system', content: params.systemPrompt || RECOGNITION_SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: params.dataUrl },
              },
              {
                type: 'text',
                text: `${params.userPrompt || RECOGNITION_USER_PROMPT}\n\n（文件名：${params.fileName || 'image'}）`,
              },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });
  } catch (e) {
    if (e && e.name === 'AbortError') {
      throw new Error('视觉识别请求超时，请稍后重试或压缩图片');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }

  const rawText = await res.text();
  if (!res.ok) {
    let detail = rawText.slice(0, 500);
    try {
      const j = JSON.parse(rawText);
      if (j?.error?.message) detail = String(j.error.message);
      else if (typeof j.message === 'string') detail = j.message;
    } catch (_) {}
    throw new Error(`视觉识别 API HTTP ${res.status}: ${detail}`);
  }

  let data;
  try {
    data = JSON.parse(rawText);
  } catch {
    throw new Error('视觉识别响应非 JSON');
  }

  const content = data?.choices?.[0]?.message?.content;
  const raw =
    typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content.map((p) => (p?.text != null ? p.text : '')).join('\n')
        : String(content || '');

  const structured = tryParseRecognitionJson(raw);
  const plainText = formatRecognitionForGrading(structured);
  return { structured, plainText, raw };
}

async function recognizeImageFile(filePath, mimeType, fileName, config) {
  const { maxImageBytes } = resolveVlConfig(config);
  const mime = guessMime(fileName, mimeType);
  const dataUrl = fileToDataUrl(filePath, mime, maxImageBytes);
  return recognizeImageVision({ dataUrl, fileName, config });
}

async function recognizeImageBuffer(buffer, mimeType, fileName, config) {
  const { maxImageBytes } = resolveVlConfig(config);
  if (!Buffer.isBuffer(buffer)) {
    throw new Error('无效的图片数据');
  }
  if (buffer.length > maxImageBytes) {
    throw new Error(
      `图片超过视觉识别大小限制（最大 ${Math.round(maxImageBytes / 1024 / 1024)}MB）`
    );
  }
  const mime = guessMime(fileName, mimeType);
  const dataUrl = bufferToDataUrl(buffer, mime);
  return recognizeImageVision({ dataUrl, fileName, config });
}

/**
 * 使用自定义提示词进行图像识别（管理端测试等场景）
 */
async function recognizeImageWithPrompt({ buffer, mimeType, fileName, prompt, config }) {
  const { apiKey, apiBase, model, timeoutMs } = resolveVlConfig(config);
  if (!apiKey) {
    throw new Error('未配置 Qwen-VL API Key');
  }
  const mime = guessMime(fileName, mimeType);
  const { maxImageBytes } = resolveVlConfig(config);
  if (buffer.length > maxImageBytes) {
    throw new Error(
      `图片超过视觉识别大小限制（最大 ${Math.round(maxImageBytes / 1024 / 1024)}MB）`
    );
  }
  const dataUrl = bufferToDataUrl(buffer, mime);
  const url = buildChatUrl(apiBase);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 2048,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: dataUrl } },
              { type: 'text', text: prompt },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });
  } catch (e) {
    if (e && e.name === 'AbortError') {
      throw new Error('视觉识别请求超时，请稍后重试或压缩图片');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }

  const rawText = await res.text();
  if (!res.ok) {
    let detail = rawText.slice(0, 500);
    try {
      const j = JSON.parse(rawText);
      if (j?.error?.message) detail = String(j.error.message);
      else if (typeof j.message === 'string') detail = j.message;
    } catch (_) {}
    throw new Error(`视觉识别 API HTTP ${res.status}: ${detail}`);
  }

  let data;
  try {
    data = JSON.parse(rawText);
  } catch {
    throw new Error('视觉识别响应非 JSON');
  }

  const content = data?.choices?.[0]?.message?.content;
  const result =
    typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content.map((p) => (p?.text != null ? p.text : '')).join('\n')
        : String(content || '');

  return { result: String(result).trim(), raw: String(result).trim() };
}

function isVlConfigured() {
  return Boolean((process.env.QWEN_VL_API_KEY || '').trim());
}

module.exports = {
  getVlConfig,
  getVlConfigFromEnv,
  resolveVlConfig,
  isVlConfigured,
  formatRecognitionForGrading,
  tryParseRecognitionJson,
  recognizeImageFile,
  recognizeImageBuffer,
  recognizeImageVision,
  recognizeImageWithPrompt,
  guessMime,
};
