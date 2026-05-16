/**
 * Socket.IO：挂载到现有 HTTP Server（同端口），JWT 鉴权 + 分房间。
 * 跨 Worker / 多实例广播：node-redis + @socket.io/redis-adapter（见 utils/socketIoRedis.js）。
 */
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { setIO } = require('../utils/realtimeEmit');
const { attachSocketIoRedisAdapter } = require('../utils/socketIoRedis');
const examLive = require('./examLiveSocket');

function logConnectionLine(line) {
  const dir = path.join(__dirname, '..', 'logs', 'socket');
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'connections.log'), `${new Date().toISOString()} ${line}\n`);
  } catch (e) {
    console.warn('[socket] log:', e && e.message ? e.message : e);
  }
}

async function initSocketServer(httpServer) {
  const { Server } = require('socket.io');
  const io = new Server(httpServer, {
    path: '/socket.io',
    cors: { origin: true, credentials: true },
    transports: ['websocket', 'polling'],
    connectionStateRecovery: {},
    pingTimeout: 45000,
    pingInterval: 20000,
  });

  await attachSocketIoRedisAdapter(io);

  io.engine.on('connection_error', (err) => {
    logConnectionLine(`ENGINE_ERR ${err && err.message ? err.message : err}`);
  });

  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        String(socket.handshake.headers?.authorization || '').replace(/^Bearer\s+/i, '');
      if (!token) {
        return next(new Error('auth required'));
      }
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.data.userId = Number(decoded.id);
      socket.data.username = decoded.username;
      socket.data.role = decoded.role;
      socket.data.classId =
        decoded.class_id != null && decoded.class_id !== ''
          ? Number(decoded.class_id)
          : null;
      if ((socket.data.classId == null || Number.isNaN(socket.data.classId)) && decoded.role === 'student') {
        const [r] = await pool.query('SELECT class_id FROM users WHERE id = ? LIMIT 1', [socket.data.userId]);
        if (r.length && r[0].class_id != null) {
          socket.data.classId = Number(r[0].class_id);
        }
      }
      return next();
    } catch (e) {
      return next(new Error('invalid token'));
    }
  });

  io.on('connection', async (socket) => {
    const uid = socket.data.userId;
    const role = socket.data.role;
    logConnectionLine(`CONNECT user=${uid} role=${role} sid=${socket.id}`);

    await socket.join(`user:${uid}`);

    if (role === 'admin') {
      await socket.join('role:admin');
    }
    if (role === 'teacher') {
      await socket.join('portal:teacher');
      const [rows] = await pool.query('SELECT id FROM classes WHERE teacher_id = ?', [uid]);
      for (const r of rows) {
        await socket.join(`class:${r.id}:t`);
      }
    } else if (role === 'student') {
      await socket.join('portal:student');
      if (socket.data.classId != null && !Number.isNaN(socket.data.classId)) {
        await socket.join(`class:${socket.data.classId}:s`);
      }
    } else if (role === 'enterprise') {
      await socket.join('portal:enterprise');
      const [rows] = await pool.query(
        'SELECT class_id FROM enterprise_class_access WHERE enterprise_user_id = ?',
        [uid]
      );
      for (const r of rows) {
        await socket.join(`class:${r.class_id}:e`);
      }
    }

    socket.on('join_task', async (taskId, cb) => {
      try {
        const tid = Number(taskId);
        if (!Number.isFinite(tid)) {
          if (typeof cb === 'function') cb({ ok: false });
          return;
        }
        const [tasks] = await pool.query(
          'SELECT class_id, created_by FROM tasks WHERE id = ? LIMIT 1',
          [tid]
        );
        if (!tasks.length) {
          if (typeof cb === 'function') cb({ ok: false });
          return;
        }
        const t = tasks[0];
        let ok = false;
        if (role === 'admin') ok = true;
        else if (role === 'teacher' && Number(t.created_by) === uid) {
          const [c] = await pool.query('SELECT 1 FROM classes WHERE id = ? AND teacher_id = ?', [
            t.class_id,
            uid,
          ]);
          ok = c.length > 0;
        } else if (role === 'student' && Number(t.class_id) === Number(socket.data.classId)) {
          ok = true;
        } else if (role === 'enterprise') {
          const [c] = await pool.query(
            'SELECT 1 FROM enterprise_class_access WHERE enterprise_user_id = ? AND class_id = ?',
            [uid, t.class_id]
          );
          ok = c.length > 0;
        }
        if (!ok) {
          if (typeof cb === 'function') cb({ ok: false });
          return;
        }
        await socket.join(`task:${tid}`);
        if (typeof cb === 'function') cb({ ok: true });
      } catch {
        if (typeof cb === 'function') cb({ ok: false });
      }
    });

    socket.on('leave_task', async (taskId, cb) => {
      const tid = Number(taskId);
      if (Number.isFinite(tid)) await socket.leave(`task:${tid}`);
      if (typeof cb === 'function') cb({ ok: true });
    });

    examLive.attachExamLiveSocket(socket, io);

    socket.on('disconnect', (reason) => {
      examLive.leaveExamLiveSocket(socket, io);
      logConnectionLine(`DISCONNECT user=${uid} role=${role} reason=${reason} sid=${socket.id}`);
    });
  });

  setIO(io);
  return io;
}

module.exports = { initSocketServer };
