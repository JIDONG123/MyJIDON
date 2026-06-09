import { io } from 'socket.io-client';
import { dispatchRt } from './rtBus';
import { forceAuthSessionEnd } from '../utils/authSessionHandler';

let socket = null;

export function getRealtimeSocket() {
  return socket;
}

/**
 * @param {() => string | null | undefined} getToken
 */
export function connectRealtime(getToken) {
  const token = typeof getToken === 'function' ? getToken() : getToken;
  if (!token) {
    disconnectRealtime();
    return null;
  }
  if (socket && socket.auth && socket.auth.token === token && socket.connected) {
    return socket;
  }
  if (socket) {
    try {
      socket.removeAllListeners();
      socket.disconnect();
    } catch {
      /* ignore */
    }
    socket = null;
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const s = io(origin, {
    path: '/socket.io',
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 800,
    reconnectionDelayMax: 20000,
    timeout: 25000,
  });

  s.on('connect', () => {
    if (import.meta.env.DEV) {
      console.info('[rt] socket connected', s.id);
    }
  });
  s.on('disconnect', (reason) => {
    if (import.meta.env.DEV) {
      console.info('[rt] socket disconnect', reason);
    }
  });
  s.on('connect_error', (err) => {
    if (import.meta.env.DEV) {
      console.warn('[rt] connect_error', err?.message || err);
    }
  });
  s.on('rt', (payload) => {
    dispatchRt(payload);
  });
  s.on('auth:kicked', (payload) => {
    forceAuthSessionEnd({
      code: payload?.code || 'SESSION_KICKED',
      message: payload?.message || '账号已在其他设备登录，当前会话已下线。',
    });
  });

  socket = s;
  return s;
}

export function disconnectRealtime() {
  if (!socket) return;
  try {
    socket.removeAllListeners();
    socket.disconnect();
  } catch {
    /* ignore */
  }
  socket = null;
}
