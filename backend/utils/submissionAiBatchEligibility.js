const pool = require('../config/database');
const { teacherOwnsSubmissionTask } = require('./accessControl');
const { assertSubmissionCodeRunReadyForGrading } = require('./codeRunWorkText');

const REASON_MESSAGES = {
  not_submitted: '未提交，无法 AI 批改',
  ai_completed: '已完成 AI 批改，不能重复批改',
  ai_running: 'AI 批改中，请勿重复提交',
  ai_queued: '已进入批改队列，请等待完成',
  teacher_review_pending: 'AI 已完成，等待教师复核',
  teacher_reviewed: '已人工复核，不能重复批改',
  safety_review_required: '内容安全待复核，暂不能 AI 批改',
  safety_blocked: '内容安全未通过，不能 AI 批改',
  code_run_required: '代码运行检查未完成，暂不能 AI 批改',
  no_permission: '当前账号无权限批改该提交',
  wrong_task: '提交不属于该任务',
  eligible: '',
};

function ineligible(reasonCode, reason) {
  return {
    eligible: false,
    reasonCode,
    reason: reason || REASON_MESSAGES[reasonCode] || reasonCode,
  };
}

function eligibleResult() {
  return { eligible: true, reasonCode: 'eligible', reason: '' };
}

function isCodeRunSummaryBlocking(summary, codeRunEnabled) {
  if (!codeRunEnabled) return false;
  const s = String(summary || '').trim();
  if (!s) return true;
  if (s === '排队中…' || s === '未运行') return true;
  if (/排队|运行中|执行中/.test(s)) return true;
  return false;
}

async function loadSubmissionEligibilityRow(submissionId) {
  const [rows] = await pool.query(
    `
    SELECT s.id, s.task_id, s.student_id, s.safety_status, s.code_run_summary,
           gr.status AS grading_status,
           t.code_run_enabled,
           (
             SELECT i.status
             FROM grading_job_items i
             INNER JOIN grading_jobs j ON j.id = i.job_id
             WHERE i.submission_id = s.id
               AND i.status IN ('pending', 'queued', 'running')
               AND j.status IN ('pending', 'running')
             ORDER BY i.id DESC
             LIMIT 1
           ) AS active_item_status
    FROM submissions s
    LEFT JOIN grading_results gr ON gr.submission_id = s.id
    INNER JOIN tasks t ON t.id = s.task_id
    WHERE s.id = ?
  `,
    [submissionId]
  );
  return rows[0] || null;
}

function evaluateSubmissionRowEligibility(row, codeRunEnabled = false) {
  if (!row) {
    return ineligible('not_submitted');
  }

  const gradingStatus = row.grading_status || row.status || 'pending';
  const activeItem = row.active_item_status || row.active_grading_item_status || null;
  const runEnabled =
    codeRunEnabled !== undefined && codeRunEnabled !== null
      ? Boolean(Number(codeRunEnabled))
      : Boolean(Number(row.code_run_enabled));

  if (gradingStatus === 'human_graded') {
    return ineligible('teacher_reviewed');
  }

  if (gradingStatus === 'ai_graded') {
    return ineligible('teacher_review_pending');
  }

  if (['pending', 'queued'].includes(activeItem)) {
    return ineligible('ai_queued');
  }

  if (activeItem === 'running' || (gradingStatus === 'ai_grading' && activeItem)) {
    return ineligible('ai_running');
  }

  const safety = row.safety_status || 'passed';
  if (safety === 'pending_review') {
    return ineligible('safety_review_required');
  }
  if (safety === 'rejected' || safety === 'manual_rejected') {
    return ineligible('safety_blocked');
  }

  if (isCodeRunSummaryBlocking(row.code_run_summary, runEnabled)) {
    return ineligible('code_run_required');
  }

  return eligibleResult();
}

function attachListEligibilityFields(row, codeRunEnabled) {
  const verdict = evaluateSubmissionRowEligibility(row, codeRunEnabled);
  return {
    ...row,
    aiBatchEligible: verdict.eligible,
    aiBatchDisabledReasonCode: verdict.eligible ? null : verdict.reasonCode,
    aiBatchDisabledReason: verdict.eligible ? null : verdict.reason,
  };
}

async function evaluateSubmissionAiBatchEligibility(submissionId, { userId, role, taskId } = {}) {
  const sid = Number(submissionId);
  if (!Number.isFinite(sid) || sid <= 0) {
    return ineligible('not_submitted');
  }

  const row = await loadSubmissionEligibilityRow(sid);
  if (!row) {
    return ineligible('not_submitted');
  }

  if (taskId != null && Number(row.task_id) !== Number(taskId)) {
    return ineligible('wrong_task');
  }

  if (role === 'teacher') {
    const ok = await teacherOwnsSubmissionTask(userId, sid);
    if (!ok) {
      return ineligible('no_permission');
    }
  } else if (role !== 'admin') {
    return ineligible('no_permission');
  }

  const base = evaluateSubmissionRowEligibility(row);
  if (!base.eligible) {
    return base;
  }

  const codeRunGate = await assertSubmissionCodeRunReadyForGrading(sid);
  if (!codeRunGate.ok) {
    return ineligible('code_run_required', codeRunGate.message || REASON_MESSAGES.code_run_required);
  }

  return eligibleResult();
}

