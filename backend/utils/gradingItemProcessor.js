/**
 * 单个 grading_job_item 处理（BullMQ Worker 与 Legacy 共用核心逻辑）
 */
const pool = require('../config/database');
const { runSingleGrading, markGradingFailed } = require('./gradingQueue');
const { refreshJobAggregates, finalizeJob, getJobStatus } = require('./gradingJobAggregator');
const { pushJobProgressById } = require('./gradingJobNotify');
const { LlmCallError } = require('./llmClient');
const { isForceRegradeBatchMode } = require('./submissionAiBatchEligibility');

async function getItemRow(itemId) {
  const [rows] = await pool.query('SELECT * FROM grading_job_items WHERE id = ?', [itemId]);
  return rows[0] || null;
}

async function updateItemStage(itemId, stage) {
  await pool.query('UPDATE grading_job_items SET stage = ?, updated_at = NOW() WHERE id = ?', [
    stage,
    itemId,
  ]);
}

async function isJobCancelled(jobId) {
  const st = await getJobStatus(jobId);
  return st === 'cancelled';
}

function isItemCancelledOrCancelling(item) {
  if (!item) return false;
  if (item.status === 'cancelled') return true;
  return item.stage === 'cancelling';
}

async function claimItemRunning(itemId) {
  const [r] = await pool.query(
    `UPDATE grading_job_items SET status = 'running', stage = 'waiting', started_at = COALESCE(started_at, NOW()),
       attempt_count = attempt_count + 1, updated_at = NOW()
     WHERE id = ? AND status IN ('pending', 'queued', 'failed') AND (stage IS NULL OR stage != 'cancelling')`,
    [itemId]
  );
  return r.affectedRows > 0;
}

async function getJobBatchMode(jobId) {
  const [rows] = await pool.query('SELECT batch_mode FROM grading_jobs WHERE id = ?', [jobId]);
  return rows[0]?.batch_mode || '';
}

async function loadGradingResultStatus(submissionId) {
  const [rows] = await pool.query('SELECT status FROM grading_results WHERE submission_id = ?', [submissionId]);
  return rows[0]?.status || null;
}

async function markItemSkippedDuplicate(itemId, reason = 'duplicate_completed') {
  await pool.query(
    `UPDATE grading_job_items SET status = 'skipped', stage = 'skipped_duplicate', error_message = ?, finished_at = NOW()
     WHERE id = ? AND status NOT IN ('success', 'cancelled', 'skipped')`,
    [reason.slice(0, 480), itemId]
  );
}

async function finalizeSkippedDuplicateItem(gradingJobId, gradingJobItemId, submissionId, reason) {
  await markItemSkippedDuplicate(gradingJobItemId, reason);
  await refreshJobAggregates(gradingJobId);
  await pushJobProgressById(gradingJobId, 'item_done', { submissionId, skipped: true, reason: 'skipped_duplicate' });
  await finalizeJob(gradingJobId);
}

async function markItemCancelled(itemId, reason = '任务已取消') {
  await pool.query(
    `UPDATE grading_job_items SET status = 'cancelled', stage = 'cancelled', error_message = ?, finished_at = NOW()
     WHERE id = ? AND status != 'success'`,
    [reason.slice(0, 480), itemId]
  );
}

async function finalizeCancelledItem(gradingJobId, gradingJobItemId, reason = '任务已取消') {
  await markItemCancelled(gradingJobItemId, reason);
  await refreshJobAggregates(gradingJobId);
  await pushJobProgressById(gradingJobId, 'item_done', { cancelled: true });
  await finalizeJob(gradingJobId);
}

async function markItemSuccess(itemId, { aiScore, metrics }) {
  await pool.query(
    `UPDATE grading_job_items SET status = 'success', stage = 'completed', error_message = NULL, error_type = NULL,
       ai_score = ?, duration_ms = ?, llm_cost_ms = ?, rag_cost_ms = ?, task_context_cost_ms = ?,
       save_cost_ms = ?, llm_tokens = ?, prompt_summarized = ?, finished_at = NOW()
     WHERE id = ? AND status NOT IN ('cancelled') AND (stage IS NULL OR stage != 'cancelling')`,
    [
      aiScore,
      metrics.durationMs ?? null,
      metrics.llmCostMs ?? null,
      metrics.ragCostMs ?? null,
      metrics.taskContextCostMs ?? null,
      metrics.saveCostMs ?? null,
      metrics.llmTokens ?? null,
      metrics.promptSummarized ? 1 : 0,
      itemId,
    ]
  );
}

async function markItemFailed(itemId, err, { incrementRetry = false } = {}) {
  const userMsg =
    err instanceof LlmCallError
      ? err.userMessage
      : String(err?.message || '未知错误').slice(0, 480);
  const errorType = err instanceof LlmCallError ? err.errorType : 'unknown';

  await pool.query(
    `UPDATE grading_job_items SET status = 'failed', stage = 'failed',
       error_message = ?, error_type = ?, last_error_message = ?,
       retry_count = retry_count + ?, finished_at = NOW()
     WHERE id = ? AND (stage IS NULL OR stage != 'cancelling')`,
    [userMsg.slice(0, 480), errorType, userMsg.slice(0, 480), incrementRetry ? 1 : 0, itemId]
  );
}

/**
 * @param {{ gradingJobId, gradingJobItemId, submissionId, taskId }} data
 * @param {{ attempt?: number, bullmqJobId?: string }} meta
 */
