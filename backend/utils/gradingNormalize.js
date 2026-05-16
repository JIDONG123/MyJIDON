/**
 * 大模型批改 JSON 解析与字段归一化（供 aiGrading / LangChain 编排共用，避免循环依赖）
 */

function normalizeMetrics(task) {
  let m = task.evaluation_metrics;
  if (m == null) return defaultMetrics();
  if (typeof m === 'string') {
    try {
      m = JSON.parse(m);
    } catch {
      return defaultMetrics();
    }
  }
  if (!Array.isArray(m) || m.length === 0) return defaultMetrics();
  return m.map((x) => ({
    name: String(x.name || '指标').trim() || '指标',
    weight: Number(x.weight) || 0,
    maxScore: Number(x.maxScore != null ? x.maxScore : x.weight) || 0,
  }));
}

function defaultMetrics() {
  return [
    { name: '代码质量', weight: 25, maxScore: 25 },
    { name: '文档规范性', weight: 25, maxScore: 25 },
    { name: '功能实现度', weight: 30, maxScore: 30 },
    { name: '综合表现', weight: 20, maxScore: 20 },
  ];
}

function tryParseJsonObject(text) {
  if (!text) return null;
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1].trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * 将大模型返回的 JSON 对象规范为与 grading_results 表一致的批改结构
 */
function finalizeGradingFromLlmJson(obj, task, options = {}) {
  const metrics = normalizeMetrics(task);
  const maxScore = Number(task.max_score) || 100;
  const entStd = task.enterprise_standard || '';

  const dimensionScores = Array.isArray(obj.dimensionScores)
    ? obj.dimensionScores.map((d, i) => {
        const m = metrics[i] || metrics.find((x) => x.name === d.name) || {
          name: d.name || `维度${i + 1}`,
          maxScore: maxScore / Math.max(metrics.length, 1),
        };
        const maxS = Number(d.maxScore != null ? d.maxScore : m.maxScore) || m.maxScore;
        const sc = Math.min(maxS, Math.max(0, Number(d.score) || 0));
        return {
          name: d.name || m.name,
          maxScore: maxS,
          score: sc,
        };
      })
    : [];

  let totalScore = Number(obj.totalScore);
  if (!Number.isFinite(totalScore)) {
    totalScore = dimensionScores.reduce((a, b) => a + b.score, 0);
  }
  totalScore = Math.min(maxScore, Math.max(0, parseFloat(Number(totalScore).toFixed(2))));

  let verification =
    obj.verification && typeof obj.verification === 'object'
      ? { ...obj.verification }
      : {
          requirementComparison: String(obj.requirementComparison || ''),
          enterpriseAlignment: String(obj.enterpriseAlignment || ''),
          logicIssues: Array.isArray(obj.logicIssues) ? obj.logicIssues : [],
          stepCompleteness: obj.stepCompleteness || {},
          summary: String(obj.summary || ''),
        };
  if (verification.enterpriseAlignment == null || verification.enterpriseAlignment === '') {
    verification.enterpriseAlignment = entStd
      ? '（模型未单独输出 enterpriseAlignment 字段）请查看 requirementComparison 与 summary。'
      : '未配置企业/岗位标准条目。';
  }

  return {
    totalScore,
    dimensionScores,
    comment: String(obj.aiComment || obj.comment || ''),
    problems: String(obj.aiProblems || obj.problems || ''),
    suggestions: String(obj.aiSuggestions || obj.suggestions || ''),
    verification,
  };
}

module.exports = {
  normalizeMetrics,
  defaultMetrics,
  tryParseJsonObject,
  finalizeGradingFromLlmJson,
};
