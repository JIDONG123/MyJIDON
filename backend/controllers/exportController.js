const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const pool = require('../config/database');
const {
  teacherIsTaskCreator,
  getTaskRow,
} = require('../utils/accessControl');
const { formatDateTime, safeFileName, emptyDash } = require('../utils/exportFormatters');
const { writeWorkbookBuffer } = require('../utils/excelExportHelper');
const {
  resolveTaskExportLabel,
  buildTaskScoresWorkbook,
  exportAccountLabel,
  fetchTaskRosterRows,
} = require('../utils/taskScoresExport');
const { recordExportLog } = require('../services/exportLogService');

function toNumberOrNull(v) {
  if (v == null) return null;
  if (typeof v === 'bigint') return Number(v);
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function assertExportPermission(user, opts) {
  const classId = toNumberOrNull(opts.classId);
  const teachingClassId = toNumberOrNull(opts.teachingClassId);
  const taskId = toNumberOrNull(opts.taskId);
  const task = await getTaskRow(taskId);
  if (!task) return { ok: false, status: 404, message: '任务不存在' };

  const isTeachingTask = task.teaching_class_id != null;
  if (isTeachingTask) {
    if (teachingClassId == null || Number(task.teaching_class_id) !== Number(teachingClassId)) {
      return { ok: false, status: 400, message: '任务与教学班不匹配' };
    }
  } else if (classId == null || Number(task.class_id) !== Number(classId)) {
    return { ok: false, status: 400, message: '任务与班级不匹配' };
  }

  if (user.role === 'admin') {
    return { ok: true, task, teachingClassId: task.teaching_class_id, classId: task.class_id };
  }
  if (user.role !== 'teacher') {
    return { ok: false, status: 403, message: '无权导出' };
  }
  if (!teacherIsTaskCreator(user.id, task)) {
    return { ok: false, status: 403, message: '无权导出该任务数据（仅任务创建者可导出）' };
  }
  return { ok: true, task, teachingClassId: task.teaching_class_id, classId: task.class_id };
}

const exportScoresExcel = async (req, res) => {
  try {
    const classId = toNumberOrNull(req.query.classId);
    const teachingClassId = toNumberOrNull(req.query.teachingClassId || req.query.teaching_class_id);
    const taskId = toNumberOrNull(req.query.taskId);
    if (taskId == null || (classId == null && teachingClassId == null)) {
      return res.status(400).json({
        success: false,
        message: '请指定 taskId，以及 classId（行政班）或 teachingClassId（教学班）',
      });
    }

    const perm = await assertExportPermission(req.user, { classId, teachingClassId, taskId });
    if (!perm.ok) {
      return res.status(perm.status).json({ success: false, message: perm.message });
    }

    const isTeaching = teachingClassId != null;
    const audienceId = isTeaching ? teachingClassId : classId;
    const rows = await fetchTaskRosterRows(taskId, isTeaching, audienceId);

    const exportTime = formatDateTime(new Date());
    const scopeLabel = await resolveTaskExportLabel(perm.task, isTeaching, audienceId);
    const meta = {
      scopeLabel,
      exportTime,
      exportAccount: exportAccountLabel(req.user),
      taskTitle: perm.task.title || emptyDash(null),
      detailTitle: '龙芯智训 · 任务成绩统计表',
      summaryTitle: '任务成绩统计摘要',
    };

    const { workbook } = buildTaskScoresWorkbook(rows, meta);
    const buf = await writeWorkbookBuffer(workbook);

    const scopeLabelFile = isTeaching ? `tc-${teachingClassId}` : `class-${classId}`;
    const fname = `${scopeLabelFile}-task-${taskId}-scores.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(safeFileName(fname))}`
    );
    res.send(buf);

    recordExportLog({
      userId: req.user.id,
      exportType: 'task_scores_excel',
      format: 'xlsx',
      scopeLabel,
      taskId,
      scopeType: isTeaching ? 'teaching_class' : 'legacy_class',
      scopeId: audienceId,
      fileName: fname,
      rowCount: rows.length,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '导出失败', error: error.message });
  }
};

