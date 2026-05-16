const cache = require('../utils/cacheService');

const windowMs = parseInt(process.env.POST_DEDUPE_WINDOW_MS || '3000', 10);
const recent = new Map();

function prune() {
  const now = Date.now();
  for (const [k, t] of recent) {
    if (now - t > windowMs * 4) {
      recent.delete(k);
    }
  }
}

/**
 * 短时间内相同用户 + 路径 + 请求体哈希视为重复提交，返回友好提示（不崩溃）。
 */
function postBodyDedupe(req, res, next) {
  if (req.method !== 'POST' && req.method !== 'PUT' && req.method !== 'PATCH') {
    return next();
  }
  const uid = req.user && req.user.id != null ? String(req.user.id) : 'anon';
  const path = req.originalUrl || req.url || '';
  let bodySig = '';
  try {
    bodySig = cache.stableHash(JSON.stringify(req.body || {}));
  } catch {
    bodySig = 'x';
  }
  const key = `${uid}:${req.method}:${path}:${bodySig}`;
  const now = Date.now();
  prune();
  const last = recent.get(key);
  if (last != null && now - last < windowMs) {
    return res.status(429).json({
      success: false,
      message: '请勿重复提交，请稍后再试',
      code: 'DUPLICATE_REQUEST',
    });
  }
  recent.set(key, now);
  next();
}

module.exports = { postBodyDedupe };
