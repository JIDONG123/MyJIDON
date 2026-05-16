/**
 * 进程内滑动窗口限流（不依赖 Redis）；超限返回 429 JSON，不抛异常。
 */
function clientIp(req) {
  const x = req.headers['x-forwarded-for'];
  if (x && typeof x === 'string') {
    return x.split(',')[0].trim() || req.socket.remoteAddress || '0.0.0.0';
  }
  return req.socket.remoteAddress || '0.0.0.0';
}

function limiterKey(req, prefix) {
  const ip = clientIp(req);
  const uid = req.user && req.user.id != null ? String(req.user.id) : 'anon';
  return `${prefix}:${uid}:${ip}`;
}

function createWindowLimiter({ windowMs, max, keyPrefix = 'rl' }) {
  const buckets = new Map();

  return function windowRateLimit(req, res, next) {
    const key = limiterKey(req, keyPrefix);
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || now - b.start >= windowMs) {
      b = { start: now, count: 0 };
      buckets.set(key, b);
    }
    b.count += 1;
    if (b.count > max) {
      return res.status(429).json({
        success: false,
        message: '请求过于频繁，请稍后再试',
        code: 'RATE_LIMIT',
      });
    }
    next();
  };
}

function parsePositiveInt(v, def) {
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) && n > 0 ? n : def;
}

function createLoginLimiter() {
  const windowMs = parsePositiveInt(process.env.RATE_LIMIT_LOGIN_WINDOW_MS, 60000);
  const max = parsePositiveInt(process.env.RATE_LIMIT_LOGIN_MAX, 30);
  return createWindowLimiter({ windowMs, max, keyPrefix: 'login' });
}

function createApiLimiter() {
  const windowMs = parsePositiveInt(process.env.RATE_LIMIT_API_WINDOW_MS, 60000);
  const max = parsePositiveInt(process.env.RATE_LIMIT_API_MAX, 300);
  return createWindowLimiter({ windowMs, max, keyPrefix: 'api' });
}

function createGradingLimiter() {
  const windowMs = parsePositiveInt(process.env.RATE_LIMIT_GRADING_WINDOW_MS, 60000);
  const max = parsePositiveInt(process.env.RATE_LIMIT_GRADING_MAX, 20);
  return createWindowLimiter({ windowMs, max, keyPrefix: 'grade' });
}

function createSubmitLimiter() {
  const windowMs = parsePositiveInt(process.env.RATE_LIMIT_SUBMIT_WINDOW_MS, 60000);
  const max = parsePositiveInt(process.env.RATE_LIMIT_SUBMIT_MAX, 40);
  return createWindowLimiter({ windowMs, max, keyPrefix: 'submit' });
}

function createBatchLimiter() {
  const windowMs = parsePositiveInt(process.env.RATE_LIMIT_BATCH_WINDOW_MS, 600000);
  const max = parsePositiveInt(process.env.RATE_LIMIT_BATCH_MAX, 10);
  return createWindowLimiter({ windowMs, max, keyPrefix: 'batch' });
}

/** 考试交卷（削峰，按用户+IP） */
function createQbExamSubmitLimiter() {
  const windowMs = parsePositiveInt(process.env.RATE_LIMIT_QB_EXAM_SUBMIT_WINDOW_MS, 60000);
  const max = parsePositiveInt(process.env.RATE_LIMIT_QB_EXAM_SUBMIT_MAX, 20);
  return createWindowLimiter({ windowMs, max, keyPrefix: 'qb_exam_submit' });
}

/** 考试自动保存草稿 */
function createQbExamAutosaveLimiter() {
  const windowMs = parsePositiveInt(process.env.RATE_LIMIT_QB_EXAM_AUTOSAVE_WINDOW_MS, 60000);
  const max = parsePositiveInt(process.env.RATE_LIMIT_QB_EXAM_AUTOSAVE_MAX, 120);
  return createWindowLimiter({ windowMs, max, keyPrefix: 'qb_exam_autosave' });
}

/** 编程题试运行（按用户+IP） */
function createQbCodeRunLimiter() {
  const windowMs = parsePositiveInt(process.env.RATE_LIMIT_QB_CODE_RUN_WINDOW_MS, 60000);
  const max = parsePositiveInt(process.env.RATE_LIMIT_QB_CODE_RUN_MAX, 40);
  return createWindowLimiter({ windowMs, max, keyPrefix: 'qb_code_run' });
}

module.exports = {
  clientIp,
  createWindowLimiter,
  createLoginLimiter,
  createApiLimiter,
  createGradingLimiter,
  createSubmitLimiter,
  createBatchLimiter,
  createQbExamSubmitLimiter,
  createQbExamAutosaveLimiter,
  createQbCodeRunLimiter,
};
