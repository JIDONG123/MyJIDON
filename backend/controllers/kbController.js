const fs = require('fs');
const pool = require('../config/database');
const { extractTextFromFile } = require('../services/fileParser');
const { decodeMultipartFilename } = require('../utils/filenameEncoding');
const { chunkText } = require('../utils/chunkText');
const { embedTextsBatched } = require('../utils/embeddingClient');
const {
  validateFileBasic,
  detectTextSafety,
  auditAndReturn,
  sha256File,
} = require('../services/contentSafetyService');

function toNumberOrNull(v) {
  if (v == null) return null;
  if (typeof v === 'bigint') return Number(v);
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function processKbDocument(docId) {
  const [docs] = await pool.query('SELECT * FROM kb_documents WHERE id = ?', [docId]);
  const doc = docs[0];
  if (!doc) return;

  const safety = doc.safety_status || 'passed';
  if (safety === 'rejected' || safety === 'manual_rejected' || safety === 'pending_review') {
    if (safety === 'pending_review') {
      await pool.query(
        `UPDATE kb_documents SET status = 'failed', error_message = ?, updated_at = NOW() WHERE id = ?`,
        ['知识库文件未通过内容安全检测，暂不能入库', docId]
      );
    }
    return;
  }

  try {
    let text;
    try {
      text = await extractTextFromFile(doc.file_path, doc.mime_type, doc.file_name);
    } catch (e) {
      await pool.query(
        `UPDATE kb_documents SET status = 'failed', error_message = ?, updated_at = NOW() WHERE id = ?`,
        [String(e.message || e).slice(0, 500), docId]
      );
      return;
    }

    const chunks = chunkText(text, { maxChars: 900, overlap: 80 });
    if (!chunks.length) {
      await pool.query(
        `UPDATE kb_documents SET status = 'failed', error_message = ?, chunk_count = 0, updated_at = NOW() WHERE id = ?`,
        ['文档无可用文本或内容过短', docId]
      );
      return;
    }

    const maxChunks = 200;
    const sliceChunks = chunks.slice(0, maxChunks);

    await pool.query('DELETE FROM kb_chunks WHERE document_id = ?', [docId]);

    const embeddings = await embedTextsBatched(sliceChunks, 10);
    for (let i = 0; i < sliceChunks.length; i += 1) {
      await pool.query(
        `INSERT INTO kb_chunks (document_id, teacher_id, chunk_index, content, embedding) VALUES (?, ?, ?, ?, ?)`,
        [docId, doc.teacher_id, i, sliceChunks[i], JSON.stringify(embeddings[i])]
      );
    }

    await pool.query(
      `UPDATE kb_documents SET status = 'ready', chunk_count = ?, error_message = NULL, updated_at = NOW() WHERE id = ?`,
      [sliceChunks.length, docId]
    );
    try {
      const { clearGradingRagCacheForTeacher } = require('../utils/gradingRagCache');
      await clearGradingRagCacheForTeacher(doc.teacher_id);
    } catch {
      /* ignore */
    }
  } catch (e) {
    await pool.query('DELETE FROM kb_chunks WHERE document_id = ?', [docId]);
    await pool.query(
      `UPDATE kb_documents SET status = 'failed', error_message = ?, chunk_count = 0, updated_at = NOW() WHERE id = ?`,
      [String(e.message || e).slice(0, 500), docId]
    );
  }
}

const uploadKbDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: '请选择文件' });
    }
    const teacherId = req.user.id;
    const category = ['guide', 'standard', 'example', 'pitfalls', 'other'].includes(req.body?.category)
      ? req.body.category
      : 'other';
    const titleRaw = (req.body?.title || '').trim();
    const fileName = decodeMultipartFilename(req.file.originalname);
    const title = titleRaw || fileName || '未命名文档';

    const basic = validateFileBasic(req.file, { profile: 'kb', maxBytes: 30 * 1024 * 1024 });
    if (!basic.passed) {
      try {
        if (req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      } catch (_) {}
      return res.status(400).json({ success: false, message: basic.reason || '文件类型不支持' });
    }

    let safetyStatus = 'passed';
    let safetyReason = null;
    const textProbe = await detectTextSafety(title, { type: 'kb_title' });
    if (textProbe.riskLevel === 'blocked') {
      try {
        if (req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      } catch (_) {}
      await auditAndReturn(
        {
          targetType: 'kb_document',
          userId: teacherId,
          userRole: 'teacher',
          username: req.user.username,
          realName: req.user.realName,
          fileName,
          fileType: req.file.mimetype,
          fileHash: basic.fileHash,
        },
        textProbe
      );
      return res.status(400).json({ success: false, message: textProbe.reason || '知识库文件未通过内容安全检测，暂不能入库' });
    }
    if (textProbe.riskLevel === 'suspicious') {
      safetyStatus = 'pending_review';
      safetyReason = textProbe.reason;
    }

    const [result] = await pool.query(
      `INSERT INTO kb_documents (teacher_id, category, title, file_path, file_name, mime_type, status, safety_status, safety_reason, safety_checked_at, file_hash) VALUES (?, ?, ?, ?, ?, ?, 'processing', ?, ?, NOW(), ?)`,
      [teacherId, category, title.slice(0, 200), req.file.path, fileName, req.file.mimetype || null, safetyStatus, safetyReason, basic.fileHash || sha256File(req.file.path)]
    );

    const docId = result.insertId;
    if (safetyStatus === 'pending_review') {
      await auditAndReturn(
        {
          targetType: 'kb_document',
          targetId: docId,
          userId: teacherId,
          userRole: 'teacher',
          fileName,
          fileHash: basic.fileHash,
        },
        { ...textProbe, riskLevel: 'suspicious' }
      );
      return res.status(201).json({
        success: true,
        message: '文件已上传，内容待管理员复核，复核通过后将自动入库',
        id: docId,
        safetyStatus,
      });
    }

    setImmediate(() => {
      processKbDocument(docId).catch((err) => {
        console.error('KB process error', docId, err);
      });
    });

    res.status(201).json({
      success: true,
      message: '已上传，系统正在解析与向量化，请稍后刷新列表查看状态',
      id: docId,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '上传失败', error: error.message });
  }
};

