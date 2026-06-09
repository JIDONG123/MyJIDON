/**
 * 内容安全检测与合规审查（统一服务）
 * 预留 BullMQ：CONTENT_SAFETY_ASYNC=1 时可异步检测图片/知识库
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const pool = require('../config/database');
const { getSystemConfigs } = require('../utils/llmClient');
const { readHead, verifyExtensionMatchesMagic, extname } = require('../utils/fileMagic');
const {
  normalizeSafetyResult,
  detectFormulaInjection,
  detectBadText,
  parseBlockedWords,
  matchBlockedWords,
  isLikelyCodeContext,
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
  EXEC_EXT,
  trimStr,
} = require('../utils/contentSafetyRules');
const { writeAuditLog } = require('./contentSafetyAuditService');
const { recognizeImageWithPrompt, guessMime } = require('../utils/qwenVlClient');
const { getQwenVlConfig, isQwenVlConfigured } = require('./visionModelService');

function isEnabled() {
  const v = process.env.CONTENT_SAFETY_ENABLED;
  if (v === undefined || v === '') return true;
  return v === '1' || v === 'true';
}

function sha256File(filePathOrBuffer) {
  if (Buffer.isBuffer(filePathOrBuffer)) {
    return crypto.createHash('sha256').update(filePathOrBuffer).digest('hex');
  }
  if (!filePathOrBuffer || !fs.existsSync(filePathOrBuffer)) return null;
  const buf = fs.readFileSync(filePathOrBuffer);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

const PROFILE_ALLOW = {
  avatar: ['.jpg', '.jpeg', '.png', '.webp'],
  submission: [
    '.pdf', '.doc', '.docx', '.txt', '.md', '.jpg', '.jpeg', '.png', '.webp',
    '.py', '.js', '.java', '.cpp', '.c', '.html', '.css', '.json', '.sql', '.zip',
  ],
  kb: ['.pdf', '.doc', '.docx', '.txt', '.md', '.xlsx', '.csv'],
  excel_import: ['.xls', '.xlsx'],
};

function validateFileBasic(file, options = {}) {
  if (!isEnabled()) {
    return normalizeSafetyResult({ riskLevel: 'safe', passed: true, fileHash: null });
  }
  const profile = options.profile || 'submission';
  const maxBytes = options.maxBytes || 50 * 1024 * 1024;
  const allowExt = (options.allowExt || PROFILE_ALLOW[profile] || PROFILE_ALLOW.submission).map((e) =>
    e.toLowerCase()
  );

  const filePath = file?.path || file?.filePath;
  const originalName = trimStr(file?.originalname || file?.fileName || file?.filename);
  const mimetype = trimStr(file?.mimetype || file?.mimeType);
  const size = file?.size ?? (filePath && fs.existsSync(filePath) ? fs.statSync(filePath).size : 0);

  if (!originalName && !filePath) {
    return normalizeSafetyResult({
      passed: false,
      riskLevel: 'blocked',
      categories: ['malicious_file'],
      reason: '文件无效',
    });
  }
  if (size <= 0) {
    return normalizeSafetyResult({
      passed: false,
      riskLevel: 'blocked',
      categories: ['malicious_file'],
      reason: '文件为空',
    });
  }
  if (size > maxBytes) {
    return normalizeSafetyResult({
      passed: false,
      riskLevel: 'blocked',
      categories: ['malicious_file'],
      reason: `文件过大，最大支持 ${Math.round(maxBytes / 1024 / 1024)}MB`,
    });
  }
  if (originalName.length > 240) {
    return normalizeSafetyResult({
      passed: false,
      riskLevel: 'blocked',
      categories: ['malicious_file'],
      reason: '文件名过长',
    });
  }
  if (isPathTraversal(originalName)) {
    return normalizeSafetyResult({
      passed: false,
      riskLevel: 'blocked',
      categories: ['malicious_file'],
      reason: '文件名包含非法路径',
    });
  }
  if (hasDoubleExtension(originalName)) {
    return normalizeSafetyResult({
      passed: false,
      riskLevel: 'blocked',
      categories: ['malicious_file'],
      reason: '文件名存在双扩展名伪装',
    });
  }

  const ext = extname(originalName);
  if (!allowExt.includes(ext)) {
    return normalizeSafetyResult({
      passed: false,
      riskLevel: 'blocked',
      categories: ['malicious_file'],
      reason: '文件类型不支持',
    });
  }
  if (EXEC_EXT.has(ext)) {
    return normalizeSafetyResult({
      passed: false,
      riskLevel: 'blocked',
      categories: ['malicious_file'],
      reason: '不允许上传可执行文件',
    });
  }

  const head = readHead(filePath || file?.buffer, 16);
  const magicCheck = verifyExtensionMatchesMagic(originalName, head);
  if (!magicCheck.ok) {
    return normalizeSafetyResult({
      passed: false,
      riskLevel: 'blocked',
      categories: ['malicious_file'],
      reason: magicCheck.reason || '伪装文件',
    });
  }

  const fileHash = sha256File(filePath || file?.buffer);
  return normalizeSafetyResult({ riskLevel: 'safe', passed: true, fileHash });
}

async function detectTextSafety(text, context = {}) {
  if (!isEnabled()) return normalizeSafetyResult({ riskLevel: 'safe' });
  const s = trimStr(text);
  if (!s) return normalizeSafetyResult({ riskLevel: 'safe' });

  if (s.length > (context.maxLen || 200000)) {
    return normalizeSafetyResult({
      riskLevel: 'blocked',
      categories: ['illegal_text'],
      reason: '文本内容过长',
    });
  }

  const fi = detectFormulaInjection(s);
  if (fi && !isLikelyCodeContext(context)) {
    return normalizeSafetyResult({
      riskLevel: 'blocked',
      categories: ['formula_injection'],
      reason: fi,
    });
  }

  const cfg = await getSystemConfigs(['assistant_blocked_words']);
  const blocked = matchBlockedWords(s, parseBlockedWords(cfg.assistant_blocked_words));
  if (blocked) {
    return normalizeSafetyResult({
      riskLevel: 'blocked',
      categories: ['illegal_text'],
      reason: blocked,
    });
  }

  const bad = detectBadText(s, context);
  if (bad) {
    const level = isLikelyCodeContext(context) ? 'suspicious' : 'blocked';
    return normalizeSafetyResult({
      riskLevel: level,
      categories: ['illegal_text'],
      reason: bad,
    });
  }

  return normalizeSafetyResult({ riskLevel: 'safe' });
}

const IMAGE_SAFETY_PROMPT = `请判断这张图片是否包含色情低俗、血腥暴力、违法广告、二维码引流、辱骂攻击、违法违规或与学习任务明显无关的内容。
只返回 JSON：
{"riskLevel":"safe|suspicious|blocked","categories":[],"reason":"","confidence":0.0,"summary":""}`;

async function detectImageSafety(filePath, context = {}) {
  if (!isEnabled()) {
    return { riskLevel: 'safe', categories: [], reason: null, confidence: 1, modelUsed: null, action: 'pass' };
  }
  if (!filePath || !fs.existsSync(filePath)) {
    return normalizeSafetyResult({ riskLevel: 'safe' });
  }

  const basic = validateFileBasic(
    { path: filePath, originalname: path.basename(filePath), size: fs.statSync(filePath).size },
    { profile: context.profile || 'avatar', maxBytes: context.maxBytes || 5 * 1024 * 1024 }
  );
  if (!basic.passed) return { ...basic, modelUsed: null };

  if (!(await isQwenVlConfigured())) {
    return normalizeSafetyResult({ riskLevel: 'safe', modelUsed: null });
  }

  try {
    const cfg = await getQwenVlConfig();
    const buf = fs.readFileSync(filePath);
    const mime = guessMime(path.basename(filePath));
    const raw = await recognizeImageWithPrompt(buf, IMAGE_SAFETY_PROMPT, {
      apiBase: cfg.apiBase,
      apiKey: cfg.apiKey,
      model: cfg.model,
      mime,
      timeoutMs: cfg.timeoutMs,
    });
    let parsed = null;
    try {
      const m = String(raw || '').match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : null;
    } catch {
      parsed = null;
    }
    if (!parsed) {
      return normalizeSafetyResult({ riskLevel: 'safe', modelUsed: cfg.model });
    }
    return normalizeSafetyResult({
      riskLevel: parsed.riskLevel || 'safe',
      categories: parsed.categories || [],
      reason: parsed.reason || parsed.summary || null,
      confidence: parsed.confidence ?? null,
      modelUsed: cfg.model,
    });
  } catch (e) {
    console.warn('[contentSafety] image check failed', e.message || e);
    return normalizeSafetyResult({
      riskLevel: 'suspicious',
      categories: ['image_check_failed'],
      reason: '图片内容安全检测暂不可用，已标记待复核',
      modelUsed: 'qwen-vl',
    });
  }
}

function scanWorkbookCells(workbook, handler) {
  const errors = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet || sheet['!hidden']) continue;
    const ref = sheet['!ref'];
    if (!ref) continue;
    const range = require('xlsx').utils.decode_range(ref);
    for (let r = range.s.r; r <= range.e.r; r += 1) {
      for (let c = range.s.c; c <= range.e.c; c += 1) {
        const addr = require('xlsx').utils.encode_cell({ r, c });
        const cell = sheet[addr];
        if (!cell) continue;
        const val = cell.v != null ? String(cell.v) : '';
        if (!val.trim()) continue;
        handler({ sheetName, row: r + 1, col: c + 1, value: val, errors });
      }
    }
  }
  return errors;
}

async function validateExcelImport(input, importType = 'student') {
  if (!isEnabled()) return { passed: true, errors: [], rows: [] };
  const XLSX = require('xlsx');
  const workbook = Buffer.isBuffer(input)
    ? XLSX.read(input, { type: 'buffer', cellDates: false })
    : input;
  const cellErrors = [];
  scanWorkbookCells(workbook, ({ row, value, errors }) => {
    if (value.length > 500) {
      errors.push({ row, field: '单元格', message: '内容过长' });
    }
    const fi = detectFormulaInjection(value);
    if (fi) errors.push({ row, field: '单元格', message: fi });
    if (/HYPERLINK\s*\(|WEBSERVICE\s*\(|IMPORTXML\s*\(|javascript:|file:\/\//i.test(value)) {
      errors.push({ row, field: '单元格', message: '包含危险公式或链接' });
    }
  });

  const rowErrors = [];
  const isStudent = importType === 'student';
  const parsedFn = isStudent
    ? require('../utils/studentImportExcel').parseImportWorkbook
    : require('../utils/teacherImportExcel').parseImportWorkbook;

  let rows = [];
  try {
    rows = parsedFn(workbook);
  } catch (e) {
    return { passed: false, errors: [{ row: 0, field: '文件', message: e.message || 'Excel 解析失败' }], rows: [] };
  }

  const fieldLabels = isStudent
    ? { username: '用户名', realName: '姓名', studentNo: '学号', phone: '手机号', email: '邮箱', className: '班级名称' }
    : { username: '用户名', realName: '姓名', teacherNo: '工号', phone: '手机号', email: '邮箱', department: '学院/部门' };

  const seen = { username: new Set(), studentNo: new Set(), teacherNo: new Set(), email: new Set() };

  rows.forEach((row, idx) => {
    const rowNo = row.rowNumber || idx + 2;
    const checks = [];
    checks.push(validateUsername(row.username, { existingSet: seen.username }));
    if (row.username) seen.username.add(String(row.username).trim().toLowerCase());
    checks.push(validateRealName(row.realName));
    if (isStudent) {
      checks.push(validateStudentNo(row.studentNo, { existingSet: seen.studentNo }));
      if (row.studentNo) seen.studentNo.add(String(row.studentNo).trim());
      checks.push(validatePhone(row.phone, { required: true }));
      checks.push(validateEmail(row.email, { existingSet: seen.email, required: true }));
      checks.push(validateClassName(row.className));
    } else {
      checks.push(validateTeacherNo(row.teacherNo, { existingSet: seen.teacherNo }));
      if (row.teacherNo) seen.teacherNo.add(String(row.teacherNo).trim());
      checks.push(validateEmail(row.email, { existingSet: seen.email, required: true }));
      checks.push(validateDepartment(row.department, { required: true }));
      checks.push(validatePhone(row.phone, { required: false }));
    }
    if (row.email) seen.email.add(String(row.email).trim().toLowerCase());

    for (const [key, check] of Object.entries({
      username: checks[0],
      realName: checks[1],
      ...(isStudent
        ? { studentNo: checks[2], phone: checks[3], email: checks[4], className: checks[5] }
        : { teacherNo: checks[2], email: checks[3], department: checks[4], phone: checks[5] }),
    })) {
      if (check && !check.ok) {
        for (const msg of check.errors) {
          rowErrors.push({ row: rowNo, field: fieldLabels[key] || key, message: msg });
        }
      }
    }
  });

  const allErrors = [...cellErrors, ...rowErrors];
  const blocked = allErrors.some((e) =>
    /公式注入|危险公式|过长|格式不正确|非法|保留词|重复|不能为空/.test(e.message)
  );
  return {
    passed: allErrors.length === 0,
    errors: allErrors,
    rows,
    riskLevel: allErrors.length ? (blocked ? 'blocked' : 'suspicious') : 'safe',
    action: allErrors.length ? 'reject' : 'pass',
  };
}

async function scanArchive(filePath, options = {}) {
  if (!isEnabled()) return normalizeSafetyResult({ riskLevel: 'safe' });
  const maxZip = options.maxZipBytes || parseInt(process.env.ZIP_MAX_UPLOAD_BYTES || String(50 * 1024 * 1024), 10);
  const maxEntries = options.maxEntries || parseInt(process.env.ZIP_MAX_ENTRY_COUNT || '300', 10);
  const maxUncompressed = options.maxUncompressed || parseInt(process.env.ZIP_MAX_UNCOMPRESSED_TOTAL || String(200 * 1024 * 1024), 10);
  const maxDepth = options.maxDepth || 8;

  if (!filePath || !fs.existsSync(filePath)) {
    return normalizeSafetyResult({ riskLevel: 'blocked', reason: '压缩包不存在', categories: ['malicious_file'] });
  }
  const stat = fs.statSync(filePath);
  if (stat.size > maxZip) {
    return normalizeSafetyResult({ riskLevel: 'blocked', reason: '压缩包过大', categories: ['malicious_file'] });
  }

  let zip;
  try {
    zip = new AdmZip(filePath);
  } catch {
    return normalizeSafetyResult({ riskLevel: 'blocked', reason: '压缩包损坏', categories: ['malicious_file'] });
  }

  const entries = zip.getEntries();
  if (entries.length > maxEntries) {
    return normalizeSafetyResult({ riskLevel: 'blocked', reason: '压缩包内文件数量过多', categories: ['malicious_file'] });
  }

  let totalUncompressed = 0;
  for (const ent of entries) {
    const name = ent.entryName || '';
    if (isPathTraversal(name) || name.startsWith('/') || /^[a-zA-Z]:/.test(name)) {
      return normalizeSafetyResult({ riskLevel: 'blocked', reason: '压缩包包含非法路径', categories: ['malicious_file'] });
    }
    const depth = name.split(/[/\\]/).length;
    if (depth > maxDepth) {
      return normalizeSafetyResult({ riskLevel: 'blocked', reason: '压缩包目录层级过深', categories: ['malicious_file'] });
    }
    if (/\.(zip|rar|7z|tar|gz)$/i.test(name)) {
      return normalizeSafetyResult({ riskLevel: 'blocked', reason: '不允许嵌套压缩包', categories: ['malicious_file'] });
    }
    const ext = extname(name);
    if (EXEC_EXT.has(ext)) {
      return normalizeSafetyResult({ riskLevel: 'blocked', reason: '压缩包包含可执行文件', categories: ['malicious_file'] });
    }
    totalUncompressed += ent.header?.size || 0;
    if (totalUncompressed > maxUncompressed) {
      return normalizeSafetyResult({ riskLevel: 'blocked', reason: '压缩包解压后体积过大', categories: ['malicious_file'] });
    }
  }

  return normalizeSafetyResult({ riskLevel: 'safe', fileHash: sha256File(filePath) });
}

async function validateAccountFields(payload = {}, role = 'student') {
  if (!isEnabled()) return { passed: true, errors: [], riskLevel: 'safe' };
  const errors = [];
  const r = String(role || '').toLowerCase();

  const u = validateUsername(payload.username || payload.userName);
  if (!u.ok) errors.push(...u.errors.map((m) => ({ field: 'username', message: m })));

  const n = validateRealName(payload.realName || payload.real_name);
  if (!n.ok) errors.push(...n.errors.map((m) => ({ field: 'realName', message: m })));

  if (r === 'student') {
    const sn = validateStudentNo(payload.studentNo || payload.student_no);
    if (!sn.ok) errors.push(...sn.errors.map((m) => ({ field: 'studentNo', message: m })));
    const p = validatePhone(payload.phone, { required: true });
    if (!p.ok) errors.push(...p.errors.map((m) => ({ field: 'phone', message: m })));
    const e = validateEmail(payload.email, { required: true });
    if (!e.ok) errors.push(...e.errors.map((m) => ({ field: 'email', message: m })));
    const c = validateClassName(payload.className || payload.class_name);
    if (!c.ok) errors.push(...c.errors.map((m) => ({ field: 'className', message: m })));
  } else if (r === 'teacher') {
    const tn = validateTeacherNo(payload.teacherNo || payload.teacher_no);
    if (!tn.ok) errors.push(...tn.errors.map((m) => ({ field: 'teacherNo', message: m })));
    const e = validateEmail(payload.email, { required: true });
    if (!e.ok) errors.push(...e.errors.map((m) => ({ field: 'email', message: m })));
    const d = validateDepartment(payload.department, { required: true });
    if (!d.ok) errors.push(...d.errors.map((m) => ({ field: 'department', message: m })));
    const p = validatePhone(payload.phone, { required: false });
    if (!p.ok) errors.push(...p.errors.map((m) => ({ field: 'phone', message: m })));
  } else if (r === 'enterprise') {
    const e = validateEmail(payload.email, { required: true });
    if (!e.ok) errors.push(...e.errors.map((m) => ({ field: 'email', message: m })));
    const co = validateCompanyName(payload.company || payload.department, { required: false });
    if (!co.ok) errors.push(...co.errors.map((m) => ({ field: 'company', message: m })));
    const p = validatePhone(payload.phone, { required: false });
    if (!p.ok) errors.push(...p.errors.map((m) => ({ field: 'phone', message: m })));
  }

  const riskLevel = errors.length ? 'blocked' : 'safe';
  return {
    passed: errors.length === 0,
    errors,
    riskLevel,
    action: errors.length ? 'reject' : 'pass',
    categories: errors.length ? ['invalid_account_field'] : [],
  };
}

function mapRiskToSafetyStatus(result) {
  if (result.riskLevel === 'blocked' || result.action === 'reject') return 'rejected';
  if (result.riskLevel === 'suspicious' || result.action === 'pending_review') return 'pending_review';
  return 'passed';
}

async function auditAndReturn(entry, result) {
  try {
    await writeAuditLog({
      ...entry,
      riskLevel: result.riskLevel,
      categories: result.categories,
      reason: result.reason,
      modelUsed: result.modelUsed,
      rawResult: result,
      status: mapRiskToSafetyStatus(result),
    });
  } catch (e) {
    console.warn('[contentSafety] audit log failed', e.message || e);
  }
  return result;
}

async function assertSubmissionSafeForAiGrading(submissionId) {
  const [rows] = await pool.query(
    'SELECT id, safety_status, safety_reason FROM submissions WHERE id = ?',
    [submissionId]
  );
  if (!rows.length) {
    const err = new Error('提交不存在');
    err.status = 404;
    throw err;
  }
  const st = rows[0].safety_status || 'passed';
  if (st === 'rejected' || st === 'manual_rejected') {
    const err = new Error('该提交包含被拦截内容，不能发起 AI 批改');
    err.status = 403;
    throw err;
  }
  if (st === 'pending_review') {
    const err = new Error('该提交内容安全状态为待复核，暂不能发起 AI 批改');
    err.status = 403;
    throw err;
  }
  return true;
}

async function evaluateSubmissionUpload({ file, content, fileName, fileType, user, submissionId }) {
  let safetyStatus = 'passed';
  let safetyReason = null;
  let fileHash = null;
  const auditBase = {
    targetType: 'submission',
    targetId: submissionId ?? null,
    userId: user?.id,
    userRole: user?.role,
    username: user?.username,
    realName: user?.realName,
  };

  if (file) {
    const basic = validateFileBasic(file, {
      profile: 'submission',
      maxBytes: parseInt(process.env.SUBMISSION_MAX_BYTES || String(50 * 1024 * 1024), 10),
    });
    fileHash = basic.fileHash;
    if (!basic.passed) {
      await auditAndReturn(auditBase, { ...basic, fileName: fileName || file.originalname });
      return { blocked: true, message: basic.reason, safetyStatus: 'rejected', safetyReason: basic.reason, fileHash };
    }
    const fp = file.path || file.filePath;
    const isZip = /\.zip$/i.test(fileName || '') || fileType === 'application/zip';
    if (isZip && fp) {
      const zipR = await scanArchive(fp);
      if (zipR.riskLevel === 'blocked') {
        await auditAndReturn(auditBase, { ...zipR, fileName });
        return { blocked: true, message: zipR.reason, safetyStatus: 'rejected', safetyReason: zipR.reason, fileHash };
      }
    }
    if (fp && /^image\//i.test(fileType || '')) {
      const imgR = await detectImageSafety(fp, { profile: 'submission' });
      if (imgR.riskLevel === 'blocked') {
        await auditAndReturn(auditBase, { ...imgR, fileName });
        return { blocked: true, message: imgR.reason || '图片疑似包含违规内容', safetyStatus: 'rejected', safetyReason: imgR.reason, fileHash };
      }
      if (imgR.riskLevel === 'suspicious') {
        safetyStatus = 'pending_review';
        safetyReason = imgR.reason || '图片内容待复核';
        await auditAndReturn(auditBase, { ...imgR, fileName, fileHash });
      }
    }
  }

  const textCtx = { type: /\.(py|js|java|cpp|c|html|css|json|sql|md)$/i.test(fileName || '') ? 'code' : 'submission_text' };
  const textR = await detectTextSafety(content, textCtx);
  if (textR.riskLevel === 'blocked') {
    await auditAndReturn(auditBase, textR);
    return { blocked: true, message: textR.reason, safetyStatus: 'rejected', safetyReason: textR.reason, fileHash };
  }
  if (textR.riskLevel === 'suspicious' && safetyStatus === 'passed') {
    safetyStatus = 'pending_review';
    safetyReason = textR.reason || '文本内容待复核';
    await auditAndReturn(auditBase, textR);
  }

  return { blocked: false, safetyStatus, safetyReason, fileHash };
}

/** BullMQ 预留：contentSafetyQueue */
function enqueueContentSafetyJob(_payload) {
  if (process.env.CONTENT_SAFETY_ASYNC === '1' && process.env.BULLMQ_ENABLED === '1') {
    // 后续：contentSafetyQueue.add('scan', payload)
    return { queued: true };
  }
  return { queued: false };
}

module.exports = {
  isEnabled,
  validateFileBasic,
  detectTextSafety,
  detectImageSafety,
  validateExcelImport,
  scanArchive,
  validateAccountFields,
  mapRiskToSafetyStatus,
  auditAndReturn,
  assertSubmissionSafeForAiGrading,
  evaluateSubmissionUpload,
  enqueueContentSafetyJob,
  sha256File,
};
