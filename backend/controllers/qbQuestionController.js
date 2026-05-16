const fs = require('fs');
const path = require('path');
const pool = require('../config/database');
const { buildImportTemplateBuffer, parseImportWorkbook } = require('../utils/qbExcel');
const rt = require('../utils/realtimeEmit');
function loadTemplateBuffer() {
  const bundled = path.join(__dirname, '..', 'templates', 'qbank-import-template.xlsx');
  if (fs.existsSync(bundled)) {
    return fs.readFileSync(bundled);
  }
  const raw = buildImportTemplateBuffer();
  const body = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
  if (!body.length) throw new Error('模板生成结果为空');
  return body;
}

function toInt(v) {
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

async function recordUsage(conn, questionId, refType, refId) {
  await conn.query(
    `INSERT INTO qb_question_usage (question_id, ref_type, ref_id) VALUES (?, ?, ?)`,
    [questionId, refType, refId]
  );
}

async function listQuestions(req, res) {
  try {
    const teacherId = req.user.id;
    const page = Math.max(1, toInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, toInt(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;
    const type = req.query.type ? String(req.query.type).trim() : '';
    const q = req.query.q ? String(req.query.q).trim() : '';

    let where = 'WHERE q.teacher_id = ? AND q.deleted_at IS NULL';
    const params = [teacherId];
    if (type && ['single', 'multi', 'judge', 'fill', 'short', 'code'].includes(type)) {
      where += ' AND q.type = ?';
      params.push(type);
    }
    if (q) {
      where += ' AND (q.stem LIKE ? OR IFNULL(q.course_label,\'\') LIKE ?)';
      const like = `%${q}%`;
      params.push(like, like);
    }

    const [cnt] = await pool.query(`SELECT COUNT(*) AS n FROM qb_questions q ${where}`, params);
    const total = Number(cnt[0].n) || 0;

    const [rows] = await pool.query(
      `SELECT q.id, q.type, q.stem, q.default_score, q.difficulty, q.course_label, q.knowledge_tags, q.created_at,
              (SELECT COUNT(*) FROM qb_question_usage u WHERE u.question_id = q.id) AS usage_count
       FROM qb_questions q
       ${where}
       ORDER BY q.id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    res.json({ success: true, data: rows, total, page, pageSize });
  } catch (e) {
    console.error('listQuestions', e);
    res.status(500).json({ success: false, message: '加载题库失败' });
  }
}

async function getQuestion(req, res) {
  try {
    const id = toInt(req.params.id);
    const [rows] = await pool.query(
      `SELECT * FROM qb_questions WHERE id = ? AND teacher_id = ? AND deleted_at IS NULL`,
      [id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: '题目不存在' });
    res.json({ success: true, data: rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: '查询失败' });
  }
}

async function createQuestion(req, res) {
  const conn = await pool.getConnection();
  try {
    const b = req.body || {};
    const type = b.type;
    if (!['single', 'multi', 'judge', 'fill', 'short', 'code'].includes(type)) {
      return res.status(400).json({ success: false, message: '题型无效' });
    }
    const stem = String(b.stem || '').trim();
    if (!stem) return res.status(400).json({ success: false, message: '题干不能为空' });
    if (b.answer_json == null) return res.status(400).json({ success: false, message: 'answer_json 必填' });
    const reference_answer = b.reference_answer != null ? String(b.reference_answer) : null;
    const default_score = Number(b.default_score) > 0 ? Number(b.default_score) : 5;
    const difficulty = ['easy', 'medium', 'hard'].includes(b.difficulty) ? b.difficulty : 'medium';
    const course_label = b.course_label != null ? String(b.course_label).slice(0, 200) : null;
    const knowledge_tags = Array.isArray(b.knowledge_tags) ? JSON.stringify(b.knowledge_tags) : null;

    await conn.beginTransaction();
    const [r] = await conn.query(
      `INSERT INTO qb_questions (teacher_id, type, stem, options_json, answer_json, reference_answer, default_score, difficulty, course_label, knowledge_tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        type,
        stem,
        b.options_json != null ? JSON.stringify(b.options_json) : null,
        JSON.stringify(b.answer_json),
        reference_answer,
        default_score,
        difficulty,
        course_label,
        Array.isArray(b.knowledge_tags) ? JSON.stringify(b.knowledge_tags) : null,
      ]
    );
    await conn.commit();
    try {
      rt.emitQuestions({ id: r.insertId });
    } catch (_) {}
    res.status(201).json({ success: true, id: r.insertId });
  } catch (e) {
    await conn.rollback();
    console.error('createQuestion', e);
    res.status(500).json({ success: false, message: '创建失败' });
  } finally {
    conn.release();
  }
}

async function updateQuestion(req, res) {
  try {
    const id = toInt(req.params.id);
    const b = req.body || {};
    const [rows] = await pool.query(`SELECT id FROM qb_questions WHERE id = ? AND teacher_id = ? AND deleted_at IS NULL`, [
      id,
      req.user.id,
    ]);
    if (!rows.length) return res.status(404).json({ success: false, message: '题目不存在' });

    const fields = [];
    const vals = [];
    if (b.stem != null) {
      fields.push('stem = ?');
      vals.push(String(b.stem).trim());
    }
    if (b.type != null && ['single', 'multi', 'judge', 'fill', 'short', 'code'].includes(b.type)) {
      fields.push('type = ?');
      vals.push(b.type);
    }
    if (b.options_json !== undefined) {
      fields.push('options_json = ?');
      vals.push(b.options_json == null ? null : JSON.stringify(b.options_json));
    }
    if (b.answer_json !== undefined) {
      fields.push('answer_json = ?');
      vals.push(JSON.stringify(b.answer_json));
    }
    if (b.reference_answer !== undefined) {
      fields.push('reference_answer = ?');
      vals.push(b.reference_answer);
    }
    if (b.default_score != null) {
      fields.push('default_score = ?');
      vals.push(Number(b.default_score));
    }
    if (b.difficulty != null) {
      fields.push('difficulty = ?');
      vals.push(b.difficulty);
    }
    if (b.course_label !== undefined) {
      fields.push('course_label = ?');
      vals.push(b.course_label);
    }
    if (b.knowledge_tags !== undefined) {
      fields.push('knowledge_tags = ?');
      vals.push(JSON.stringify(Array.isArray(b.knowledge_tags) ? b.knowledge_tags : []));
    }
    if (!fields.length) return res.json({ success: true });
    vals.push(id, req.user.id);
    await pool.query(`UPDATE qb_questions SET ${fields.join(', ')} WHERE id = ? AND teacher_id = ?`, vals);
    try {
      rt.emitQuestions({ id });
    } catch (_) {}
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: '更新失败' });
  }
}

async function deleteQuestion(req, res) {
  try {
    const id = toInt(req.params.id);
    await pool.query(`UPDATE qb_questions SET deleted_at = NOW() WHERE id = ? AND teacher_id = ?`, [id, req.user.id]);
    try {
      rt.emitQuestions({ id, deleted: true });
    } catch (_) {}
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: '删除失败' });
  }
}

