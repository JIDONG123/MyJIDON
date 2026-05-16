import { onMounted, onUnmounted } from 'vue';
import { subscribeRt } from '../socket/rtBus';

/**
 * 在指定 domain 的实时推送下执行刷新（通常内再调现有 loadXxx 接口）
 * @param {string[]} domains
 * @param {(payload: object) => void} fn
 */
export function useRtOnDomains(domains, fn) {
  let off = null;
  onMounted(() => {
    off = subscribeRt((payload) => {
      if (!payload || !domains.includes(payload.domain)) return;
      fn(payload);
    });
  });
  onUnmounted(() => {
    if (typeof off === 'function') off();
  });
}