async function resolveSelectedSubmissions(taskId, submissionIds, userId, role) {
  const accepted = [];
  const skipped = [];
  const seen = new Set();

  for (const rawId of submissionIds || []) {
    const sid = Number(rawId);
    if (!Number.isFinite(sid) || sid <= 0 || seen.has(sid)) continue;
    seen.add(sid);

    const verdict = await evaluateSubmissionAiBatchEligibility(sid, { userId, role, taskId });
    if (verdict.eligible) {
      const row = await loadSubmissionEligibilityRow(sid);
      if (row) {
        accepted.push({ id: row.id, student_id: row.student_id });
      } else {
        skipped.push({ submissionId: sid, reason: REASON_MESSAGES.not_submitted, reasonCode: 'not_submitted' });
      }
    } else {
      skipped.push({
        submissionId: sid,
        reason: verdict.reason,
        reasonCode: verdict.reasonCode,
      });
    }
  }

  return { accepted, skipped };
}

function matchesEligibleFilter(row, filterKey, lateStudentIds) {
  const key = filterKey || 'all';
  if (key === 'all') return true;
  if (key === 'submitted') return true;
  if (key === 'late') return lateStudentIds.has(Number(row.student_id));
  const st = row.grading_status || row.status || 'pending';
  if (key === 'pending_ai') {
    return !st || st === 'pending' || st === 'ai_failed' || st === 'ai_grading';
  }
  if (key === 'pending_review') return st === 'ai_graded';
  if (key === 'completed') return st === 'human_graded';
  return true;
}

async function listEligibleSubmissionsForTask({ taskId, userId, role, filterKey = 'all', lateStudentIds = [] }) {
  const tid = Number(taskId);
  if (role === 'teacher') {
    const { teacherOwnsTaskForGrading } = require('./accessControl');
    const task = await teacherOwnsTaskForGrading(userId, tid);
    if (!task) {
      const err = new Error('无权查看该任务提交');
      err.status = 403;
      throw err;
    }
  } else if (role !== 'admin') {
    const err = new Error('权限不足');
    err.status = 403;
    throw err;
  }

  const lateSet = new Set((lateStudentIds || []).map((x) => Number(x)));

  const [taskRows] = await pool.query('SELECT code_run_enabled FROM tasks WHERE id = ?', [tid]);
  const codeRunEnabled = Boolean(Number(taskRows[0]?.code_run_enabled));

  const [rows] = await pool.query(
    `
    SELECT s.id, s.student_id, s.safety_status, s.code_run_summary,
           gr.status AS grading_status,
           (
             SELECT i.status
             FROM grading_job_items i
             INNER JOIN grading_jobs j ON j.id = i.job_id
             WHERE i.submission_id = s.id
               AND i.status IN ('pending', 'queued', 'running')
               AND j.status IN ('pending', 'running')
             ORDER BY i.id DESC
             LIMIT 1
           ) AS active_item_status
    FROM submissions s
    LEFT JOIN grading_results gr ON gr.submission_id = s.id
    WHERE s.task_id = ?
    ORDER BY s.id ASC
  `,
    [tid]
  );

  const skippedSummary = {};
  const submissionIds = [];

  for (const row of rows) {
    if (!matchesEligibleFilter(row, filterKey, lateSet)) continue;
    const verdict = evaluateSubmissionRowEligibility(row, codeRunEnabled);
    if (verdict.eligible) {
      submissionIds.push(Number(row.id));
    } else {
      skippedSummary[verdict.reasonCode] = (skippedSummary[verdict.reasonCode] || 0) + 1;
    }
  }

  return {
    totalEligible: submissionIds.length,
    submissionIds,
    skippedSummary,
    filterKey: filterKey || 'all',
  };
}

const FORCE_REGRADE_BATCH_MODES = new Set(['regrade_all', 'force_regrade', 'retry_failed']);

function isForceRegradeBatchMode(batchMode) {
  return FORCE_REGRADE_BATCH_MODES.has(String(batchMode || ''));
}

/**
 * 普通 AI 批改入队前校验（不含权限/内容安全/代码运行门禁）。
 * @throws {Error & { status?: number, reasonCode?: string }}
 */
function assertNewAiGradeAllowed({ gradingStatus, activeItemStatus, forceRegrade = false }) {
  const st = gradingStatus || 'pending';
  const activeItem = activeItemStatus || null;

  if (['pending', 'queued', 'running'].includes(activeItem)) {
    const err = new Error('该提交已有 AI 批改任务正在进行中，请勿重复提交');
    err.status = 409;
    err.reasonCode = 'ai_queued';
    throw err;
  }

  if (!forceRegrade) {
    if (st === 'human_graded') {
      const err = new Error('该提交已人工复核，不能通过普通 AI 批改重复处理');
      err.status = 400;
      err.reasonCode = 'teacher_reviewed';
      throw err;
    }
    if (st === 'ai_graded') {
      const err = new Error('该提交已完成 AI 批改，如需重新批改请使用「重新批改」功能');
      err.status = 400;
      err.reasonCode = 'ai_completed';
      throw err;
    }
  }
}

module.exports = {
  REASON_MESSAGES,
  evaluateSubmissionRowEligibility,
  evaluateSubmissionAiBatchEligibility,
  resolveSelectedSubmissions,
  loadSubmissionEligibilityRow,
  attachListEligibilityFields,
  isCodeRunSummaryBlocking,
  listEligibleSubmissionsForTask,
  assertNewAiGradeAllowed,
  isForceRegradeBatchMode,
  FORCE_REGRADE_BATCH_MODES,
};
