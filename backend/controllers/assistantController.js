const pool = require('../config/database');
const { chatCompletion, getSystemConfigs } = require('../utils/llmClient');
const { retrieveTeacherKbContext } = require('../utils/ragRetrieve');
const { getStudentClassId } = require('../utils/accessControl');

function containsBlockedWords(text, blockedCsv) {
  if (!blockedCsv || !String(blockedCsv).trim()) return false;
  const t = String(text || '').toLowerCase();
  const parts = String(blockedCsv)
    .split(/[,，;；\n]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return parts.some((w) => w && t.includes(w));
}

async function kbTeacherIdForStudent(studentId) {
  const [r] = await pool.query(
    `SELECT c.teacher_id FROM users u JOIN classes c ON c.id = u.class_id WHERE u.id = ? AND u.role = 'student'`,
    [studentId]
  );
  return r[0]?.teacher_id || null;
}

async function taskContextForStudent(studentId) {
  const cid = await getStudentClassId(studentId);
  if (!cid) return '';
  const [tasks] = await pool.query(
    `SELECT id, title, requirements, scoring_criteria FROM tasks WHERE class_id = ? ORDER BY created_at DESC LIMIT 12`,
    [cid]
  );
  return tasks
    .map((t) => `【任务${t.id}】${t.title}\n要求摘要：${String(t.requirements || '').slice(0, 400)}`)
    .join('\n\n');
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

    const cfg = await getSystemConfigs(['assistant_blocked_words']);
    if (containsBlockedWords(content, cfg.assistant_blocked_words)) {
      return res.status(400).json({ success: false, message: '内容包含受限词汇，请修改后重试' });
    }

    await pool.query(`INSERT INTO assistant_messages (session_id, role, content) VALUES (?, 'user', ?)`, [
      sid,
      content,
    ]);

    const teacherId = await kbTeacherIdForStudent(req.user.id);
    const rag = teacherId ? await retrieveTeacherKbContext(teacherId, content) : '';
    const taskCtx = await taskContextForStudent(req.user.id);

    const system = `你是高职实训场景的答疑助手，仅根据提供的「班级任务摘要」与「教师知识库片段」回答，不要编造未给出的评分细则。若资料不足请明确说明。回答简洁、可操作。`;
    const userMsg = `【学生问题】\n${content}\n\n【本班任务与要求摘要（节选）】\n${taskCtx.slice(0, 6000)}\n\n【知识库片段】\n${String(rag || '').slice(0, 6000)}`;

    let answer = '';
    try {
      answer = await chatCompletion(
        [
          { role: 'system', content: system },
          { role: 'user', content: userMsg },
        ],
        { temperature: 0.3, max_tokens: 2048 }
      );
    } catch (e) {
      answer = `（模型暂不可用）${e.message}`;
    }

    await pool.query(`INSERT INTO assistant_messages (session_id, role, content) VALUES (?, 'assistant', ?)`, [
      sid,
      answer || '（无回复）',
    ]);
    await pool.query(`UPDATE assistant_sessions SET updated_at = NOW() WHERE id = ?`, [sid]);

    res.json({ success: true, data: { answer } });
  } catch (error) {
    res.status(500).json({ success: false, message: '发送失败', error: error.message });
  }
};

module.exports = {
  listSessions,
  createSession,
  listMessages,
  postMessage,
};
