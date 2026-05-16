const fs = require('fs');
const pool = require('../config/database');
const { extractTextFromFile } = require('../services/fileParser');
const { decodeMultipartFilename } = require('../utils/filenameEncoding');
const { chunkText } = require('../utils/chunkText');
const { embedTextsBatched } = require('../utils/embeddingClient');

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

    const [result] = await pool.query(
      `INSERT INTO kb_documents (teacher_id, category, title, file_path, file_name, mime_type, status) VALUES (?, ?, ?, ?, ?, ?, 'processing')`,
      [teacherId, category, title.slice(0, 200), req.file.path, fileName, req.file.mimetype || null]
    );

    const docId = result.insertId;
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
      `SELECT id, category, title, file_name, status, error_message, chunk_count, created_at, updated_at
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
