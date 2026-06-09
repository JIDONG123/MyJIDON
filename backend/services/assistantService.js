const pool = require('../config/database');
const { chatCompletion, chatCompletionStream } = require('../utils/llmClient');
const { retrieveTeacherKbHits } = require('../utils/ragRetrieve');
const { getStudentClassId, getStudentTeachingClassIds } = require('../utils/accessControl');
const {
  ASSISTANT_SYSTEM_PROMPT,
  LLM_UNAVAILABLE_MESSAGE,
  buildEnrichedUserMessage,
  resolveAnswerMode,
  mapSourcesForResponse,
  buildLlmMessages,
  filterHitsForMode,
} = require('../utils/assistantPrompt');

async function kbTeacherIdsForStudent(studentId) {
  const ids = new Set();
  const [adminRow] = await pool.query(
    `SELECT c.teacher_id FROM users u JOIN classes c ON c.id = u.class_id WHERE u.id = ? AND u.role = 'student'`,
    [studentId]
  );
  if (adminRow[0]?.teacher_id) ids.add(Number(adminRow[0].teacher_id));

  const tcIds = await getStudentTeachingClassIds(studentId);
  if (tcIds.length) {
    const ph = tcIds.map(() => '?').join(',');
    const [trows] = await pool.query(
      `SELECT DISTINCT tct.teacher_id
       FROM teaching_class_teachers tct
       WHERE tct.teaching_class_id IN (${ph})`,
      tcIds
    );
    for (const r of trows) {
      if (r.teacher_id) ids.add(Number(r.teacher_id));
    }
  }

  return [...ids].filter((id) => Number.isFinite(id) && id > 0);
}

async function taskContextForStudent(studentId) {
  const cid = await getStudentClassId(studentId);
  const tcIds = await getStudentTeachingClassIds(studentId);
  const blocks = [];

  if (cid) {
    const [tasks] = await pool.query(
      `SELECT id, title, requirements, scoring_criteria FROM tasks
       WHERE class_id = ? AND teaching_class_id IS NULL
       ORDER BY created_at DESC LIMIT 8`,
      [cid]
    );
    for (const t of tasks) {
      blocks.push(
        `【行政班任务 ${t.id}】${t.title}\n要求摘要：${String(t.requirements || '').slice(0, 360)}\n评分摘要：${String(t.scoring_criteria || '').slice(0, 280)}`
      );
    }
  }

  if (tcIds.length) {
    const ph = tcIds.map(() => '?').join(',');
    const [tasks] = await pool.query(
      `SELECT id, title, requirements, scoring_criteria, teaching_class_id FROM tasks
       WHERE teaching_class_id IN (${ph})
       ORDER BY created_at DESC LIMIT 8`,
      tcIds
    );
    for (const t of tasks) {
      blocks.push(
        `【教学班任务 ${t.id}】${t.title}\n要求摘要：${String(t.requirements || '').slice(0, 360)}\n评分摘要：${String(t.scoring_criteria || '').slice(0, 280)}`
      );
    }
  }

  return blocks.join('\n\n').slice(0, 6000);
}

async function loadSessionHistory(sessionId) {
  const [rows] = await pool.query(
    `SELECT id, role, content FROM assistant_messages WHERE session_id = ? ORDER BY id ASC`,
    [sessionId]
  );
  return rows;
}

/** RAG + 任务上下文 + prompt 组装（流式 / 非流式共用） */
async function prepareAssistantContext({ studentId, sessionId, question }) {
  const teacherIds = await kbTeacherIdsForStudent(studentId);
  const ragResult = teacherIds.length
    ? await retrieveTeacherKbHits(teacherIds, question, 6)
    : { contextText: '', hits: [] };

  const taskCtx = await taskContextForStudent(studentId);
  const meaningfulHits = filterHitsForMode(ragResult.hits);
  const { mode, ragHit } = resolveAnswerMode({
    hits: meaningfulHits,
    taskCtx,
    userQuestion: question,
  });
  const sources = mapSourcesForResponse(meaningfulHits);

  const historyRows = await loadSessionHistory(sessionId);
  const enrichedUser = buildEnrichedUserMessage(question, taskCtx, ragResult.contextText);
  const llmMessages = buildLlmMessages({
    systemPrompt: ASSISTANT_SYSTEM_PROMPT,
    historyRows,
    enrichedUserMessage: enrichedUser,
    maxHistoryMessages: 10,
  });

  return { llmMessages, mode, ragHit, sources };
}

async function generateAssistantReply({ studentId, sessionId, question }) {
  const ctx = await prepareAssistantContext({ studentId, sessionId, question });

  let answer = null;
  try {
    answer = await chatCompletion(ctx.llmMessages, { temperature: 0.35, max_tokens: 2048, timeoutMs: 90000 });
  } catch (_) {
    answer = null;
  }

  if (!answer || !String(answer).trim()) {
    answer = LLM_UNAVAILABLE_MESSAGE;
  }

  return { answer, mode: ctx.mode, ragHit: ctx.ragHit, sources: ctx.sources };
}

/**
 * 流式生成助手回答；模型不支持 stream 时自动 fallback 到阻塞接口
 */
async function streamAssistantReply({
  studentId,
  sessionId,
  question,
  onDelta,
  isAborted,
  signal,
}) {
  const ctx = await prepareAssistantContext({ studentId, sessionId, question });
  const llmOpts = { temperature: 0.35, max_tokens: 2048, timeoutMs: 90000 };

  let answer = '';
  let streamed = false;

  try {
    const result = await chatCompletionStream(ctx.llmMessages, llmOpts, {
      onDelta: (chunk) => {
        if (isAborted?.()) return;
        answer += chunk;
        if (onDelta) onDelta(chunk);
      },
      signal,
      isAborted,
    });
    if (result?.text) {
      answer = result.text;
      streamed = !!result.streamed;
    }
  } catch (_) {
    answer = '';
  }

  if (!answer.trim()) {
    try {
      const fallback = await chatCompletion(ctx.llmMessages, llmOpts);
      if (fallback && String(fallback).trim()) {
        answer = String(fallback);
        if (!isAborted?.() && onDelta) onDelta(answer);
      }
    } catch (_) {
      answer = '';
    }
  }

  if (!answer.trim()) {
    answer = LLM_UNAVAILABLE_MESSAGE;
    if (!isAborted?.() && onDelta) onDelta(answer);
  }

  return { answer, mode: ctx.mode, ragHit: ctx.ragHit, sources: ctx.sources, streamed };
}

module.exports = {
  kbTeacherIdsForStudent,
  taskContextForStudent,
  prepareAssistantContext,
  generateAssistantReply,
  streamAssistantReply,
};
