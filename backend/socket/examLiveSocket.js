/**
 * 考试实时：房间 exam:{examId}:take | :monitor
 * - exam_tick：服务端每秒广播 serverNowMs + examEndMs（场次统一结束时间）
 * - exam_monitor_tab：教师监考房，由 tabEvent REST 成功后调用 emitExamMonitorTab
 */
const pool = require('../config/database');
const { getIO } = require('../utils/realtimeEmit');
const { getPublishedExamForStudent } = require('../utils/qbAudience');

function examRooms(examId) {
  const eid = Number(examId);
  return {
    take: `exam:${eid}:take`,
    monitor: `exam:${eid}:monitor`,
  };
}

/** @type {Map<string, { take: number, monitor: number, examEndMs: number, timer: ReturnType<typeof setInterval> | null }>} */
const liveByKey = new Map();

function liveKey(examId) {
  return String(Number(examId));
}

async function loadExamEndMs(examId) {
  const [rows] = await pool.query(
    `SELECT UNIX_TIMESTAMP(e.end_at) * 1000 AS end_ms
     FROM qb_exams e
     WHERE e.id = ? AND e.status = 'published' LIMIT 1`,
    [examId]
  );
  if (!rows.length) return null;
  const v = Number(rows[0].end_ms);
  return Number.isFinite(v) ? v : null;
}

async function assertStudentExam(examId, studentId) {
  const exam = await getPublishedExamForStudent(examId, studentId);
  if (!exam) return false;
  const [rows] = await pool.query(
    `SELECT 1 FROM qb_exam_attempts
     WHERE exam_id = ? AND student_id = ? AND submitted_at IS NULL LIMIT 1`,
    [examId, studentId]
  );
  return rows.length > 0;
}

async function assertTeacherExam(examId, teacherId) {
  const [rows] = await pool.query(
    `SELECT 1 FROM qb_exams e
     WHERE e.id = ? AND e.teacher_id = ? AND e.status = 'published' LIMIT 1`,
    [examId, teacherId]
  );
  return rows.length > 0;
}

function broadcastTick(io, examId) {
  const key = liveKey(examId);
  const st = liveByKey.get(key);
  if (!st) return;
  const now = Date.now();
  const payload = { serverNowMs: now, examEndMs: st.examEndMs };
  const { take, monitor } = examRooms(examId);
  io.to(take).emit('exam_tick', payload);
  io.to(monitor).emit('exam_tick', payload);
}

function ensureTimer(io, examId) {
  const key = liveKey(examId);
  const st = liveByKey.get(key);
  if (!st || st.timer) return;
  if ((st.take || 0) + (st.monitor || 0) <= 0) return;
  st.timer = setInterval(() => broadcastTick(io, examId), 1000);
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
  const key = liveKey(j.examId);
  const st = liveByKey.get(key);
  if (st) {
    if (j.mode === 'take') st.take = Math.max(0, (st.take || 0) - 1);
    else st.monitor = Math.max(0, (st.monitor || 0) - 1);
    stopTimerIfEmpty(key);
  }
  const { take, monitor } = examRooms(j.examId);
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
        const ok = await assertStudentExam(examId, uid);
        if (!ok) {
          if (typeof cb === 'function') cb({ ok: false, message: 'forbidden' });
          return;
        }
      } else {
        if (role !== 'teacher') {
          if (typeof cb === 'function') cb({ ok: false, message: 'forbidden' });
          return;
        }
        const ok = await assertTeacherExam(examId, uid);
        if (!ok) {
          if (typeof cb === 'function') cb({ ok: false, message: 'forbidden' });
          return;
        }
      }

      const key = liveKey(examId);
      let st = liveByKey.get(key);
      const endMs = st ? st.examEndMs : await loadExamEndMs(examId);
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

      const { take, monitor } = examRooms(examId);
      await socket.join(mode === 'take' ? take : monitor);

      socket.data._examLive = { examId, mode };
      ensureTimer(io, examId);
      broadcastTick(io, examId);

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

function emitExamMonitorTab(examId, body) {
  const io = getIO();
  if (!io) return;
  const { monitor } = examRooms(examId);
  io.to(monitor).emit('exam_monitor_tab', body);
}

module.exports = {
  attachExamLiveSocket,
  leaveExamLiveSocket,
  emitExamMonitorTab,
};
