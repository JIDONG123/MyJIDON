/**
 * Socket.IO 服务端推送：与业务解耦，仅发轻量 payload，前端收到后自行调接口刷新。
 * 房间隔离：学生 class:{id}:s、教师 class:{id}:t、企业 class:{id}:e、管理员 role:admin、个人 user:{id}、任务 task:{id}
 * AI 批改任务进度：domain=grading_job → user:{teacherId} + role:admin
 */

let ioRef = null;

function setIO(io) {
  ioRef = io;
}

function getIO() {
  return ioRef;
}

function getCrossProcessEmitter() {
  try {
    return require('./socketIoEmitter').getSocketIoEmitter();
  } catch {
    return null;
  }
}

function emitRooms(rooms, payload) {
  if (!rooms || !rooms.length) return;
  const seen = new Set();
  const uniqueRooms = [];
  for (const r of rooms) {
    if (!r || seen.has(r)) continue;
    seen.add(r);
    uniqueRooms.push(r);
  }
  if (!uniqueRooms.length) return;

  const emitOne = (target) => {
    for (const r of uniqueRooms) {
      target.to(r).emit('rt', payload);
    }
  };

  if (ioRef) {
    try {
      emitOne(ioRef);
      return;
    } catch (e) {
      console.warn('[realtimeEmit]', e && e.message ? e.message : e);
    }
  }

  const emitter = getCrossProcessEmitter();
  if (emitter) {
    try {
      emitOne(emitter);
    } catch (e) {
      console.warn('[realtimeEmit][emitter]', e && e.message ? e.message : e);
    }
  }
}

