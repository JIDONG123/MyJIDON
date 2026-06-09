#!/usr/bin/env node
/**
 * 第四步回归：旧批改接口契约 + grading_job 通知
 *
 * 默认 SAFE MODE（不创建真实 AI 批改任务、不入 BullMQ、不调用 LLM）：
 *   cd backend && npm run regression:grading
 *
 * LIVE AI MODE（会创建真实 grading_jobs，可能覆盖 AI 结果，仅用于专用开发库）：
 *   npm run regression:grading:live
 *   或 PowerShell：
 *   $env:REGRESSION_LIVE_AI="1"; $env:REGRESSION_ALLOW_MUTATION="1"; npm run regression:grading
 *
 * 可选 HTTP 层（需后端已启动，且 LIVE AI 模式才允许 POST 批改）：
 *   REGRESSION_HTTP=1 REGRESSION_LIVE_AI=1 REGRESSION_ALLOW_MUTATION=1 npm run regression:grading
 */
require('../config/loadEnv').loadEnv();

const pool = require('../config/database');
const jwt = require('jsonwebtoken');
const gradingJobService = require('../services/gradingJobService');
const { notifyJobTerminal } = require('../utils/gradingJobNotify');
const {
  assertLegacyAiGradeData,
  assertLegacyBatchGradeData,
  buildLegacyAiResponse,
  buildLegacyBatchResponse,
} = require('../utils/gradingLegacyContract');
const { parseTaskCodeRunConfig } = require('../utils/taskCodeRunConfig');
const {
  teacherOwnsTaskForGrading,
  teacherOwnsSubmissionTask,
} = require('../utils/accessControl');
const {
  assertNewAiGradeAllowed,
  loadSubmissionEligibilityRow,
} = require('../utils/submissionAiBatchEligibility');

const LIVE_AI = process.env.REGRESSION_LIVE_AI === '1';
const ALLOW_MUTATION = process.env.REGRESSION_ALLOW_MUTATION === '1';
const LIVE_AI_MODE = LIVE_AI && ALLOW_MUTATION;

const HTTP = process.env.REGRESSION_HTTP === '1' || process.env.REGRESSION_HTTP === 'true';
const BASE = process.env.REGRESSION_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;

/** AI 批改门禁：code_run 启用且 gradeAfterRun 时须有 code_run_result_id */
function submissionPassesCodeRunGradingGate(row) {
  if (!row || !Number(row.code_run_enabled)) return true;
  const cfg = parseTaskCodeRunConfig(row.code_run_config);
  if (!cfg.gradeAfterRun) return true;
  return Boolean(row.code_run_result_id);
}

const SUBMISSION_SELECT_SQL = `
  SELECT s.id, s.task_id, t.code_run_enabled, t.code_run_config, s.code_run_result_id
  FROM submissions s
  INNER JOIN tasks t ON t.id = s.task_id
`;

let passed = 0;
let failed = 0;
let jobsBefore = null;
let itemsBefore = null;

