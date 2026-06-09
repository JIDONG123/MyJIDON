const teacherImportService = require('../services/teacherImportService');
const { buildImportTemplateBuffer } = require('../utils/teacherImportExcel');

async function downloadTemplate(_req, res) {
  try {
    const buf = await buildImportTemplateBuffer();
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="teacher-import-template.xlsx"; filename*=UTF-8''${encodeURIComponent('教师账号导入模板.xlsx')}`
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.send(Buffer.from(buf));
  } catch (e) {
    res.status(500).json({ success: false, message: '模板生成失败', error: e.message });
  }
}

async function importPreview(req, res) {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ success: false, message: '请上传 Excel 文件' });
    }
    const savedPath = await teacherImportService.saveUploadFile(
      req.file.buffer,
      req.file.originalname
    );
    const data = await teacherImportService.previewImport({
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      uploadedBy: req.user.id,
      savedPath,
    });
    res.json({ success: true, data });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message || '预检失败' });
  }
}

async function importConfirm(req, res) {
  try {
    const batchId = Number(req.params.batchId);
    if (!Number.isFinite(batchId)) {
      return res.status(400).json({ success: false, message: '无效批次 ID' });
    }
    const data = await teacherImportService.confirmImport(batchId, req.user.id);
    res.json({ success: true, data });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, message: e.message || '导入失败' });
  }
}

async function listImportBatches(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize, 10) || 10));
    const status = req.query.status ? String(req.query.status).trim() : '';
    const result = await teacherImportService.listBatches({ page, pageSize, status: status || undefined });
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ success: false, message: '查询失败', error: e.message });
  }
}

async function getImportBatchDetail(req, res) {
  try {
    const batchId = Number(req.params.batchId);
    const detail = await teacherImportService.getBatchDetail(batchId);
    if (!detail) {
      return res.status(404).json({ success: false, message: '导入批次不存在' });
    }
    res.json({ success: true, data: detail });
  } catch (e) {
    res.status(500).json({ success: false, message: '查询失败', error: e.message });
  }
}

async function downloadImportResult(req, res) {
  try {
    const batchId = Number(req.params.batchId);
    const buf = await teacherImportService.buildResultExcelBuffer(batchId);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="teacher-import-result-${batchId}.xlsx"`
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.send(Buffer.from(buf));
  } catch (e) {
    res.status(e.status || 500).json({ success: false, message: e.message || '下载失败' });
  }
}

async function getSummary(_req, res) {
  try {
    const data = await teacherImportService.getTeacherSummary();
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: '统计失败', error: e.message });
  }
}

module.exports = {
  downloadTemplate,
  importPreview,
  importConfirm,
  listImportBatches,
  getImportBatchDetail,
  downloadImportResult,
  getSummary,
};
