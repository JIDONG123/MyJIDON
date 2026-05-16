/**
 * 考试实时：房间 exam:{classId}:{examId}:take | :monitor
 * - exam_tick：服务端每秒广播 serverNowMs + examEndMs（场次统一结束时间）
 * - exam_monitor_tab：教师监考房，由 tabEvent REST 成功后调用 emitExamMonitorTab
 */
const pool = require('../config/database');
const { getIO } = require('../utils/realtimeEmit');

function examRooms(classId, examId) {
  return {
    take: `exam:${classId}:${examId}:take`,
    monitor: `exam:${classId}:${examId}:monitor`,
  };
}

/** @type {Map<string, { take: number, monitor: number, examEndMs: number, timer: ReturnType<typeof setInterval> | null }>} */
const liveByKey = new Map();

function liveKey(classId, examId) {
  return `${Number(classId)}:${Number(examId)}`;
}

async function loadExamEndMs(classId, examId) {
  const [rows] = await pool.query(
    `SELECT UNIX_TIMESTAMP(e.end_at) * 1000 AS end_ms
     FROM qb_exams e
     WHERE e.id = ? AND e.class_id = ? AND e.status = 'published' LIMIT 1`,
    [examId, classId]
  );
  if (!rows.length) return null;
  const v = Number(rows[0].end_ms);
  return Number.isFinite(v) ? v : null;
}

async function assertStudentExam(classId, examId, studentId) {
  const [rows] = await pool.query(
    `SELECT 1 FROM qb_exams e
     INNER JOIN qb_exam_attempts a ON a.exam_id = e.id AND a.student_id = ? AND a.submitted_at IS NULL
     WHERE e.id = ? AND e.class_id = ? AND e.status = 'published' LIMIT 1`,
    [studentId, examId, classId]
  );
  return rows.length > 0;
}

async function assertTeacherExam(classId, examId, teacherId) {
  const [rows] = await pool.query(
    `SELECT 1 FROM qb_exams e
     INNER JOIN classes c ON c.id = e.class_id AND c.teacher_id = ?
     WHERE e.id = ? AND e.class_id = ? AND e.status = 'published' LIMIT 1`,
    [teacherId, examId, classId]
  );
  return rows.length > 0;
}

function broadcastTick(io, classId, examId) {
  const key = liveKey(classId, examId);
  const st = liveByKey.get(key);
  if (!st) return;
  const now = Date.now();
  const payload = { serverNowMs: now, examEndMs: st.examEndMs };
  const { take, monitor } = examRooms(classId, examId);
  io.to(take).emit('exam_tick', payload);
  io.to(monitor).emit('exam_tick', payload);
}

function ensureTimer(io, classId, examId) {
  const key = liveKey(classId, examId);
  const st = liveByKey.get(key);
  if (!st || st.timer) return;
  if ((st.take || 0) + (st.monitor || 0) <= 0) return;
  st.timer = setInterval(() => broadcastTick(io, classId, examId), 1000);
}

function stopTimerIfEmpty(key) {
  const st = liveByKey.get(key);
  if (!st) return;
  if ((st.take || 0) + (st.monitor || 0) > 0) return;
  if (st.timer) {
    clearInterval(st.timer);
    st.timer = null;
  }
  liveByKey.delete(key);
}

function leaveExamLiveSocket(socket, io) {
  const j = socket.data._examLive;
  if (!j) return;
  const key = liveKey(j.classId, j.examId);
  const st = liveByKey.get(key);
  if (st) {
    if (j.mode === 'take') st.take = Math.max(0, (st.take || 0) - 1);
    else st.monitor = Math.max(0, (st.monitor || 0) - 1);
    stopTimerIfEmpty(key);
  }
  const { take, monitor } = examRooms(j.classId, j.examId);
  try {
    socket.leave(take);
    socket.leave(monitor);
  } catch {
    /* ignore */
  }
  delete socket.data._examLive;
}

/**
 * @param {import('socket.io').Socket} socket
 * @param {import('socket.io').Server} io
 */
function attachExamLiveSocket(socket, io) {
  socket.on('join_exam_live', async (payload, cb) => {
    try {
      leaveExamLiveSocket(socket, io);
      const mode = payload?.mode === 'monitor' ? 'monitor' : 'take';
      const examId = Number(payload?.examId);
      let classId = Number(payload?.classId);
      const uid = socket.data.userId;
      const role = socket.data.role;

      if (!Number.isFinite(examId) || examId <= 0) {
        if (typeof cb === 'function') cb({ ok: false, message: 'bad exam' });
        return;
      }

      if (mode === 'take') {
        if (role !== 'student') {
          if (typeof cb === 'function') cb({ ok: false, message: 'forbidden' });
          return;
        }
        classId = Number(socket.data.classId);
        if (!Number.isFinite(classId) || classId <= 0) {
          if (typeof cb === 'function') cb({ ok: false, message: 'no class' });
          return;
        }
        const ok = await assertStudentExam(classId, examId, uid);
        if (!ok) {
          if (typeof cb === 'function') cb({ ok: false, message: 'forbidden' });
          return;
        }
      } else {
        if (role !== 'teacher') {
          if (typeof cb === 'function') cb({ ok: false, message: 'forbidden' });
          return;
        }
        if (!Number.isFinite(classId) || classId <= 0) {
          if (typeof cb === 'function') cb({ ok: false, message: 'bad class' });
          return;
        }
        const ok = await assertTeacherExam(classId, examId, uid);
        if (!ok) {
          if (typeof cb === 'function') cb({ ok: false, message: 'forbidden' });
          return;
        }
      }

      const key = liveKey(classId, examId);
      let st = liveByKey.get(key);
      const endMs = st ? st.examEndMs : await loadExamEndMs(classId, examId);
      if (endMs == null) {
        if (typeof cb === 'function') cb({ ok: false, message: 'not found' });
        return;
      }
      if (!st) {
        st = { take: 0, monitor: 0, examEndMs: endMs, timer: null };
        liveByKey.set(key, st);
      }
      if (mode === 'take') st.take += 1;
      else st.monitor += 1;

      const { take, monitor } = examRooms(classId, examId);
      await socket.join(mode === 'take' ? take : monitor);

      socket.data._examLive = { classId, examId, mode };
      ensureTimer(io, classId, examId);
      broadcastTick(io, classId, examId);

      if (typeof cb === 'function') cb({ ok: true, examEndMs: endMs });
    } catch {
      if (typeof cb === 'function') cb({ ok: false, message: 'error' });
    }
  });

  socket.on('leave_exam_live', (_payload, cb) => {
    leaveExamLiveSocket(socket, io);
    if (typeof cb === 'function') cb({ ok: true });
  });
}

function emitExamMonitorTab(classId, examId, body) {
  const io = getIO();
  if (!io) return;
  const { monitor } = examRooms(classId, examId);
  io.to(monitor).emit('exam_monitor_tab', body);
}

module.exports = {
  attachExamLiveSocket,
  leaveExamLiveSocket,
  emitExamMonitorTab,
};