async function processGradingJobItem(data, meta = {}) {
  const gradingJobId = Number(data.gradingJobId);
  const gradingJobItemId = Number(data.gradingJobItemId);
  const submissionId = Number(data.submissionId);
  const started = Date.now();

  let item = await getItemRow(gradingJobItemId);
  if (!item) {
    console.warn('[gradingItemProcessor] item not found', gradingJobItemId);
    return { skipped: true, reason: 'missing_item' };
  }

  if (await isJobCancelled(gradingJobId) || isItemCancelledOrCancelling(item)) {
    await finalizeCancelledItem(gradingJobId, gradingJobItemId);
    return { skipped: true, reason: 'cancelled' };
  }

  if (item.status === 'success') {
    return { skipped: true, reason: 'already_success' };
  }
  if (item.status === 'cancelled' || item.status === 'skipped') {
    return { skipped: true, reason: item.status };
  }
  if (item.stage === 'cancelling') {
    await finalizeCancelledItem(gradingJobId, gradingJobItemId);
    return { skipped: true, reason: 'cancelled' };
  }

  const claimed = await claimItemRunning(gradingJobItemId);
  if (!claimed) {
    item = await getItemRow(gradingJobItemId);
    if (isItemCancelledOrCancelling(item)) {
      await finalizeCancelledItem(gradingJobId, gradingJobItemId);
      return { skipped: true, reason: 'cancelled' };
    }
    return { skipped: true, reason: 'claim_failed' };
  }

  if (meta.bullmqJobId) {
    await pool.query('UPDATE grading_job_items SET bullmq_job_id = ? WHERE id = ?', [
      String(meta.bullmqJobId).slice(0, 128),
      gradingJobItemId,
    ]);
  }

  await pool.query(
    `UPDATE grading_jobs SET status = 'running', started_at = COALESCE(started_at, NOW()), message = '批改任务执行中'
     WHERE id = ? AND status IN ('pending', 'running', 'partial_failed', 'failed', 'completed')`,
    [gradingJobId]
  );

  const metrics = {
    durationMs: 0,
    llmCostMs: 0,
    ragCostMs: 0,
    taskContextCostMs: 0,
    saveCostMs: 0,
    llmTokens: null,
    promptSummarized: false,
  };

  try {
    const onStage = (stage) => updateItemStage(gradingJobItemId, stage);

    item = await getItemRow(gradingJobItemId);
    if (!item || item.status === 'success' || item.status === 'skipped' || item.status === 'cancelled') {
      return { skipped: true, reason: item?.status || 'missing_item' };
    }
    if (isItemCancelledOrCancelling(item) || (await isJobCancelled(gradingJobId))) {
      await finalizeCancelledItem(gradingJobId, gradingJobItemId);
      return { skipped: true, reason: 'cancelled' };
    }

    const batchMode = await getJobBatchMode(gradingJobId);
    const forceRegrade = isForceRegradeBatchMode(batchMode);
    const grStatus = await loadGradingResultStatus(submissionId);
    if ((grStatus === 'ai_graded' || grStatus === 'human_graded') && !forceRegrade) {
      await finalizeSkippedDuplicateItem(
        gradingJobId,
        gradingJobItemId,
        submissionId,
        `duplicate:${grStatus}`
      );
      return { skipped: true, reason: 'skipped_duplicate' };
    }

    const result = await runSingleGrading(submissionId, {
      onStage,
      metrics,
      gradingJobId,
      gradingJobItemId,
    });

    item = await getItemRow(gradingJobItemId);
    if (await isJobCancelled(gradingJobId) || isItemCancelledOrCancelling(item)) {
      await finalizeCancelledItem(gradingJobId, gradingJobItemId, '任务已取消，结果未采纳');
      return { skipped: true, reason: 'cancelled_after_run' };
    }

    metrics.durationMs = Date.now() - started;
    const aiScore = result?.gradingResult?.totalScore ?? null;
    await markItemSuccess(gradingJobItemId, { aiScore, metrics });

    item = await getItemRow(gradingJobItemId);
    if (item?.status !== 'success') {
      return { skipped: true, reason: 'cancelled_before_success' };
    }

    await refreshJobAggregates(gradingJobId);
    await pushJobProgressById(gradingJobId, 'item_done', { submissionId });
    await finalizeJob(gradingJobId);

    return { ok: true, submissionId, aiScore };
  } catch (e) {
    item = await getItemRow(gradingJobItemId);
    if (isItemCancelledOrCancelling(item) || (await isJobCancelled(gradingJobId))) {
      await finalizeCancelledItem(gradingJobId, gradingJobItemId);
      return { skipped: true, reason: 'cancelled_on_error' };
    }

    metrics.durationMs = Date.now() - started;
    const msg = e instanceof LlmCallError ? e.userMessage : e?.message || '未知错误';
    try {
      await markGradingFailed(submissionId, msg);
    } catch {
      /* ignore */
    }
    await markItemFailed(gradingJobItemId, e, { incrementRetry: false });

    console.error('[gradingItemProcessor] failed', {
      gradingJobId,
      gradingJobItemId,
      submissionId,
      attempt: meta.attempt,
      costMs: metrics.durationMs,
      errorType: e instanceof LlmCallError ? e.errorType : 'unknown',
    });

    await refreshJobAggregates(gradingJobId);
    await pushJobProgressById(gradingJobId, 'item_done', { submissionId, failed: true });
    await finalizeJob(gradingJobId);

    throw e;
  }
}

module.exports = {
  processGradingJobItem,
  markItemCancelled,
};
