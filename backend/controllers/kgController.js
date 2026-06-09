const pool = require('../config/database');
const { createBuildJob } = require('../services/kgBuildService');
const { enqueueBuild } = require('../utils/kgBuildQueue');
const kgQuery = require('../services/kgQueryService');
const kgGraphStore = require('../services/kgGraphStore');
const { reconcile } = require('../services/kgReconcileService');
const { teacherOwnsTaskForGrading, teacherOwnsSubmissionTask, teacherCanViewStudent, teacherCanAccessKgScope } = require('../utils/accessControl');

function normalizeBuildScopeType(scopeType) {
  const t = String(scopeType || '').trim();
  if (t === 'administrative_class') return 'class';
  return t;
}

const getSyncStatus = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM kg_sync_state WHERE id = 1 LIMIT 1');
    const counts = await kgGraphStore.countStore();
    res.json({
      success: true,
      data: {
        ...(rows[0] || {}),
        mariaCounts: counts,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: '获取同步状态失败', error: e.message });
  }
};

const postBuild = async (req, res) => {
  try {
    const scopeTypeRaw = String(req.body.scopeType || 'full').trim();
    const scopeId = req.body.scopeId != null ? String(req.body.scopeId) : null;
    const scopeType = normalizeBuildScopeType(scopeTypeRaw);
    const allowed = ['course', 'class', 'teaching_class', 'student', 'full'];
    if (!allowed.includes(scopeType)) {
      return res.status(400).json({ success: false, message: 'scopeType 无效' });
    }

    if (req.user.role === 'teacher' && scopeType !== 'full' && scopeType !== 'course') {
      const checkType = scopeTypeRaw === 'administrative_class' ? 'administrative_class' : scopeType;
      const ok = await teacherCanAccessKgScope(req.user.id, checkType, scopeId);
      if (!ok) {
        return res.status(403).json({ success: false, message: '无权构建该班级范围图谱' });
      }
    }
    if (scopeType === 'student' && req.user.role === 'student' && Number(scopeId) !== Number(req.user.id)) {
      return res.status(403).json({ success: false, message: '仅可构建个人学情图谱' });
    }

    const jobId = await createBuildJob({
      scopeType,
      scopeId,
      requestedBy: req.user.id,
    });
    enqueueBuild(jobId);
    res.status(202).json({
      success: true,
      message: '图谱构建任务已排队（异步执行，不阻塞批改）',
      data: { jobId },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: '创建构建任务失败', error: e.message });
  }
};

const getBuildJob = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM kg_build_jobs WHERE id = ?', [req.params.jobId]);
    if (!rows.length) {
      return res.status(404).json({ success: false, message: '任务不存在' });
    }
    res.json({ success: true, data: rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: '查询失败', error: e.message });
  }
};

const getCourseGraph = async (req, res) => {
  try {
    const taskId = req.query.taskId;
    const classId = req.query.classId;
    if (!taskId && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: '仅管理员可查看全平台课程知识体系总览' });
    }
    if (req.user.role === 'teacher' && taskId) {
      const task = await teacherOwnsTaskForGrading(req.user.id, taskId);
      if (!task) return res.status(403).json({ success: false, message: '无权查看' });
    }
    const data = await kgQuery.getCourseGraph({ taskId, classId });
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: '获取课程图谱失败', error: e.message });
  }
};

const getClassGraph = async (req, res) => {
  try {
    const classId = req.params.classId;
    if (req.user.role === 'teacher') {
      const ok = await teacherCanAccessKgScope(req.user.id, 'administrative_class', classId);
      if (!ok) {
        return res.status(403).json({ success: false, message: '无权查看该班级图谱' });
      }
    }
    const data = await kgQuery.getClassGraph(classId);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: '获取班级图谱失败', error: e.message });
  }
};

const getTeacherScopes = async (req, res) => {
  try {
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ success: false, message: '仅教师可查看班级范围' });
    }
    const data = await kgQuery.getTeacherKgScopes(req.user.id);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: '获取教师图谱范围失败', error: e.message });
  }
};

const getTeacherGraph = async (req, res) => {
  try {
    const scopeType = req.query.scopeType || (req.query.classId ? 'administrative_class' : null);
    const scopeId = req.query.scopeId || req.query.classId;
    if (!scopeType || !scopeId) {
      return res.status(400).json({ success: false, message: '缺少 scopeType 或 scopeId' });
    }
    if (req.user.role === 'teacher') {
      const ok = await teacherCanAccessKgScope(req.user.id, scopeType, scopeId);
      if (!ok) {
        return res.status(403).json({ success: false, message: '无权查看该班级图谱' });
      }
    } else if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: '无权查看' });
    }
    const data = await kgQuery.getTeacherGraph({ scopeType, scopeId });
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: '获取教师班级图谱失败', error: e.message });
  }
};

const getStudentGraph = async (req, res) => {
  try {
    const studentId = req.params.studentId;
    if (req.user.role === 'student' && Number(studentId) !== Number(req.user.id)) {
      return res.status(403).json({ success: false, message: '无权查看他人学情图谱' });
    }
    if (req.user.role === 'teacher') {
      const ok = await teacherCanViewStudent(req.user.id, studentId);
      if (!ok) return res.status(403).json({ success: false, message: '无权查看该学生学情图谱' });
    }
    const data = await kgQuery.getStudentGraph(studentId);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: '获取学情图谱失败', error: e.message });
  }
};

const getGradingContext = async (req, res) => {
  try {
    const submissionId = req.params.submissionId;
    if (req.user.role === 'teacher') {
      const ok = await teacherOwnsSubmissionTask(req.user.id, submissionId);
      if (!ok) return res.status(403).json({ success: false, message: '无权查看' });
    } else if (req.user.role === 'student') {
      const [s] = await pool.query('SELECT student_id FROM submissions WHERE id = ?', [submissionId]);
      if (!s.length || Number(s[0].student_id) !== Number(req.user.id)) {
        return res.status(403).json({ success: false, message: '无权查看' });
      }
    }
    const data = await kgQuery.getGradingContext(submissionId);
    if (!data) return res.status(404).json({ success: false, message: '提交不存在' });
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: '获取图谱增强失败', error: e.message });
  }
};

const postReconcile = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: '仅管理员可触发全量校验' });
    }
    const result = await reconcile();
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(500).json({ success: false, message: '校验失败', error: e.message });
  }
};

module.exports = {
  getSyncStatus,
  postBuild,
  getBuildJob,
  getCourseGraph,
  getClassGraph,
  getTeacherScopes,
  getTeacherGraph,
  getStudentGraph,
  getGradingContext,
  postReconcile,
};