const listKbDocuments = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, category, title, file_name, status, error_message, chunk_count, safety_status, safety_reason, created_at, updated_at
       FROM kb_documents WHERE teacher_id = ? ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    const msg = String(error.message || '');
    if (msg.includes("doesn't exist") || error.code === 'ER_NO_SUCH_TABLE') {
      return res.json({ success: true, data: [] });
    }
    res.status(500).json({ success: false, message: '获取列表失败', error: error.message });
  }
};

const deleteKbDocument = async (req, res) => {
  try {
    const id = toNumberOrNull(req.params.id);
    const [rows] = await pool.query(
      'SELECT id, file_path FROM kb_documents WHERE id = ? AND teacher_id = ?',
      [id, req.user.id]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, message: '文档不存在或无权删除' });
    }
    const fp = rows[0].file_path;
    await pool.query('DELETE FROM kb_documents WHERE id = ? AND teacher_id = ?', [id, req.user.id]);
    try {
      const { clearGradingRagCacheForTeacher } = require('../utils/gradingRagCache');
      await clearGradingRagCacheForTeacher(req.user.id);
    } catch {
      /* ignore */
    }
    if (fp && fs.existsSync(fp)) {
      try {
        fs.unlinkSync(fp);
      } catch (_) {}
    }
    res.json({ success: true, message: '已删除' });
  } catch (error) {
    res.status(500).json({ success: false, message: '删除失败', error: error.message });
  }
};

module.exports = {
  uploadKbDocument,
  listKbDocuments,
  deleteKbDocument,
  processKbDocument,
};