function studentFolderName(sub) {
  const prefix = sub.student_no ? String(sub.student_no) : String(sub.id);
  const name = String(sub.real_name || sub.username || 'student')
    .replace(/[/\\?%*:|"<>]/g, '_')
    .trim();
  return `${prefix}_${name}`;
}

function buildZipReadme({ taskTitle, scopeLabel, exportTime, exportAccount, fileCount }) {
  return [
    '龙芯智训 · 作业附件打包说明',
    '================================',
    '',
    `任务名称：${taskTitle || '—'}`,
    `导出范围：${scopeLabel || '—'}`,
    `导出时间：${exportTime || '—'}`,
    `导出账号：${exportAccount || '—'}`,
    `有效附件数：${fileCount}`,
    '',
    '目录说明：',
    '  · README.txt — 本说明文件',
    '  · 任务成绩统计.xlsx — 本任务成绩汇总（含未提交学生）',
    '  · 学号_姓名/ — 各学生提交附件',
    '',
    '注：仅打包已成功上传且服务器文件仍存在的附件。',
  ].join('\n');
}

async function appendTaskScoresExcel(archive, task, isTeaching, audienceId, user) {
  try {
    const rows = await fetchTaskRosterRows(task.id, isTeaching, audienceId);
    const exportTime = formatDateTime(new Date());
    const scopeLabel = await resolveTaskExportLabel(task, isTeaching, audienceId);
    const meta = {
      scopeLabel,
      exportTime,
      exportAccount: exportAccountLabel(user),
      taskTitle: task.title || emptyDash(null),
      detailTitle: '龙芯智训 · 任务成绩统计表',
      summaryTitle: '任务成绩统计摘要',
    };
    const { workbook } = buildTaskScoresWorkbook(rows, meta);
    const buf = await writeWorkbookBuffer(workbook);
    archive.append(buf, { name: '任务成绩统计.xlsx' });
  } catch (err) {
    archive.append(`成绩表生成失败：${err.message}\n`, { name: '任务成绩统计_生成失败.txt' });
  }
}

const exportSubmissionsZip = async (req, res) => {
  try {
    const classId = toNumberOrNull(req.query.classId);
    const teachingClassId = toNumberOrNull(req.query.teachingClassId || req.query.teaching_class_id);
    const taskId = toNumberOrNull(req.query.taskId);
    if (taskId == null || (classId == null && teachingClassId == null)) {
      return res.status(400).json({
        success: false,
        message: '请指定 taskId，以及 classId 或 teachingClassId',
      });
    }

    const perm = await assertExportPermission(req.user, { classId, teachingClassId, taskId });
    if (!perm.ok) {
      return res.status(perm.status).json({ success: false, message: perm.message });
    }

    const isTeaching = teachingClassId != null;
    const audienceId = isTeaching ? teachingClassId : classId;

    let subsSql;
    let subsParams;
    if (isTeaching) {
      subsSql = `
        SELECT s.id, s.file_path, s.file_name, u.real_name, u.student_no, u.username
        FROM submissions s
        JOIN users u ON u.id = s.student_id
        JOIN teaching_class_students tcs ON tcs.student_id = u.id AND tcs.teaching_class_id = ?
        WHERE s.task_id = ? AND u.role = 'student'
        ORDER BY u.student_no, u.real_name
      `;
      subsParams = [teachingClassId, taskId];
    } else {
      subsSql = `
        SELECT s.id, s.file_path, s.file_name, u.real_name, u.student_no, u.username
        FROM submissions s
        JOIN users u ON u.id = s.student_id
        WHERE s.task_id = ? AND u.class_id = ? AND u.role = 'student'
        ORDER BY u.student_no, u.real_name
      `;
      subsParams = [taskId, classId];
    }

    const [subs] = await pool.query(subsSql, subsParams);

    const archive = archiver('zip', { zlib: { level: 6 } });
    const scopeLabelFile = isTeaching ? `tc-${teachingClassId}` : `class-${classId}`;
    const fname = `${scopeLabelFile}-task-${taskId}-submissions.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fname)}"`);

    archive.on('error', (err) => {
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: err.message });
      }
    });

    archive.pipe(res);

    const exportTime = formatDateTime(new Date());
    const scopeLabel = await resolveTaskExportLabel(perm.task, isTeaching, audienceId);
    const exportAccount = exportAccountLabel(req.user);

    let added = 0;
    for (const s of subs) {
      if (!s.file_path) continue;
      const abs = path.isAbsolute(s.file_path) ? s.file_path : path.join(__dirname, '..', s.file_path);
      if (!fs.existsSync(abs)) continue;
      const folder = studentFolderName(s);
      const safeName = (s.file_name || path.basename(abs)).replace(/[/\\?%*:|"<>]/g, '_');
      const entryName = `${folder}/${safeName}`;
      archive.file(abs, { name: entryName });
      added += 1;
    }

    await appendTaskScoresExcel(archive, perm.task, isTeaching, audienceId, req.user);

    archive.append(
      buildZipReadme({
        taskTitle: perm.task.title,
        scopeLabel,
        exportTime,
        exportAccount,
        fileCount: added,
      }),
      { name: 'README.txt' }
    );

    if (added === 0) {
      archive.append('本任务暂无可用附件（学生未上传文件或文件已缺失）。\n', {
        name: '附件说明.txt',
      });
    }

    await archive.finalize();

    recordExportLog({
      userId: req.user.id,
      exportType: 'task_submissions_zip',
      format: 'zip',
      scopeLabel,
      taskId,
      scopeType: isTeaching ? 'teaching_class' : 'legacy_class',
      scopeId: audienceId,
      fileName: fname,
      rowCount: added,
    });
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: '打包失败', error: error.message });
    }
  }
};

module.exports = {
  exportScoresExcel,
  exportSubmissionsZip,
};
