const { listExportLogs } = require('../services/exportLogService');

function toInt(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const listLogs = async (req, res) => {
  try {
    const taskId = toInt(req.query.taskId);
    const limit = toInt(req.query.limit) || 20;
    const data = await listExportLogs(req.user, { taskId, limit });
    res.json({ success: true, data });
  } catch (error) {
    if (/export_logs/i.test(error.message || '')) {
      return res.status(503).json({
        success: false,
        message: '导出日志表尚未初始化，请执行数据库迁移 migrations/006_export_logs.sql',
      });
    }
    res.status(500).json({ success: false, message: '获取导出记录失败', error: error.message });
  }
};

module.exports = { listLogs };
