const fs = require('fs');
const path = require('path');
const pool = require('../config/database');
const { mapSubmissionFileName } = require('../utils/filenameEncoding');
const { extOf } = require('../utils/submissionAttachConfig');

function toPublicAttachment(row) {
  if (!row) return null;
  const mapped = mapSubmissionFileName({
    file_name: row.original_name,
    file_path: row.file_path,
    file_type: row.mime_type,
  });
  return {
    id: row.id,
    submissionId: row.submission_id,
    sortOrder: row.sort_order,
    originalName: row.original_name,
    fileName: mapped.file_name,
    fileUrl: mapped.file_url,
    fileSize: row.file_size,
    mimeType: row.mime_type,
    fileExt: row.file_ext,
    fileHash: row.file_hash,
    safetyStatus: row.safety_status,
    safetyReason: row.safety_reason,
    visionStatus: row.vision_status,
    visionText: row.vision_text,
    parsedText: row.parsed_text,
    createdAt: row.created_at,
  };
}

async function listBySubmissionId(submissionId) {
  const [rows] = await pool.query(
    `SELECT * FROM submission_attachments WHERE submission_id = ? ORDER BY sort_order ASC, id ASC`,
    [submissionId]
  );
  return rows.map(toPublicAttachment);
}

async function deleteBySubmissionId(submissionId, conn) {
  const q = conn || pool;
  const [rows] = await q.query('SELECT file_path FROM submission_attachments WHERE submission_id = ?', [
    submissionId,
  ]);
  await q.query('DELETE FROM submission_attachments WHERE submission_id = ?', [submissionId]);
  for (const r of rows) {
    if (r.file_path && fs.existsSync(r.file_path)) {
      try {
        fs.unlinkSync(r.file_path);
      } catch (_) {}
    }
  }
}

async function insertAttachments(submissionId, files, conn) {
  const q = conn || pool;
  const ids = [];
  for (let i = 0; i < files.length; i += 1) {
    const f = files[i];
    const [r] = await q.query(
      `INSERT INTO submission_attachments
        (submission_id, sort_order, original_name, stored_name, file_path, file_size, mime_type, file_ext,
         file_hash, safety_status, safety_reason, safety_checked_at, vision_status, parsed_text, vision_text)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        submissionId,
        i,
        f.originalName,
        f.storedName,
        f.filePath,
        f.fileSize,
        f.mimeType,
        f.fileExt || extOf(f.originalName),
        f.fileHash,
        f.safetyStatus || 'passed',
        f.safetyReason || null,
        f.safetyCheckedAt || null,
        f.visionStatus || 'skipped',
        f.parsedText ? String(f.parsedText).slice(0, 65000) : null,
        f.vlText ? String(f.vlText).slice(0, 65000) : null,
      ]
    );
    ids.push(r.insertId);
  }
  return ids;
}

async function updateAttachmentVision(attachmentId, { status, text, resultJson }) {
  await pool.query(
    `UPDATE submission_attachments SET vision_status = ?, vision_text = ?, vision_result_json = ? WHERE id = ?`,
    [status, text ? String(text).slice(0, 65000) : null, resultJson ? JSON.stringify(resultJson) : null, attachmentId]
  );
}

async function updateAttachmentParsedText(attachmentId, parsedText) {
  await pool.query(`UPDATE submission_attachments SET parsed_text = ? WHERE id = ?`, [
    parsedText ? String(parsedText).slice(0, 65000) : null,
    attachmentId,
  ]);
}

async function getAttachmentById(id) {
  const [rows] = await pool.query('SELECT * FROM submission_attachments WHERE id = ?', [id]);
  return rows[0] || null;
}

/** 兼容旧单附件：合成虚拟 attachment 列表 */
function legacyAttachmentFromSubmission(row) {
  if (!row?.file_path && !row?.file_name) return [];
  const mapped = mapSubmissionFileName(row);
  if (!mapped.file_url && !mapped.file_name) return [];
  return [
    {
      id: null,
      submissionId: row.id,
      sortOrder: 0,
      originalName: mapped.file_name,
      fileName: mapped.file_name,
      fileUrl: mapped.file_url,
      fileSize: null,
      mimeType: row.file_type,
      fileExt: extOf(mapped.file_name),
      fileHash: row.file_hash,
      safetyStatus: row.safety_status,
      legacy: true,
    },
  ];
}

async function listAttachmentsForSubmission(submissionRow) {
  try {
    const list = await listBySubmissionId(submissionRow.id);
    if (list.length) return list;
  } catch (e) {
    if (!String(e.message || '').includes("doesn't exist")) throw e;
  }
  return legacyAttachmentFromSubmission(submissionRow);
}

module.exports = {
  listBySubmissionId,
  listAttachmentsForSubmission,
  deleteBySubmissionId,
  insertAttachments,
  updateAttachmentVision,
  updateAttachmentParsedText,
  getAttachmentById,
  toPublicAttachment,
  legacyAttachmentFromSubmission,
};
