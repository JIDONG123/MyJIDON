/** 轻量事件总线：Socket 收到 rt 后分发给订阅者 */

const listeners = new Set();

export function subscribeRt(handler) {
  listeners.add(handler);
  return () => listeners.delete(handler);
}

export function dispatchRt(payload) {
  for (const h of listeners) {
    try {
      h(payload);
    } catch {
      /* ignore */
    }
  }
}
