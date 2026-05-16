const { chatCompletion } = require('./llmClient');

function tryParseJson(text) {
  if (!text) return null;
  const t = text.trim();
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
    return null;
  }
}

/**
 * 对单道主观题生成 AI 建议分与理由（教师可参考，不自动写入 earned）
 */
async function suggestSubjectiveScore({ stem, referenceAnswer, studentAnswer, maxScore, questionType }) {
  const sys = `你是高校实训阅卷助手。请根据题干、参考答案要点与学生作答，给出建议得分（0到满分之间）与简短理由。必须只输出 JSON，不要其它文字。
JSON 格式：{"suggested_score": number, "rationale": string, "key_points": string[]}`;
  const user = `题型：${questionType}
满分：${maxScore}
题干：
${stem || '（无）'}

参考答案要点：
${referenceAnswer || '（未提供）'}

学生作答：
${studentAnswer == null || String(studentAnswer).trim() === '' ? '（空）' : String(studentAnswer).slice(0, 8000)}
`;
  const text = await chatCompletion(
    [
      { role: 'system', content: sys },
      { role: 'user', content: user },
    ],
    { temperature: 0.2, max_tokens: 800 }
  );
  if (!text) return null;
  const j = tryParseJson(text);
  if (!j || typeof j !== 'object') return null;
  let sc = Number(j.suggested_score);
  if (!Number.isFinite(sc)) sc = null;
  else sc = Math.max(0, Math.min(maxScore, sc));
  return {
    suggested_score: sc,
    rationale: String(j.rationale || '').slice(0, 2000),
    key_points: Array.isArray(j.key_points) ? j.key_points.map((x) => String(x)).slice(0, 12) : [],
  };
}

module.exports = { suggestSubjectiveScore, tryParseJson };
