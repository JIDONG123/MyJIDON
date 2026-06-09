const ASSISTANT_SYSTEM_PROMPT = `你是高职实训场景的 AI 学习助手。你需要优先依据教师知识库、当前实训任务和课程资料回答。若知识库或任务资料不足，可以提供通用学习建议，但必须明确标注「以下为通用学习建议，具体以教师要求为准」。涉及评分细则、标准答案、提交要求时，不得编造，资料不足时应说明需以教师发布要求为准。不要直接代写完整作业，可以拆解思路、解释关键代码、协助排错和提供学习建议。回答要简洁、可操作、适合学生理解。

输出格式要求：使用规范的中文书面语分段，优先用「一、二、三」或「1. 2. 3.」组织层次；不要使用 Markdown 标题符号（#）、分隔线（---）或星号加粗（**）；需要强调时用「」标注。代码片段可用反引号包裹。`;

const LLM_UNAVAILABLE_MESSAGE =
  'AI 服务暂不可用，请稍后重试或联系管理员检查模型配置。';

const SCORING_KEYWORDS =
  /评分|分数|标准答案|扣分|细则|满分|及格|挂科|成绩|多少分|给分|判分|复核|占分|占多少/i;

const SCORING_STOP_WORDS =
  /这次|本次|任务|请问|什么|怎么|如何|是否|有没有|多少|占分|评分|分数|细则|标准|要求|老师|教师/i;

const TASK_CONTEXT_KEYWORDS =
  /任务|实训|提交|作业|要求|规范|readme|报告|答辩|截止|本班|教学班|项目|实训中心/i;

function isQuestionTaskRelated(userQuestion) {
  return TASK_CONTEXT_KEYWORDS.test(String(userQuestion || ''));
}

function taskCtxHasScoringInfo(taskCtx) {
  const t = String(taskCtx || '');
  return /评分摘要：.{8,}/.test(t) || /评分标准|分值|满分|扣分|占\s*\d+\s*分/.test(t);
}

function questionRelevantToTaskContext(taskCtx, userQuestion) {
  const tc = String(taskCtx || '');
  const q = String(userQuestion || '');
  const grams = new Set();
  for (let len = 2; len <= 4; len += 1) {
    for (let i = 0; i <= q.length - len; i += 1) {
      const g = q.slice(i, i + len);
      if (/^[\u4e00-\u9fa5]+$/.test(g) && !SCORING_STOP_WORDS.test(g)) grams.add(g);
    }
  }
  for (const g of grams) {
    if (tc.includes(g)) return true;
  }
  return false;
}

function buildEnrichedUserMessage(question, taskCtx, ragContextText) {
  const taskBlock = String(taskCtx || '').trim() || '（暂无本班任务摘要）';
  const ragBlock = String(ragContextText || '').trim() || '（未检索到相关教师知识库片段）';
  return `【学生问题】
${question}

【本班 / 教学班任务与要求摘要（节选）】
${taskBlock.slice(0, 5500)}

【教师知识库检索片段】
${ragBlock.slice(0, 5500)}`;
}

function filterHitsForMode(hits = [], minScore = 0.3) {
  return hits.filter((h) => Number(h.score) >= minScore);
}

function resolveAnswerMode({ hits = [], taskCtx = '', userQuestion = '' }) {
  const ragHit = hits.length > 0;
  const hasTask =
    /【(行政班|教学班)任务\s+\d+】/.test(String(taskCtx || '')) ||
    String(taskCtx || '').trim().length > 80;
  const asksScoring = SCORING_KEYWORDS.test(String(userQuestion || ''));

  if (ragHit) {
    return { mode: 'knowledge_base', ragHit: true };
  }
  if (asksScoring) {
    const canAnswerFromTask =
      hasTask && taskCtxHasScoringInfo(taskCtx) && questionRelevantToTaskContext(taskCtx, userQuestion);
    if (!canAnswerFromTask) {
      return { mode: 'need_teacher_confirm', ragHit: false };
    }
    return { mode: 'task_context', ragHit: false };
  }
  if (hasTask && isQuestionTaskRelated(userQuestion)) {
    return { mode: 'task_context', ragHit: false };
  }
  return { mode: 'general_advice', ragHit: false };
}

function mapSourcesForResponse(hits = []) {
  return hits.map((h) => ({
    documentId: h.documentId,
    title: h.title,
    category: h.category,
    chunkIndex: h.chunkIndex,
    snippet: h.snippet,
    score: h.score,
  }));
}

function buildLlmMessages({ systemPrompt, historyRows = [], enrichedUserMessage, maxHistoryMessages = 10 }) {
  const llmMessages = [{ role: 'system', content: systemPrompt }];
  const prior = historyRows.slice(0, -1).slice(-maxHistoryMessages);

  for (const row of prior) {
    if (row.role !== 'user' && row.role !== 'assistant') continue;
    llmMessages.push({
      role: row.role,
      content: String(row.content || '').slice(0, 2400),
    });
  }

  llmMessages.push({ role: 'user', content: enrichedUserMessage });
  return llmMessages;
}

module.exports = {
  ASSISTANT_SYSTEM_PROMPT,
  LLM_UNAVAILABLE_MESSAGE,
  buildEnrichedUserMessage,
  resolveAnswerMode,
  mapSourcesForResponse,
  buildLlmMessages,
  filterHitsForMode,
};
