/**
 * 关闭 node:test 用例打开的数据库 / Redis 连接，避免进程挂起。
 */
async function closeTestResources() {
  try {
    const { closeRedis } = require('../utils/redisClient');
    await closeRedis();
  } catch {
    /* ignore */
  }
  try {
    const pool = require('../config/database');
    if (pool && typeof pool.end === 'function') {
      await pool.end();
    }
  } catch {
    /* ignore */
  }
}

module.exports = { closeTestResources };
