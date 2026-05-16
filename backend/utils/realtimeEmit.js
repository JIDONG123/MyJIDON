/**
 * Socket.IO 服务端推送：与业务解耦，仅发轻量 payload，前端收到后自行调接口刷新。
 * 房间隔离：学生 class:{id}:s、教师 class:{id}:t、企业 class:{id}:e、管理员 role:admin、个人 user:{id}、任务 task:{id}
 */

let ioRef = null;

function setIO(io) {
  ioRef = io;
}

function getIO() {
  return ioRef;
}

function emitRooms(rooms, payload) {
  if (!ioRef || !rooms || !rooms.length) return;
  const seen = new Set();
  try {
    for (const r of rooms) {
      if (!r || seen.has(r)) continue;
      seen.add(r);
      ioRef.to(r).emit('rt', payload);
    }
  } catch (e) {
    console.warn('[realtimeEmit]', e && e.message ? e.message : e);
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
  emitQuestions,
};
