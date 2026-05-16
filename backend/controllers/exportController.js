const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const XLSX = require('xlsx');
const pool = require('../config/database');
const { teacherManagesClass, getTaskRow } = require('../utils/accessControl');

function toNumberOrNull(v) {
  if (v == null) return null;
  if (typeof v === 'bigint') return Number(v);
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function gradeStatusLabel(row) {
  const hasSub = row.submission_id != null;
  if (!hasSub) return '未提交';
  const st = row.status;
  if (!st || st === 'pending') return '待批改';
  if (st === 'ai_graded') return 'AI已批改';
  if (st === 'human_graded') return '教师已复核';
  return String(st);
}

function displayScore(row) {
  if (row.final_score != null && row.final_score !== '') return Number(row.final_score);
  if (row.total_score != null && row.total_score !== '') return Number(row.total_score);
  return '';
}

async function assertExportPermission(user, classId, taskId) {
  const task = await getTaskRow(taskId);
  if (!task) return { ok: false, status: 404, message: '任务不存在' };
  if (Number(task.class_id) !== Number(classId)) {
    return { ok: false, status: 400, message: '任务与班级不匹配' };
  }
  if (user.role === 'admin') {
    return { ok: true, task };
  }
  if (user.role !== 'teacher') {
    return { ok: false, status: 403, message: '无权导出' };
  }
  if (Number(task.created_by) !== Number(user.id)) {
    return { ok: false, status: 403, message: '只能导出本人发布的任务数据' };
  }
  const manages = await teacherManagesClass(user.id, classId);
  if (!manages) {
    return { ok: false, status: 403, message: '无权导出该班级数据' };
  }
  return { ok: true, task };
}

const exportScoresExcel = async (req, res) => {
  try {
    const classId = toNumberOrNull(req.query.classId);
    const taskId = toNumberOrNull(req.query.taskId);
    if (classId == null || taskId == null) {
      return res.status(400).json({ success: false, message: '请指定 classId 与 taskId' });
    }

    const perm = await assertExportPermission(req.user, classId, taskId);
    if (!perm.ok) {
      return res.status(perm.status).json({ success: false, message: perm.message });
    }

    const [rows] = await pool.query(
      `
      SELECT u.real_name, u.student_no, u.username,
             s.id AS submission_id, s.submitted_at,
             gr.status, gr.final_score, gr.total_score
      FROM users u
      LEFT JOIN submissions s ON s.student_id = u.id AND s.task_id = ?
      LEFT JOIN grading_results gr ON gr.submission_id = s.id
      WHERE u.class_id = ? AND u.role = 'student'
      ORDER BY u.student_no, u.username
    `,
      [taskId, classId]
    );

    const sheetRows = rows.map((r) => ({
      姓名: r.real_name || '',
      学号: r.student_no != null && r.student_no !== '' ? String(r.student_no) : '',
      分数: displayScore(r),
      提交时间: r.submitted_at ? String(r.submitted_at).replace('T', ' ').slice(0, 19) : '',
      批改状态: gradeStatusLabel(r),
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sheetRows);
    XLSX.utils.book_append_sheet(wb, ws, '成绩统计');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const fname = `class-${classId}-task-${taskId}-scores.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fname)}"`);
    res.send(buf);
  } catch (error) {
    res.status(500).json({ success: false, message: '导出失败', error: error.message });
  }
};

const exportSubmissionsZip = async (req, res) => {
  try {
    const classId = toNumberOrNull(req.query.classId);
    const taskId = toNumberOrNull(req.query.taskId);
    if (classId == null || taskId == null) {
      return res.status(400).json({ success: false, message: '请指定 classId 与 taskId' });
    }

    const perm = await assertExportPermission(req.user, classId, taskId);
    if (!perm.ok) {
      return res.status(perm.status).json({ success: false, message: perm.message });
    }

    const [subs] = await pool.query(
      `
      SELECT s.id, s.file_path, s.file_name, u.real_name, u.student_no, u.username
      FROM submissions s
      JOIN users u ON u.id = s.student_id
      WHERE s.task_id = ? AND u.class_id = ? AND u.role = 'student'
    `,
      [taskId, classId]
    );

    const archive = archiver('zip', { zlib: { level: 6 } });
    const fname = `class-${classId}-task-${taskId}-submissions.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fname)}"`);

    archive.on('error', (err) => {
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: err.message });
      }
    });

    archive.pipe(res);

    let added = 0;
    for (const s of subs) {
      if (!s.file_path) continue;
      const abs = path.isAbsolute(s.file_path) ? s.file_path : path.join(__dirname, '..', s.file_path);
      if (!fs.existsSync(abs)) continue;
      const prefix = s.student_no ? String(s.student_no) : String(s.id);
      const safeName = (s.file_name || path.basename(abs)).replace(/[/\\?%*:|"<>]/g, '_');
      const entryName = `${prefix}_${s.real_name || s.username || 'student'}_${safeName}`;
      archive.file(abs, { name: entryName });
      added += 1;
    }

    if (added === 0) {
      archive.append('本任务暂无可用附件（学生未上传文件或文件已缺失）。\n', { name: 'readme.txt' });
    }

    await archive.finalize();
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