function num(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** 班级内学生 + 教师侧 + 企业侧 + 管理员（任务列表、规则同步等） */
function emitClassWide(classId, payload) {
  const cid = num(classId);
  if (cid == null) {
    emitRooms(['role:admin'], payload);
    return;
  }
  emitRooms(
    [`class:${cid}:s`, `class:${cid}:t`, `class:${cid}:e`, 'role:admin'],
    payload
  );
}

/** 仅教师 / 企业 / 管理员（提交列表、批改工作台、查重等） */
function emitClassStaff(classId, payload) {
  const cid = num(classId);
  if (cid == null) {
    emitRooms(['role:admin'], payload);
    return;
  }
  emitRooms([`class:${cid}:t`, `class:${cid}:e`, 'role:admin'], payload);
}

function emitTaskRoom(taskId, payload) {
  const tid = num(taskId);
  if (tid == null) return;
  emitRooms([`task:${tid}`], payload);
}

function emitUser(userId, payload) {
  const uid = num(userId);
  if (uid == null) return;
  emitRooms([`user:${uid}`], payload);
}

function emitTasksMutate(classId, taskId, action, extra = {}) {
  const payload = {
    domain: 'tasks',
    action: action || 'mutate',
    classId: num(classId),
    taskId: num(taskId),
    ts: Date.now(),
    ...extra,
  };
  emitClassWide(classId, payload);
  if (taskId != null) emitTaskRoom(taskId, payload);
}

/** 任务模板/全局任务配置：门户级房间 + 管理员 */
function emitTaskTemplatesMutate(extra = {}) {
  const payload = {
    domain: 'task_templates',
    action: 'mutate',
    ts: Date.now(),
    ...extra,
  };
  emitRooms(
    ['role:admin', 'portal:teacher', 'portal:student', 'portal:enterprise'],
    payload
  );
}

function emitSubmissionsStaff(classId, taskId, studentId, submissionId, action, extra = {}) {
  const payload = {
    domain: 'submissions',
    action: action || 'mutate',
    classId: num(classId),
    taskId: num(taskId),
    studentId: num(studentId),
    submissionId: num(submissionId),
    ts: Date.now(),
    ...extra,
  };
  emitClassStaff(classId, payload);
  if (taskId != null) emitTaskRoom(taskId, payload);
}

function emitSubmissionStudent(studentId, action, extra = {}) {
  emitUser(studentId, {
    domain: 'submission_student',
    action: action || 'feedback',
    ts: Date.now(),
    ...extra,
  });
}

function emitGradingProgress(meta = {}) {
  const payload = {
    domain: 'grading',
    action: meta.action || 'progress',
    ts: Date.now(),
    ...meta,
  };
  const cid = num(meta.classId);
  const tid = num(meta.taskId);
  const sid = num(meta.studentId);
  if (sid != null) emitUser(sid, payload);
  if (cid != null) {
    emitClassStaff(cid, payload);
    if (tid != null) emitTaskRoom(tid, payload);
  }
}

/** AI 批改任务进度：推送到发起教师 user:{id}，管理员 role:admin 同步接收 */
function emitGradingJobProgress(meta = {}) {
  const payload = {
    domain: 'grading_job',
    action: meta.action || 'progress',
    ts: Date.now(),
    jobId: num(meta.jobId),
    status: meta.status || null,
    scopeType: meta.scopeType || null,
    taskId: num(meta.taskId),
    taskTitle: meta.taskTitle || null,
    totalCount: meta.totalCount ?? 0,
    finishedCount: meta.finishedCount ?? 0,
    successCount: meta.successCount ?? 0,
    failedCount: meta.failedCount ?? 0,
    progress: meta.progress ?? 0,
    message: meta.message || null,
    submissionId: num(meta.submissionId),
    legacyBatchId: meta.legacyBatchId || null,
    notifyType: meta.notifyType || null,
  };
  const teacherId = num(meta.teacherId);
  const rooms = [];
  if (teacherId != null) rooms.push(`user:${teacherId}`);
  rooms.push('role:admin');
  emitRooms(rooms, payload);
}

function emitSimilarity(classId, taskId, extra = {}) {
  emitClassStaff(classId, {
    domain: 'similarity',
    action: 'update',
    classId: num(classId),
    taskId: num(taskId),
    ts: Date.now(),
    ...extra,
  });
  if (taskId != null) emitTaskRoom(taskId, { domain: 'similarity', action: 'update', taskId: num(taskId), ts: Date.now(), ...extra });
}

function emitQb(domain, classId, extra = {}) {
  const payload = {
    domain,
    action: 'mutate',
    classId: num(classId),
    ts: Date.now(),
    ...extra,
  };
  if (classId != null) {
    emitClassWide(classId, payload);
  } else {
    emitRooms(['role:admin', 'portal:teacher', 'portal:student', 'portal:enterprise'], payload);
  }
}

function emitScores(extra = {}) {
  const payload = { domain: 'scores', action: 'mutate', ts: Date.now(), ...extra };
  if (extra.classId != null) emitClassWide(extra.classId, payload);
  else emitRooms(['role:admin'], payload);
  if (extra.userId != null) emitUser(extra.userId, payload);
}

function emitClassesMutate(extra = {}) {
  const payload = { domain: 'classes', action: 'mutate', ts: Date.now(), ...extra };
  emitRooms(['role:admin'], payload);
  if (extra.classId != null) emitClassWide(extra.classId, payload);
}

function emitUsersMutate(targetUserId, extra = {}) {
  emitRooms(['role:admin'], { domain: 'users', action: 'mutate', ts: Date.now(), ...extra });
  if (targetUserId != null) emitUser(targetUserId, { domain: 'users', action: 'self', userId: num(targetUserId), ts: Date.now(), ...extra });
}

function emitAnnouncements(classId, extra = {}) {
  emitClassWide(classId, {
    domain: 'announcements',
    action: 'mutate',
    classId: num(classId),
    ts: Date.now(),
    ...extra,
  });
}

function emitNotificationsUser(userId, extra = {}) {
  emitUser(userId, { domain: 'notifications', action: 'refresh', ts: Date.now(), ...extra });
}

function emitSystemSettings(extra = {}) {
  const payload = { domain: 'system_settings', action: 'mutate', ts: Date.now(), ...extra };
  emitRooms(
    ['role:admin', 'portal:teacher', 'portal:student', 'portal:enterprise'],
    payload
  );
}

function emitExam(classId, examId, action, extra = {}) {
  const payload = {
    domain: 'qb_exams',
    action: action || 'mutate',
    classId: num(classId),
    examId: num(examId),
    ts: Date.now(),
    ...extra,
  };
  if (classId != null) emitClassWide(classId, payload);
  else emitRooms(['role:admin'], payload);
}

function emitPractice(classId, practiceId, action, extra = {}) {
  const payload = {
    domain: 'qb_practices',
    action: action || 'mutate',
    classId: num(classId),
    practiceId: num(practiceId),
    ts: Date.now(),
    ...extra,
  };
  if (classId != null) emitClassWide(classId, payload);
  else emitRooms(['role:admin'], payload);
}

/** 教学班题库/考试推送：tc:{id}:s / tc:{id}:t 房间（见 socketServer 入房） */
function emitTeachingClassQb(teachingClassId, payload) {
  const tcId = num(teachingClassId);
  if (tcId == null) {
    emitRooms(['role:admin'], payload);
    return;
  }
  emitRooms([`tc:${tcId}:s`, `tc:${tcId}:t`, 'role:admin'], payload);
}

/** 教学班题库/考试/练习变更：推送到 tc 房间 + 管理员 */
function emitTeachingClassQb(teachingClassId, payload) {
  const tcid = num(teachingClassId);
  if (tcid == null) {
    emitRooms(['role:admin'], payload);
    return;
  }
  emitRooms([`tc:${tcid}:s`, `tc:${tcid}:t`, 'role:admin'], {
    teachingClassId: tcid,
    ts: Date.now(),
    ...payload,
  });
}

function emitQuestions(extra = {}) {
  emitRooms(['role:admin'], { domain: 'qb_questions', action: 'mutate', ts: Date.now(), ...extra });
}

module.exports = {
  setIO,
  getIO,
  emitRooms,
  emitClassWide,
  emitClassStaff,
  emitTaskRoom,
  emitUser,
  emitTasksMutate,
  emitTaskTemplatesMutate,
  emitSubmissionsStaff,
  emitSubmissionStudent,
  emitGradingProgress,
  emitGradingJobProgress,
  emitSimilarity,
  emitQb,
  emitScores,
  emitClassesMutate,
  emitUsersMutate,
  emitAnnouncements,
  emitNotificationsUser,
  emitSystemSettings,
  emitExam,
  emitPractice,
  emitTeachingClassQb,
  emitQuestions,
};
