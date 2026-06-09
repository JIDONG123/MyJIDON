/**
 * 使用既有 DeepSeek（llmClient.chatCompletion）抽取图谱实体与关系
 */

const { chatCompletion } = require('../utils/llmClient');

function tryParseKgJson(text) {
  if (!text) return null;
  const t = String(text).trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const c = fence ? fence[1].trim() : t;
  try {
    return JSON.parse(c);
  } catch {
    const s = c.indexOf('{');
    const e = c.lastIndexOf('}');
    if (s >= 0 && e > s) {
      try {
        return JSON.parse(c.slice(s, e + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function normalizePayload(raw) {
  const nodes = Array.isArray(raw?.nodes) ? raw.nodes : [];
  const relationships = Array.isArray(raw?.relationships) ? raw.relationships : [];
  return {
    nodes: nodes
      .map((n) => ({
        id: String(n.id || '').trim(),
        name: String(n.name || n.id || '').trim(),
        type: String(n.type || 'knowledge_point').trim(),
      }))
      .filter((n) => n.id && n.name),
    relationships: relationships
      .map((r) => ({
        from: String(r.from || '').trim(),
        to: String(r.to || '').trim(),
        type: String(r.type || 'RELATED').trim(),
        source: 'deepseek',
      }))
      .filter((r) => r.from && r.to && r.type),
  };
}

/**
 * @param {{ title: string, corpus: string }} input
 */
async function extractGraphFromCorpus(input) {
  const corpus = String(input.corpus || '').slice(0, 12000);
  if (!corpus.trim()) {
    return { nodes: [], relationships: [] };
  }

  const sys = `你是高校实训课程知识图谱构建助手。仅从给定文本中抽取客观的教学实体与关系，禁止编造未出现的内容。
必须只输出 JSON，格式严格为：
{"nodes":[{"id":"唯一英文id","name":"中文名称","type":"chapter|knowledge_point|exercise|task|mistake_point|student|class"}],
"relationships":[{"from":"节点id","to":"节点id","type":"PREREQUISITE|CONTAINS|RELATES_TO|ASSIGNED_TO|MASTERED|WEAK_IN|MISTAKE_ON"}]}`;

  const user = `课程/任务标题：${input.title || '实训课程'}

源文本：
${corpus}

请抽取章节、知识点、习题、实训任务、易错点及它们之间的关系。节点 id 使用简短英文下划线形式。`;

  const text = await chatCompletion(
    [
      { role: 'system', content: sys },
      { role: 'user', content: user },
    ],
    { temperature: 0.15, max_tokens: 4096 }
  );

  if (!text) {
    return { nodes: [], relationships: [], skipped: true, reason: 'LLM 未配置或调用失败' };
  }

  const parsed = tryParseKgJson(text);
  if (!parsed) {
    return { nodes: [], relationships: [], error: 'DeepSeek 返回无法解析为 JSON' };
  }
  return normalizePayload(parsed);
}

module.exports = {
  extractGraphFromCorpus,
  normalizePayload,
  tryParseKgJson,
};
