'use strict';
/** 统一设置 USE_CLUSTER=1 后再加载 cluster.js（跨平台，不依赖 cross-env） */
process.env.USE_CLUSTER = process.env.USE_CLUSTER || '1';
/** 未配置 Redis 时不要探测 127.0.0.1:6379，避免 connect 阶段长时间阻塞 */
const hasRedis =
  Boolean(String(process.env.REDIS_URL || '').trim()) ||
  Boolean(String(process.env.REDIS_HOST || '').trim());
if (!hasRedis && process.env.SOCKET_IO_REDIS_DEV_PROBE == null) {
  process.env.SOCKET_IO_REDIS_DEV_PROBE = '0';
}
require('../cluster.js');
