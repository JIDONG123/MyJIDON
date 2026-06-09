const pool = require('../config/database');

const EXPORT_TYPE_LABELS = {
  task_scores_excel: '任务成绩 Excel',
  task_submissions_zip: '作业附件 ZIP',
  practice_scores_excel: '实训汇总 Excel',
  practice_scores_pdf: '实训汇总 PDF',
  personal_pdf: '个人成绩单 PDF',
};

/**
 * @param {object} payload
 * @param {number} payload.userId
 * @param {string} payload.exportType
 * @param {string} payload.format
 * @param {string} [payload.scopeLabel]
 * @param {number|null} [payload.taskId]
 * @param {string|null} [payload.scopeType]
 * @param {number|null} [payload.scopeId]
 * @param {string|null} [payload.fileName]
 * @param {number|null} [payload.rowCount]
 * @param {'success'|'failed'} [payload.status]
 * @param {string|null} [payload.errorMessage]
 */
async function insertExportLog(payload) {
  const {
    userId,
    exportType,
    format,
    scopeLabel = null,
    taskId = null,
    scopeType = null,
    scopeId = null,
    fileName = null,
    rowCount = null,
    status = 'success',
    errorMessage = null,
  } = payload;

  await pool.query(
    `
    INSERT INTO export_logs (
      user_id, export_type, format, scope_label, task_id,
      scope_type, scope_id, file_name, row_count, status, error_message
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    [
      userId,
      exportType,
      format,
      scopeLabel,
      taskId,
      scopeType,
      scopeId,
      fileName,
      rowCount,
      status,
      errorMessage,
    ]
  );
}

/** 异步写入，不阻塞导出响应 */
function recordExportLog(payload) {
  setImmediate(() => {
    insertExportLog(payload).catch((err) => {
      console.error('[exportLog] write failed:', err.message);
    });
  });
}

function exportTypeLabel(exportType) {
  return EXPORT_TYPE_LABELS[exportType] || exportType || '导出';
}

/**
 * @param {object} user req.user
 * @param {{ limit?: number, taskId?: number|null }} opts
 */
async function listExportLogs(user, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 20, 1), 100);
  const taskId = opts.taskId != null && opts.taskId !== '' ? Number(opts.taskId) : null;

  const params = [];
  let where = '1=1';

  if (user.role === 'admin' && opts.allUsers === true) {
    // 预留：管理员查看全员（当前前端未启用）
  } else {
    where += ' AND el.user_id = ?';
    params.push(user.id);
  }

  if (Number.isFinite(taskId) && taskId > 0) {
    where += ' AND el.task_id = ?';
    params.push(taskId);
  }

  params.push(limit);

  const [rows] = await pool.query(
    `
    SELECT
      el.id,
      el.export_type AS exportType,
      el.format,
      el.scope_label AS scopeLabel,
      el.task_id AS taskId,
      t.title AS taskTitle,
      el.scope_type AS scopeType,
      el.scope_id AS scopeId,
      el.file_name AS fileName,
      el.row_count AS rowCount,
      el.status,
      el.error_message AS errorMessage,
      el.created_at AS createdAt
    FROM export_logs el
    LEFT JOIN tasks t ON t.id = el.task_id
    WHERE ${where}
    ORDER BY el.created_at DESC
    LIMIT ?
  `,
    params
  );

  return rows.map((r) => ({
    ...r,
    exportTypeLabel: exportTypeLabel(r.exportType),
    createdAt: r.createdAt ? String(r.createdAt).replace('T', ' ').slice(0, 19) : null,
  }));
}

module.exports = {
  EXPORT_TYPE_LABELS,
  exportTypeLabel,
  insertExportLog,
  recordExportLog,
  listExportLogs,
};