function ok(name) {
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function fail(name, detail) {
  failed += 1;
  console.error(`  ✗ ${name}${detail ? `: ${detail}` : ''}`);
}

function assertNoErrors(name, errors) {
  if (!errors.length) ok(name);
  else fail(name, errors.join('; '));
}

function assertProductionMutationGuard() {
  if (!ALLOW_MUTATION) return;

  const dbName = String(process.env.DB_NAME || '').trim();
  const looksDev = !dbName || /(test|dev|local|staging)/i.test(dbName);
  if (looksDev) return;

  if (process.env.REGRESSION_CONFIRM_PRODUCTION !== 'YES') {
    console.error(
      `\n拒绝写操作：DB_NAME="${dbName}" 不像开发/测试库。\n` +
        '若确需在非开发库运行 LIVE 模式，请额外设置 REGRESSION_CONFIRM_PRODUCTION=YES。\n'
    );
    process.exit(1);
  }
  console.warn(`\n警告：DB_NAME="${dbName}" 已确认允许 mutation（REGRESSION_CONFIRM_PRODUCTION=YES）\n`);
}

async function countGradingJobs() {
  const [rows] = await pool.query('SELECT COUNT(*) AS c FROM grading_jobs');
  return Number(rows[0]?.c) || 0;
}

async function countGradingJobItems() {
  const [rows] = await pool.query('SELECT COUNT(*) AS c FROM grading_job_items');
  return Number(rows[0]?.c) || 0;
}

function printModeBanner() {
  if (LIVE_AI_MODE) {
    console.log('=== regression:grading LIVE AI MODE ===');
    console.log('警告：本模式会创建真实 grading_jobs，并可能调用 LLM / BullMQ');
    console.log('');
    return;
  }

  console.log('=== regression:grading SAFE MODE ===');
  console.log('不会创建真实 AI 批改任务');
  console.log('不会调用真实 LLM');
  console.log('不会 enqueue BullMQ');
  console.log('如需真实批改测试，请设置 REGRESSION_LIVE_AI=1 REGRESSION_ALLOW_MUTATION=1');
  console.log('  或：npm run regression:grading:live');
  console.log('');
}

async function findTeacherForSubmission(submissionId) {
  const [rows] = await pool.query(
    `
    SELECT u.id, u.username
    FROM submissions s
    JOIN tasks t ON t.id = s.task_id
    LEFT JOIN courses c ON c.id = t.course_id
    LEFT JOIN teaching_class_teachers tct ON tct.teaching_class_id = t.teaching_class_id
    JOIN users u ON u.role = 'teacher' AND (
      u.id = t.created_by OR u.id = c.leader_id OR u.id = tct.teacher_id
    )
    WHERE s.id = ?
    LIMIT 1
  `,
    [submissionId]
  );
  return rows[0] || null;
}

async function findSampleSubmission() {
  const [rows] = await pool.query(`
    ${SUBMISSION_SELECT_SQL}
    LEFT JOIN grading_results gr ON gr.submission_id = s.id
    WHERE (gr.id IS NULL OR gr.status IN ('pending', 'ai_failed'))
      AND (s.safety_status IS NULL OR s.safety_status IN ('passed', 'manual_approved'))
      AND NOT EXISTS (
        SELECT 1 FROM grading_job_items i
        INNER JOIN grading_jobs j ON j.id = i.job_id
        WHERE i.submission_id = s.id
          AND i.status IN ('pending', 'queued', 'running')
          AND j.status IN ('pending', 'running')
      )
    ORDER BY s.id DESC
  `);
  const eligible = rows.find(submissionPassesCodeRunGradingGate);
  if (eligible) {
    return { id: eligible.id, task_id: eligible.task_id, _reason: 'passes_code_run_grading_gate' };
  }
  return null;
}

async function findCompletedAiSubmission() {
  const [rows] = await pool.query(`
    ${SUBMISSION_SELECT_SQL}
    INNER JOIN grading_results gr ON gr.submission_id = s.id
    WHERE gr.status IN ('ai_graded', 'human_graded')
      AND (s.safety_status IS NULL OR s.safety_status IN ('passed', 'manual_approved'))
    ORDER BY s.id DESC
    LIMIT 5
  `);
  for (const row of rows) {
    if (submissionPassesCodeRunGradingGate(row)) return row;
  }
  return rows[0] || null;
}

async function findSubmissionBlockedByCodeRunGate() {
  const [rows] = await pool.query(
    `${SUBMISSION_SELECT_SQL} WHERE t.code_run_enabled = 1 ORDER BY s.id DESC`
  );
  for (const row of rows) {
    if (submissionPassesCodeRunGradingGate(row)) continue;

    const [subRows] = await pool.query(
      'SELECT code_run_bound_hash, code_content_hash, student_id, task_id FROM submissions WHERE id = ?',
      [row.id]
    );
    const sub = subRows[0];
    if (!sub) continue;
    const hash = sub.code_run_bound_hash || sub.code_content_hash;
    if (!hash) return row;

    const [jobs] = await pool.query(
      `
      SELECT j.id FROM code_run_jobs j
      INNER JOIN code_run_results r ON r.job_id = j.id
      WHERE j.task_id = ? AND j.student_id = ? AND j.code_hash = ?
        AND j.source_type = 'inline'
        AND j.status IN ('completed', 'failed', 'timeout')
      LIMIT 1
    `,
      [sub.task_id, sub.student_id, hash]
    );
    if (!jobs.length) return row;
  }
  return null;
}

async function findSubmissionHealableByCodeRun() {
  const [rows] = await pool.query(
    `${SUBMISSION_SELECT_SQL} WHERE t.code_run_enabled = 1 AND s.code_run_result_id IS NULL ORDER BY s.id DESC`
  );
  for (const row of rows) {
    const cfg = parseTaskCodeRunConfig(row.code_run_config);
    if (!cfg.gradeAfterRun) continue;
    const [subRows] = await pool.query(
      'SELECT code_run_bound_hash, code_content_hash, student_id, task_id FROM submissions WHERE id = ?',
      [row.id]
    );
    const sub = subRows[0];
    if (!sub) continue;
    const hash = sub.code_run_bound_hash || sub.code_content_hash;
    if (!hash) continue;
    const [jobs] = await pool.query(
      `
      SELECT j.id FROM code_run_jobs j
      INNER JOIN code_run_results r ON r.job_id = j.id
      WHERE j.task_id = ? AND j.student_id = ? AND j.code_hash = ?
        AND j.source_type = 'inline'
        AND j.status IN ('completed', 'failed', 'timeout')
      LIMIT 1
    `,
      [sub.task_id, sub.student_id, hash]
    );
    if (jobs.length) return row;
  }
  return null;
}

async function findTaskWithUngraded(teacherId) {
  const [rows] = await pool.query(`
    SELECT t.id AS task_id, t.code_run_enabled, t.code_run_config, COUNT(*) AS ungraded
    FROM tasks t
    JOIN submissions s ON s.task_id = t.id
    LEFT JOIN grading_results gr ON gr.submission_id = s.id
    WHERE gr.id IS NULL
    GROUP BY t.id, t.code_run_enabled, t.code_run_config
    HAVING ungraded > 0
    ORDER BY t.id DESC
  `);
  for (const row of rows) {
    const owned = await teacherOwnsTaskForGrading(teacherId, row.task_id);
    if (!owned) continue;
    if (!Number(row.code_run_enabled)) return row;
    const cfg = parseTaskCodeRunConfig(row.code_run_config);
    if (!cfg.gradeAfterRun) return row;
  }
  return null;
}

async function findStudentUserId() {
  const [rows] = await pool.query(`SELECT id FROM users WHERE role = 'student' LIMIT 1`);
  return rows[0]?.id;
}

async function testServiceLayerSingle(teacherId, submissionId) {
  if (!LIVE_AI_MODE) {
    const owned = await teacherOwnsSubmissionTask(teacherId, submissionId);
    if (!owned) {
      fail('单份批改资格检查', 'teacherOwnsSubmissionTask 返回 false');
      return;
    }

    const r = await gradingJobService.createSingleJob({
      submissionId,
      userId: teacherId,
      role: 'teacher',
      dryRun: true,
    });
    if (r?.dryRun && r.wouldCreateJob) {
      ok(`单份批改资格检查通过（safe mode，未创建真实 job，submission=${submissionId}）`);
    } else {
      fail('单份批改 dryRun', JSON.stringify(r));
    }

    try {
      assertNewAiGradeAllowed({
        gradingStatus: 'pending',
        activeItemStatus: 'queued',
        forceRegrade: false,
      });
      fail('单份重复提交应返回 409', 'assertNewAiGradeAllowed 未抛出');
    } catch (e) {
      if (e.status === 409) ok('单份重复提交逻辑返回 409（safe mode，未创建 job）');
      else fail('单份重复提交应返回 409', `status=${e.status} ${e.message}`);
    }
    return;
  }

  console.log('  LIVE_AI 模式：正在创建真实单份批改任务…');
  const r1 = await gradingJobService.createSingleJob({
    submissionId,
    userId: teacherId,
    role: 'teacher',
  });
  const body = buildLegacyAiResponse(r1);
  assertNoErrors('单份 createSingleJob → 旧契约 data', assertLegacyAiGradeData(body.data));
  console.log(`  LIVE_AI 模式：已创建真实批改任务 jobId=${r1.jobId}`);

  try {
    await gradingJobService.createSingleJob({
      submissionId,
      userId: teacherId,
      role: 'teacher',
    });
    fail('单份重复提交应返回 409', '未抛出冲突');
  } catch (e) {
    if (e.status === 409) ok('单份重复提交返回 409');
    else fail('单份重复提交应返回 409', `status=${e.status} ${e.message}`);
  }
}

async function testServiceLayerDuplicateBlock(teacherId, completedRow) {
  if (!completedRow) {
    console.log('  · 已完成 AI 样本：无 ai_graded/human_graded 提交，跳过重复拦截测试');
    return;
  }

  const eligibility = await loadSubmissionEligibilityRow(completedRow.id);
  const gradingStatus = eligibility?.grading_status || completedRow.grading_status;

  try {
    await gradingJobService.createSingleJob({
      submissionId: completedRow.id,
      userId: teacherId,
      role: 'teacher',
      dryRun: !LIVE_AI_MODE,
    });
    if (LIVE_AI_MODE) {
      fail('已完成提交普通 createSingleJob 应拒绝', '未抛出 400');
    } else {
      fail('已完成提交 dryRun 应拒绝', '未抛出 400');
    }
  } catch (e) {
    if (e.status === 400 && ['ai_completed', 'teacher_reviewed'].includes(e.reasonCode)) {
      ok(`已批改提交默认拒绝重复 AI 批改（submission=${completedRow.id}，status=${gradingStatus}）`);
    } else {
      fail('已完成提交普通 createSingleJob 应拒绝', `status=${e.status} ${e.message}`);
    }
  }
}

async function testServiceLayerForceRegrade(teacherId, completedRow) {
  if (!completedRow) return;

  const eligibility = await loadSubmissionEligibilityRow(completedRow.id);
  const gradingStatus = eligibility?.grading_status || 'pending';

  try {
    assertNewAiGradeAllowed({
      gradingStatus,
      activeItemStatus: eligibility?.active_item_status || null,
      forceRegrade: true,
    });
    ok(`forceRegrade 逻辑允许（gradingStatus=${gradingStatus}）`);
  } catch (e) {
    if (e.status === 409) {
      ok(`forceRegrade 遇进行中任务逻辑返回 409（submission=${completedRow.id}）`);
      return;
    }
    fail('forceRegrade 逻辑检查', e.message);
    return;
  }

  if (!LIVE_AI_MODE) {
    const r = await gradingJobService.createSingleJob({
      submissionId: completedRow.id,
      userId: teacherId,
      role: 'teacher',
      forceRegrade: true,
      regradeReason: 'teacher_manual_regrade',
      dryRun: true,
    });
    if (r?.dryRun && r.wouldCreateJob) {
      ok(`forceRegrade 逻辑检查通过（safe mode，未创建真实重批任务，submission=${completedRow.id}）`);
    } else {
      fail('forceRegrade dryRun', JSON.stringify(r));
    }
    return;
  }

  console.warn(
    `  LIVE_AI 模式：正在对已批改提交 submission=${completedRow.id} 执行真实 forceRegrade，可能覆盖 AI 结果`
  );
  try {
    const r = await gradingJobService.createSingleJob({
      submissionId: completedRow.id,
      userId: teacherId,
      role: 'teacher',
      forceRegrade: true,
      regradeReason: 'teacher_manual_regrade',
    });
    if (r?.jobId) {
      ok(`forceRegrade 允许重新批改（submission=${completedRow.id}）`);
      console.log(`  LIVE_AI 模式：已创建真实 forceRegrade 任务 jobId=${r.jobId}`);
    } else fail('forceRegrade 重新批改', '未返回 jobId');
  } catch (e) {
    if (e.status === 409) {
      ok(`forceRegrade 遇进行中任务返回 409（submission=${completedRow.id}）`);
    } else {
      fail('forceRegrade 重新批改', e.message);
    }
  }
}

async function testServiceLayerBatch(teacherId, taskId) {
  if (!taskId) return;

  if (!LIVE_AI_MODE) {
    try {
      const r = await gradingJobService.createBatchJob({
        taskId,
        userId: teacherId,
        role: 'teacher',
        dryRun: true,
      });
      if (r?.dryRun) {
        ok(
          `批量批改资格检查通过（safe mode，wouldCreateJob=${r.wouldCreateJob}，queued=${r.queued}，task=${taskId}）`
        );
      } else {
        fail('批量 dryRun', JSON.stringify(r));
      }
    } catch (e) {
      if (e.status === 403) {
        console.log('  · 批量：教师无权该任务，跳过 createBatchJob');
        return;
      }
      throw e;
    }
    return;
  }

  try {
    const r = await gradingJobService.createBatchJob({
      taskId,
      userId: teacherId,
      role: 'teacher',
    });
    const body = buildLegacyBatchResponse(r, taskId);
    assertNoErrors('批量 createBatchJob → 旧契约 data', assertLegacyBatchGradeData(body.data));

    if (r.batchId && r.jobId) {
      const prog = await gradingJobService.getProgressByLegacyBatchId(r.batchId);
      if (prog && Number(prog.id) === Number(r.jobId)) ok('legacy_batch_id 与 batch-progress 源一致');
      else fail('legacy_batch_id 映射', 'job 行未找到');
      console.log(`  LIVE_AI 模式：已创建真实批量批改任务 jobId=${r.jobId}`);
    } else if (r.queued === 0) {
      ok('批量无可批改项（跳过 batchId 校验）');
    }
  } catch (e) {
    if (e.status === 403) {
      console.log('  · 批量：教师无权该任务，跳过 createBatchJob');
      return;
    }
    throw e;
  }
}

async function testStudentForbidden(studentId, submissionId) {
  try {
    await gradingJobService.createSingleJob({
      submissionId,
      userId: studentId,
      role: 'student',
      dryRun: !LIVE_AI_MODE,
    });
    fail('学生禁止创建 job', '未抛出 403');
  } catch (e) {
    if (e.status === 403) ok('学生禁止创建 AI 批改 job');
    else fail('学生禁止创建 job', e.message);
  }
}

async function testCodeRunGateBlocksAiGrading(teacherId, blockedRow) {
  if (!blockedRow) {
    console.log('  · code_run 门禁：无「不可自愈且缺结果」样本，跳过拒绝测试');
    return;
  }
  try {
    await gradingJobService.createSingleJob({
      submissionId: blockedRow.id,
      userId: teacherId,
      role: 'teacher',
      dryRun: !LIVE_AI_MODE,
    });
    fail('code_run 未完成应拒绝 AI 批改', '未抛出 400');
  } catch (e) {
    const msg = e.message || '';
    if (e.status === 400 && /代码运行/.test(msg)) {
      ok(`code_run 未完成拒绝 AI 批改（submission=${blockedRow.id}）`);
    } else {
      fail('code_run 未完成拒绝 AI 批改', `status=${e.status} ${msg}`);
    }
  }
}

async function testCodeRunSelfHealAllowsGrading(teacherId, healableRow) {
  if (!healableRow) {
    console.log('  · code_run 自愈：无可自愈样本，跳过');
    return;
  }

  if (!LIVE_AI_MODE) {
    ok(
      `code_run 自愈样本存在 pre-submit 运行结果（safe mode 只读确认，submission=${healableRow.id}，未创建 job）`
    );
    return;
  }

  try {
    const r = await gradingJobService.createSingleJob({
      submissionId: healableRow.id,
      userId: teacherId,
      role: 'teacher',
    });
    if (r?.jobId) ok(`code_run 自愈绑定后允许 AI 批改（submission=${healableRow.id}）`);
    else fail('code_run 自愈后批改', '未返回 jobId');
  } catch (e) {
    fail('code_run 自愈后应允许批改', e.message);
  }
}

async function testGradingJobNotification(teacherId) {
  if (!LIVE_AI_MODE) {
    console.log('  · 通知中心：safe mode 跳过（会写入 grading_jobs / notifications）');
    return;
  }

  async function insertJob(status, success, failed, message) {
    const [jr] = await pool.query(
      `INSERT INTO grading_jobs
        (created_by, task_id, scope_type, status, total_count, finished_count, success_count, failed_count, progress, message)
       VALUES (?, NULL, 'single', ?, 3, 3, ?, ?, 100, ?)`,
      [teacherId, status, success, failed, message]
    );
    return jr.insertId;
  }

  async function countNotifs(jobId) {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND ref_type = 'grading_job' AND ref_id = ?`,
      [teacherId, jobId]
    );
    return Number(rows[0]?.c) || 0;
  }

  for (const [status, type, success, failed] of [
    ['completed', 'grade_job_completed', 3, 0],
    ['partial_failed', 'grade_job_partial', 2, 1],
    ['failed', 'grade_job_failed', 0, 3],
    ['cancelled', 'grade_job_cancelled', 0, 0],
  ]) {
    const jobId = await insertJob(status, success, failed, `回归-${status}`);
    const before = await countNotifs(jobId);
    await notifyJobTerminal(jobId);
    const after = await countNotifs(jobId);
    const [row] = await pool.query(
      `SELECT type FROM notifications WHERE user_id = ? AND ref_type = 'grading_job' AND ref_id = ? ORDER BY id DESC LIMIT 1`,
      [teacherId, jobId]
    );
    if (after > before && row[0]?.type === type) ok(`通知 ${type} (ref_type=grading_job)`);
    else fail(`通知 ${type}`, `before=${before} after=${after} type=${row[0]?.type}`);
    await pool.query('DELETE FROM notifications WHERE ref_type = ? AND ref_id = ?', ['grading_job', jobId]);
    await pool.query('DELETE FROM grading_jobs WHERE id = ?', [jobId]);
  }
}

async function testGradingResultJsonShape(submissionId) {
  const [rows] = await pool.query(
    `SELECT gr.total_score, gr.dimension_scores, gr.verification_result,
            gr.ai_comment, gr.ai_suggestions, gr.status
     FROM grading_results gr WHERE gr.submission_id = ? LIMIT 1`,
    [submissionId]
  );
  if (!rows.length) {
    ok('grading_results JSON 形状（无记录，跳过）');
    return;
  }
  const row = rows[0];
  const checks = [];
  if (row.dimension_scores != null) {
    try {
      const dims = typeof row.dimension_scores === 'string' ? JSON.parse(row.dimension_scores) : row.dimension_scores;
      if (!Array.isArray(dims)) checks.push('dimension_scores 非数组');
    } catch {
      checks.push('dimension_scores JSON 无效');
    }
  }
  if (row.verification_result != null) {
    try {
      const vr =
        typeof row.verification_result === 'string'
          ? JSON.parse(row.verification_result)
          : row.verification_result;
      if (typeof vr !== 'object') checks.push('verification_result 非对象');
    } catch {
      checks.push('verification_result JSON 无效');
    }
  }
  const requiredFields = ['total_score', 'ai_comment', 'ai_suggestions', 'status'];
  for (const f of requiredFields) {
    if (!(f in row)) checks.push(`缺少 ${f}`);
  }
  if (!checks.length) ok('grading_results 核心 JSON 字段兼容');
  else fail('grading_results JSON', checks.join('; '));
}

function makeToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET || 'dev-secret',
    { expiresIn: '1h' }
  );
}

async function httpJson(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function testHttpLegacy(teacher, submission, taskId) {
  const token = makeToken({ id: teacher.id, username: teacher.username, role: 'teacher' });

  const ai = await httpJson('POST', `/api/grading/ai/${submission.id}`, { token });
  if (ai.json.success) {
    assertNoErrors('HTTP POST /grading/ai/:id data', assertLegacyAiGradeData(ai.json.data));
  } else {
    fail('HTTP POST /grading/ai/:id', ai.json.message || ai.status);
  }

  if (taskId) {
    const batch = await httpJson('POST', `/api/grading/batch/${taskId}`, { token });
    if (batch.json.success) {
      assertNoErrors('HTTP POST /grading/batch/:taskId data', assertLegacyBatchGradeData(batch.json.data));
      const batchId = batch.json.data?.batchId;
      if (batchId) {
        const prog = await httpJson('GET', `/api/grading/batch-progress/${batchId}`, { token });
        if (prog.json.success && prog.json.data) {
          const req = ['taskId', 'batchId', 'total', 'grading', 'failed', 'done'];
          const missing = req.filter((k) => !(k in prog.json.data));
          if (!missing.length) ok('HTTP GET batch-progress 旧字段完整');
          else fail('HTTP batch-progress', `缺少 ${missing.join(',')}`);
        } else {
          fail('HTTP batch-progress', prog.json.message);
        }
      }
    } else {
      fail('HTTP POST /grading/batch/:taskId', batch.json.message);
    }
  }

  const gr = await httpJson('GET', `/api/grading/${submission.id}`, { token });
  if (gr.status === 200 || (gr.status === 404 && gr.json.success)) {
    ok('HTTP GET /grading/:submissionId 可访问');
  } else {
    fail('HTTP GET /grading/:submissionId', gr.json.message || gr.status);
  }
}

async function main() {
  assertProductionMutationGuard();
  printModeBanner();

  jobsBefore = await countGradingJobs();
  itemsBefore = await countGradingJobItems();
  console.log(`grading_jobs=${jobsBefore}  grading_job_items=${itemsBefore}\n`);

  const sub = await findSampleSubmission();
  const completedSub = await findCompletedAiSubmission();
  if (!sub && !completedSub) {
    console.log('SKIP: 无可用 submission 数据，请先 seed:test');
    process.exit(0);
  }

  const blockedSub = await findSubmissionBlockedByCodeRunGate();
  const healableSub = await findSubmissionHealableByCodeRun();

  const teacher = sub
    ? await findTeacherForSubmission(sub.id)
    : completedSub
      ? await findTeacherForSubmission(completedSub.id)
      : null;
  if (!teacher) {
    console.log('SKIP: 找不到有权限的教师');
    process.exit(0);
  }

  const sampleNote = sub
    ? sub._reason === 'passes_code_run_grading_gate'
      ? '（未阻塞 AI 批改的样本）'
      : '（fallback：库中无更优样本）'
    : '（无未批改样本，仅测重复拦截）';
  console.log(
    `样本 submission=${sub?.id ?? '—'} completed=${completedSub?.id ?? '—'} teacher=${teacher.username} ${sampleNote}`
  );
  if (blockedSub) {
    console.log(`门禁样本 submission=${blockedSub.id}（不可自愈，应拒绝 AI 批改）`);
  }
  if (healableSub) {
    console.log(`自愈样本 submission=${healableSub.id}（pre-submit 运行结果可绑定）`);
  }
  console.log('');

  console.log('[服务层]');
  if (sub) {
    await testServiceLayerSingle(teacher.id, sub.id);
    await testGradingResultJsonShape(sub.id);
  } else {
    console.log('  · 单份 createSingleJob：无未批改样本，跳过');
  }
  if (completedSub) {
    const completedTeacher = await findTeacherForSubmission(completedSub.id);
    if (completedTeacher) {
      await testServiceLayerDuplicateBlock(completedTeacher.id, completedSub);
      await testServiceLayerForceRegrade(completedTeacher.id, completedSub);
    } else {
      console.log('  · 已完成 AI 样本：无可用教师，跳过重复拦截/forceRegrade 测试');
    }
  }

  const blockedTeacher = blockedSub ? await findTeacherForSubmission(blockedSub.id) : null;
  if (blockedTeacher) {
    await testCodeRunGateBlocksAiGrading(blockedTeacher.id, blockedSub);
  } else if (blockedSub) {
    console.log('  · code_run 门禁：blocked 样本无可用教师，跳过');
  }

  const healableTeacher = healableSub ? await findTeacherForSubmission(healableSub.id) : null;
  if (healableTeacher) {
    await testCodeRunSelfHealAllowsGrading(healableTeacher.id, healableSub);
  } else if (healableSub) {
    console.log('  · code_run 自愈：样本无可用教师，跳过');
  }

  const batchTask = await findTaskWithUngraded(teacher.id);
  if (batchTask) {
    await testServiceLayerBatch(teacher.id, batchTask.task_id);
  } else {
    console.log('  · 批量：无未批改提交，跳过 createBatchJob');
  }

  const studentId = await findStudentUserId();
  const anySubId = sub?.id ?? completedSub?.id;
  if (studentId && anySubId) await testStudentForbidden(studentId, anySubId);

  console.log('\n[通知中心]');
  await testGradingJobNotification(teacher.id);

  if (HTTP) {
    if (!LIVE_AI_MODE) {
      console.log('\n[HTTP] 跳过 POST 批改（safe mode；需 REGRESSION_LIVE_AI=1 REGRESSION_ALLOW_MUTATION=1）');
    } else {
      console.log(`\n[HTTP @ ${BASE}]`);
      try {
        if (sub) {
          await testHttpLegacy(teacher, sub, batchTask?.task_id || sub.task_id);
        } else {
          console.log('  · HTTP 单份：无未批改样本，跳过');
        }
      } catch (e) {
        fail('HTTP 回归', e.message);
      }
    }
  } else {
    console.log('\n[HTTP] 跳过（设置 REGRESSION_HTTP=1 且启动后端可测 HTTP 层）');
  }

  const jobsAfter = await countGradingJobs();
  const itemsAfter = await countGradingJobItems();
  console.log(`\ngrading_jobs: ${jobsBefore} → ${jobsAfter}  grading_job_items: ${itemsBefore} → ${itemsAfter}`);

  if (!LIVE_AI_MODE && (jobsAfter !== jobsBefore || itemsAfter !== itemsBefore)) {
    fail(
      'safe mode 数据保护',
      `grading_jobs/items 数量变化（jobs ${jobsBefore}→${jobsAfter}, items ${itemsBefore}→${itemsAfter}）`
    );
  }

  console.log(`\n=== 结果：${passed} 通过，${failed} 失败 ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