async function questionUsage(req, res) {
  try {
    const id = toInt(req.params.id);
    const [own] = await pool.query(`SELECT id FROM qb_questions WHERE id = ? AND teacher_id = ? AND deleted_at IS NULL`, [
      id,
      req.user.id,
    ]);
    if (!own.length) return res.status(404).json({ success: false, message: '题目不存在' });
    const [rows] = await pool.query(
      `SELECT u.ref_type, u.ref_id, u.created_at,
              CASE u.ref_type
                WHEN 'practice' THEN (SELECT title FROM qb_practices p WHERE p.id = u.ref_id)
                WHEN 'exam' THEN (SELECT title FROM qb_exams e WHERE e.id = u.ref_id)
              END AS ref_title
       FROM qb_question_usage u WHERE u.question_id = ?
       ORDER BY u.id DESC
       LIMIT 200`,
      [id]
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: '查询失败' });
  }
}

async function downloadTemplate(req, res) {
  try {
    const body = loadTemplateBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="qbank-import-template.xlsx"; filename*=UTF-8''${encodeURIComponent('题库导入模板.xlsx')}`
    );
    res.send(body);
  } catch (e) {
    console.error('downloadTemplate', e);
    res.status(500).json({ success: false, message: e.message || '生成模板失败' });
  }
}

async function importQuestions(req, res) {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, message: '请上传 xlsx 文件' });
    }
    const parsed = parseImportWorkbook(req.file.buffer);
    if (!parsed.ok) {
      return res.status(400).json({ success: false, message: '导入校验失败', errors: parsed.errors });
    }
    const conn = await pool.getConnection();
    let inserted = 0;
    try {
      await conn.beginTransaction();
      for (const row of parsed.rows) {
        await conn.query(
          `INSERT INTO qb_questions (teacher_id, type, stem, options_json, answer_json, reference_answer, default_score, difficulty, course_label, knowledge_tags)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            req.user.id,
            row.type,
            row.stem,
            row.options_json ? JSON.stringify(row.options_json) : null,
            JSON.stringify(row.answer_json),
            row.reference_answer,
            row.default_score,
            row.difficulty,
            row.course_label,
            row.knowledge_tags ? JSON.stringify(row.knowledge_tags) : null,
          ]
        );
        inserted += 1;
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    res.json({ success: true, inserted });
    try {
      rt.emitQuestions({ inserted });
    } catch (_) {}
  } catch (e) {
    console.error('importQuestions', e);
    res.status(500).json({ success: false, message: '导入失败' });
  }
}

async function listAdminQuestions(req, res) {
  try {
    const page = Math.max(1, toInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, toInt(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;
    const type = req.query.type ? String(req.query.type).trim() : '';
    const teacherId = toInt(req.query.teacherId);
    const q = req.query.q ? String(req.query.q).trim() : '';

    let where = 'WHERE q.deleted_at IS NULL';
    const params = [];
    if (teacherId) {
      where += ' AND q.teacher_id = ?';
      params.push(teacherId);
    }
    if (type && ['single', 'multi', 'judge', 'fill', 'short', 'code'].includes(type)) {
      where += ' AND q.type = ?';
      params.push(type);
    }
    if (q) {
      where += ' AND (q.stem LIKE ? OR IFNULL(q.course_label,\'\') LIKE ?)';
      const like = `%${q}%`;
      params.push(like, like);
    }

    const [cnt] = await pool.query(`SELECT COUNT(*) AS n FROM qb_questions q ${where}`, params);
    const total = Number(cnt[0].n) || 0;

    const [rows] = await pool.query(
      `SELECT q.id, q.teacher_id, q.type, q.stem, q.default_score, q.difficulty, q.course_label, q.knowledge_tags, q.created_at,
              u.real_name AS teacher_name, u.username AS teacher_username
       FROM qb_questions q
       LEFT JOIN users u ON u.id = q.teacher_id
       ${where}
       ORDER BY q.id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    res.json({ success: true, data: rows, total, page, pageSize });
  } catch (e) {
    console.error('listAdminQuestions', e);
    res.status(500).json({ success: false, message: '加载失败' });
  }
}

module.exports = {
  listQuestions,
  listAdminQuestions,
  getQuestion,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  questionUsage,
  downloadTemplate,
  importQuestions,
  recordUsage,
};
