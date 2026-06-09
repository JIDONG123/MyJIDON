const pool = require('../config/database');
const { generateAssistantReply, streamAssistantReply } = require('../services/assistantService');
const { detectTextSafety, auditAndReturn } = require('../services/contentSafetyService');
const {
  isAssistantStreamEnabled,
  initSseResponse,
  writeSseEvent,
  createSseHeartbeat,
  clearSseHeartbeat,
} = require('../utils/sseHelper');

function containsBlockedWords(text, blockedCsv) {
  if (!blockedCsv || !String(blockedCsv).trim()) return false;
  const t = String(text || '').toLowerCase();
  const parts = String(blockedCsv)
    .split(/[,，;；\n]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return parts.some((w) => w && t.includes(w));
}

const listSessions = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, title, created_at, updated_at FROM assistant_sessions WHERE student_id = ? ORDER BY updated_at DESC`,
      [req.user.id]
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: '加载失败', error: error.message });
  }
};

const createSession = async (req, res) => {
  try {
    const title = (req.body?.title && String(req.body.title).trim()) || '新对话';
    const [r] = await pool.query(`INSERT INTO assistant_sessions (student_id, title) VALUES (?, ?)`, [
      req.user.id,
      title.slice(0, 120),
    ]);
    res.status(201).json({ success: true, data: { id: r.insertId, title } });
  } catch (error) {
    res.status(500).json({ success: false, message: '创建失败', error: error.message });
  }
};

const listMessages = async (req, res) => {
  try {
    const sid = Number(req.params.sessionId);
    const [sess] = await pool.query(`SELECT id FROM assistant_sessions WHERE id = ? AND student_id = ?`, [
      sid,
      req.user.id,
    ]);
    if (!sess.length) return res.status(404).json({ success: false, message: '会话不存在' });
    const [msgs] = await pool.query(
      `SELECT id, role, content, created_at FROM assistant_messages WHERE session_id = ? ORDER BY id ASC`,
      [sid]
    );
    res.json({ success: true, data: msgs });
  } catch (error) {
    res.status(500).json({ success: false, message: '加载失败', error: error.message });
  }
};

const postMessage = async (req, res) => {
  try {
    const sid = Number(req.params.sessionId);
    const content = String(req.body?.content || '').trim();
    if (!content) return res.status(400).json({ success: false, message: '请输入内容' });

    const [sess] = await pool.query(`SELECT id FROM assistant_sessions WHERE id = ? AND student_id = ?`, [
      sid,
      req.user.id,
    ]);
    if (!sess.length) return res.status(404).json({ success: false, message: '会话不存在' });

    const textR = await detectTextSafety(content, { type: 'assistant' });
    if (textR.riskLevel === 'blocked') {
      await auditAndReturn(
        {
          targetType: 'assistant',
          targetId: sid,
          userId: req.user.id,
          userRole: req.user.role,
        },
        textR
      );
      return res.status(400).json({ success: false, message: textR.reason || '内容包含受限词汇，请修改后重试' });
    }

    await pool.query(`INSERT INTO assistant_messages (session_id, role, content) VALUES (?, 'user', ?)`, [
      sid,
      content,
    ]);

    const { answer, mode, ragHit, sources } = await generateAssistantReply({
      studentId: req.user.id,
      sessionId: sid,
      question: content,
    });

    await pool.query(`INSERT INTO assistant_messages (session_id, role, content) VALUES (?, 'assistant', ?)`, [
      sid,
      answer,
    ]);
    await pool.query(`UPDATE assistant_sessions SET updated_at = NOW() WHERE id = ?`, [sid]);

    res.json({
      success: true,
      data: {
        answer,
        mode,
        ragHit,
        sources,
      },
    });
  } catch (error) {
    console.error('[assistant] postMessage failed:', error.message);
    res.status(500).json({ success: false, message: '发送失败', error: error.message });
  }
};

const postMessageStream = async (req, res) => {
  if (!isAssistantStreamEnabled()) {
    return res.status(503).json({ success: false, message: '流式问答未启用，请使用普通接口' });
  }

  let clientClosed = false;
  let heartbeatTimer = null;

  const markClosed = () => {
    clientClosed = true;
    clearSseHeartbeat(heartbeatTimer);
    heartbeatTimer = null;
  };

  req.on('close', markClosed);
  res.on('close', markClosed);

  const isEnded = () => clientClosed || res.writableEnded;

  const writeEvent = (event, data) =>
    writeSseEvent(res, event, data, { endedCheck: isEnded });

  try {
    const sid = Number(req.params.sessionId);
    const content = String(req.body?.content || '').trim();
    if (!content) return res.status(400).json({ success: false, message: '请输入内容' });

    const [sess] = await pool.query(`SELECT id FROM assistant_sessions WHERE id = ? AND student_id = ?`, [
      sid,
      req.user.id,
    ]);
    if (!sess.length) return res.status(404).json({ success: false, message: '会话不存在' });

    const textR = await detectTextSafety(content, { type: 'assistant' });
    if (textR.riskLevel === 'blocked') {
      await auditAndReturn(
        {
          targetType: 'assistant',
          targetId: sid,
          userId: req.user.id,
          userRole: req.user.role,
        },
        textR
      );
      return res.status(400).json({ success: false, message: textR.reason || '内容包含受限词汇，请修改后重试' });
    }

    const [userInsert] = await pool.query(
      `INSERT INTO assistant_messages (session_id, role, content) VALUES (?, 'user', ?)`,
      [sid, content]
    );
    const userMessageId = userInsert.insertId;

    initSseResponse(res);
    heartbeatTimer = createSseHeartbeat(res, 15000, { endedCheck: isEnded });

    writeEvent('start', {
      conversationId: sid,
      sessionId: sid,
      userMessageId,
    });

    const { answer, mode, ragHit, sources } = await streamAssistantReply({
      studentId: req.user.id,
      sessionId: sid,
      question: content,
      isAborted: isEnded,
      onDelta: (chunk) => {
        writeEvent('delta', { content: chunk });
      },
    });

    clearSseHeartbeat(heartbeatTimer);
    heartbeatTimer = null;

    if (isEnded()) return;

    const [asstInsert] = await pool.query(
      `INSERT INTO assistant_messages (session_id, role, content) VALUES (?, 'assistant', ?)`,
      [sid, answer]
    );
    const answerId = asstInsert.insertId;
    await pool.query(`UPDATE assistant_sessions SET updated_at = NOW() WHERE id = ?`, [sid]);

    writeEvent('refs', {
      mode,
      ragHit,
      references: sources,
      sources,
    });
    writeEvent('done', {
      answerId,
      conversationId: sid,
      sessionId: sid,
      userMessageId,
      interrupted: false,
    });
    if (!res.writableEnded) res.end();
  } catch (error) {
    console.error('[assistant] postMessageStream failed:', error.message);
    clearSseHeartbeat(heartbeatTimer);
    heartbeatTimer = null;
    if (!res.headersSent) {
      return res.status(500).json({ success: false, message: '生成失败，请稍后重试' });
    }
    if (!isEnded()) {
      writeEvent('error', { message: '生成失败，请稍后重试' });
      if (!res.writableEnded) res.end();
    }
  }
};

module.exports = {
  listSessions,
  createSession,
  listMessages,
  postMessage,
  postMessageStream,
};
