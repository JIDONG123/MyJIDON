/**
 * 内容安全规则：账号字段、公式注入、不良文本（非代码语境）
 */

const RESERVED_USERNAMES = new Set([
  'admin',
  'administrator',
  'root',
  'system',
  'superuser',
  'test',
  'guest',
  'null',
  'undefined',
]);

const USERNAME_RE = /^[A-Za-z0-9._-]{4,32}$/;
const STUDENT_NO_RE = /^[A-Za-z0-9-]{4,32}$/;
const TEACHER_NO_RE = /^[A-Za-z0-9-]{3,32}$/;
const CN_NAME_RE = /^[\u4e00-\u9fa5·]{2,30}$/;
const EN_NAME_RE = /^[A-Za-z\s.'-]{2,30}$/;
const PHONE_CN_RE = /^(\+86)?1[3-9]\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const FORMULA_PREFIX_RE = /^[=+\-@]/;
const FORMULA_INJECTION_RE =
  /^(=|\+\-@)|HYPERLINK\s*\(|WEBSERVICE\s*\(|IMPORTXML\s*\(|cmd\s*[\|:]|powershell|javascript:|file:\/\//i;

const BAD_TEXT_PATTERNS = [
  /色情|裸体|约炮|裸聊|成人视频/i,
  /杀人|血腥|肢解|虐杀/i,
  /傻逼|草泥马|去死|废物/i,
  /加微信|扫码领|免费领取|兼职刷单|赌博/i,
  /(?:https?:\/\/|www\.)[^\s]{4,}/i,
];

const EXEC_EXT = new Set([
  '.exe',
  '.bat',
  '.cmd',
  '.com',
  '.scr',
  '.msi',
  '.dll',
  '.ps1',
  '.vbs',
  '.sh',
]);

const FAKE_PHONES = new Set(['00000000000', '11111111111', '12345678901', '18888888888']);

function trimStr(v) {
  return v == null ? '' : String(v).trim();
}

function hasHtml(s) {
  return /<[^>]+>/.test(s);
}

function hasEmoji(s) {
  return /[\u{1F300}-\u{1FAFF}]/u.test(s);
}

function detectFormulaInjection(value) {
  const s = trimStr(value);
  if (!s) return null;
  if (FORMULA_PREFIX_RE.test(s) || FORMULA_INJECTION_RE.test(s)) {
    return '存在公式注入风险';
  }
  return null;
}

function isLikelyCodeContext(context = {}) {
  const t = String(context.type || context.context || '').toLowerCase();
  return (
    context.isCode === true ||
    ['code', 'submission_code', 'practice_code', 'code_run', 'qbank_code'].includes(t)
  );
}

function detectBadText(text, context = {}) {
  if (!text || isLikelyCodeContext(context)) return null;
  const s = String(text);
  for (const re of BAD_TEXT_PATTERNS) {
    if (re.test(s)) return '包含疑似违规或广告引流内容';
  }
  return null;
}

function parseBlockedWords(csv) {
  if (!csv) return [];
  return String(csv)
    .split(/[,，;；\n]/)
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);
}

function matchBlockedWords(text, words = []) {
  if (!text || !words.length) return null;
  const lower = String(text).toLowerCase();
  for (const w of words) {
    if (w && lower.includes(w)) return `包含受限词汇`;
  }
  return null;
}

function validateUsername(username, { existingSet, reservedAllowed = false } = {}) {
  const u = trimStr(username);
  const errors = [];
  if (!u) return { ok: false, errors: ['用户名不能为空'] };
  if (u.length < 4 || u.length > 32) errors.push('用户名长度须为 4 到 32 位');
  if (!USERNAME_RE.test(u)) errors.push('用户名只允许字母、数字、下划线、短横线、点号');
  if (FORMULA_PREFIX_RE.test(u)) errors.push('用户名不能以 =、+、-、@ 开头');
  if (hasHtml(u)) errors.push('用户名不能包含 HTML');
  if (!reservedAllowed && RESERVED_USERNAMES.has(u.toLowerCase())) {
    errors.push('用户名为系统保留词');
  }
  const fi = detectFormulaInjection(u);
  if (fi) errors.push(fi);
  const bad = detectBadText(u, { type: 'account_field' });
  if (bad) errors.push(bad);
  if (existingSet?.has(u.toLowerCase())) errors.push('用户名重复');
  return { ok: errors.length === 0, errors, value: u };
}

function validateRealName(name) {
  const n = trimStr(name);
  const errors = [];
  if (!n) return { ok: false, errors: ['姓名不能为空'] };
  if (n.length < 2 || n.length > 30) errors.push('姓名长度须为 2 到 30');
  if (FORMULA_PREFIX_RE.test(n)) errors.push('姓名不能以 =、+、-、@ 开头');
  if (hasHtml(n) || hasEmoji(n)) errors.push('姓名包含非法字符');
  if (/^\d+$/.test(n)) errors.push('姓名不能为纯数字');
  if (!CN_NAME_RE.test(n) && !EN_NAME_RE.test(n)) errors.push('姓名格式不正确');
  const bad = detectBadText(n, { type: 'account_field' });
  if (bad) errors.push(bad);
  return { ok: errors.length === 0, errors, value: n };
}

function validateStudentNo(no, { existingSet } = {}) {
  const s = trimStr(no);
  const errors = [];
  if (!s) return { ok: false, errors: ['学号不能为空'] };
  if (!STUDENT_NO_RE.test(s)) errors.push('学号格式不正确');
  const fi = detectFormulaInjection(s);
  if (fi) errors.push(fi);
  if (existingSet?.has(s)) errors.push('学号重复');
  return { ok: errors.length === 0, errors, value: s };
}

function validateTeacherNo(no, { existingSet } = {}) {
  const s = trimStr(no);
  const errors = [];
  if (!s) return { ok: false, errors: ['工号不能为空'] };
  if (!TEACHER_NO_RE.test(s)) errors.push('工号格式不正确');
  const fi = detectFormulaInjection(s);
  if (fi) errors.push(fi);
  if (existingSet?.has(s)) errors.push('工号重复');
  return { ok: errors.length === 0, errors, value: s };
}

function validatePhone(phone, { required = true } = {}) {
  const p = trimStr(phone).replace(/\s/g, '');
  if (!p) return required ? { ok: false, errors: ['手机号不能为空'] } : { ok: true, errors: [], value: null };
  const errors = [];
  if (detectFormulaInjection(p)) errors.push('手机号存在公式注入风险');
  if (!PHONE_CN_RE.test(p)) errors.push('手机号格式不正确');
  if (FAKE_PHONES.has(p.replace(/^\+86/, ''))) errors.push('手机号疑似无效');
  return { ok: errors.length === 0, errors, value: p };
}

function validateEmail(email, { existingSet, required = true } = {}) {
  const e = trimStr(email).toLowerCase();
  if (!e) return required ? { ok: false, errors: ['邮箱不能为空'] } : { ok: true, errors: [], value: null };
  const errors = [];
  if (!EMAIL_RE.test(e)) errors.push('邮箱格式不正确');
  if (detectFormulaInjection(e)) errors.push('邮箱存在公式注入风险');
  if (hasHtml(e)) errors.push('邮箱不能包含 HTML');
  if (existingSet?.has(e)) errors.push('邮箱重复');
  return { ok: errors.length === 0, errors, value: e };
}

function validateDepartment(dept, { required = false } = {}) {
  const d = trimStr(dept);
  if (!d) return required ? { ok: false, errors: ['学院/部门不能为空'] } : { ok: true, errors: [], value: null };
  const errors = [];
  if (d.length < 2 || d.length > 50) errors.push('学院/部门长度须为 2 到 50');
  if (FORMULA_PREFIX_RE.test(d) || hasHtml(d)) errors.push('学院/部门包含非法字符');
  const bad = detectBadText(d, { type: 'account_field' });
  if (bad) errors.push(bad);
  return { ok: errors.length === 0, errors, value: d };
}

function validateClassName(name) {
  const c = trimStr(name);
  if (!c) return { ok: true, errors: [], value: null };
  const errors = [];
  if (c.length < 2 || c.length > 50) errors.push('班级名称长度须为 2 到 50');
  if (FORMULA_PREFIX_RE.test(c) || hasHtml(c)) errors.push('班级名称包含非法字符');
  const bad = detectBadText(c, { type: 'account_field' });
  if (bad) errors.push(bad);
  return { ok: errors.length === 0, errors, value: c };
}

function validateCompanyName(name, { required = false } = {}) {
  const c = trimStr(name);
  if (!c) return required ? { ok: false, errors: ['企业名称不能为空'] } : { ok: true, errors: [], value: null };
  const errors = [];
  if (c.length < 2 || c.length > 80) errors.push('企业/部门名称长度须为 2 到 80');
  if (FORMULA_PREFIX_RE.test(c) || hasHtml(c)) errors.push('企业/部门名称包含非法字符');
  const bad = detectBadText(c, { type: 'account_field' });
  if (bad) errors.push(bad);
  return { ok: errors.length === 0, errors, value: c };
}

function isPathTraversal(name) {
  const n = trimStr(name);
  return /(\.\.[\\/])|[\\/]{2}|^[a-zA-Z]:[\\/]/.test(n) || n.includes('\0');
}

function hasDoubleExtension(name) {
  const base = trimStr(name);
  const parts = base.split('.');
  if (parts.length < 3) return false;
  const last = `.${parts[parts.length - 1].toLowerCase()}`;
  const prev = `.${parts[parts.length - 2].toLowerCase()}`;
  const imageOrDoc = ['.jpg', '.jpeg', '.png', '.webp', '.pdf', '.doc', '.docx', '.txt'];
  return imageOrDoc.includes(prev) && EXEC_EXT.has(last);
}

function normalizeSafetyResult(partial = {}) {
  const riskLevel = partial.riskLevel || (partial.passed === false ? 'blocked' : 'safe');
  let action = partial.action;
  if (!action) {
    if (riskLevel === 'safe') action = 'pass';
    else if (riskLevel === 'suspicious') action = 'pending_review';
    else action = 'reject';
  }
  return {
    riskLevel,
    categories: partial.categories || [],
    reason: partial.reason || null,
    confidence: partial.confidence ?? null,
    action,
    passed: riskLevel === 'safe',
    fileHash: partial.fileHash ?? null,
  };
}

module.exports = {
  RESERVED_USERNAMES,
  USERNAME_RE,
  EXEC_EXT,
  trimStr,
  detectFormulaInjection,
  isLikelyCodeContext,
  detectBadText,
  parseBlockedWords,
  matchBlockedWords,
  validateUsername,
  validateRealName,
  validateStudentNo,
  validateTeacherNo,
  validatePhone,
  validateEmail,
  validateDepartment,
  validateClassName,
  validateCompanyName,
  isPathTraversal,
  hasDoubleExtension,
  normalizeSafetyResult,
};
