/**
 * 异步构建知识图谱：规则采集 → DeepSeek 抽取 → 向量语义边 → MariaDB → Neo4j
 */

const pool = require('../config/database');
const kgGraphStore = require('./kgGraphStore');
const { collectRuleNodesAndEdges, buildCorpusForScope } = require('./kgMariaDbSourceService');
const { extractGraphFromCorpus } = require('./kgDeepSeekExtractService');
const { enrichSemanticLinks } = require('./kgSemanticLinkService');
const { syncAllToNeo4j } = require('./kgNeo4jSyncService');

function emitKg(meta, action, extra = {}) {
  try {
    const rt = require('../utils/realtimeEmit');
    rt.emitGradingProgress({
      domain: 'kg',
      action,
      ts: Date.now(),
      ...meta,
      ...extra,
    });
  } catch {
    /* ignore */
  }
}

async function updateJob(jobId, patch) {
  const fields = [];
  const vals = [];
  for (const [k, v] of Object.entries(patch)) {
    fields.push(`${k} = ?`);
    vals.push(v);
  }
  vals.push(jobId);
  await pool.query(`UPDATE kg_build_jobs SET ${fields.join(', ')} WHERE id = ?`, vals);
}

async function runBuildJob(jobId) {
  const [jobs] = await pool.query('SELECT * FROM kg_build_jobs WHERE id = ? LIMIT 1', [jobId]);
  if (!jobs.length) return;
  const job = jobs[0];
  if (job.status !== 'pending') return;

  const claimed = await pool.query(
    `UPDATE kg_build_jobs SET status = 'processing', started_at = NOW(), progress = 5, message = '采集中' WHERE id = ? AND status = 'pending'`,
    [jobId]
  );
  if (!claimed[0]?.affectedRows) return;

  const meta = { jobId, scopeType: job.scope_type, scopeId: job.scope_id };
  emitKg(meta, 'kg_build_start');

  try {
    const rule = await collectRuleNodesAndEdges(job.scope_type, job.scope_id);
    await kgGraphStore.upsertNodes(rule.nodes);
    await kgGraphStore.upsertEdges(rule.edges);
    await updateJob(jobId, { progress: 30, message: '规则节点已写入' });

    const corpus = await buildCorpusForScope(job.scope_type, job.scope_id);
    const extracted = await extractGraphFromCorpus(corpus);
    if (extracted.nodes?.length) {
      await kgGraphStore.mergeExtractPayload(extracted);
    }
    await updateJob(jobId, { progress: 55, message: 'DeepSeek 抽取完成' });

    const kpIds = (await kgGraphStore.listNodes({ nodeType: 'knowledge_point', limit: 500 })).map(
      (n) => n.id
    );
    await enrichSemanticLinks(kpIds);
    await updateJob(jobId, { progress: 75, message: '语义关联完成' });

    await syncAllToNeo4j();
    await kgGraphStore.updateSyncState({ last_full_sync_at: new Date() });

    await updateJob(jobId, {
      status: 'done',
      progress: 100,
      message: '构建完成',
      finished_at: new Date(),
    });
    emitKg(meta, 'kg_build_done');
  } catch (e) {
    const msg = e && e.message ? e.message : '构建失败';
    await updateJob(jobId, {
      status: 'failed',
      error_message: msg.slice(0, 480),
      message: '构建失败',
      finished_at: new Date(),
    });
    emitKg(meta, 'kg_build_failed', { message: msg });
    throw e;
  }
}

async function createBuildJob({ scopeType, scopeId, requestedBy }) {
  const [r] = await pool.query(
    `INSERT INTO kg_build_jobs (scope_type, scope_id, status, requested_by, message)
     VALUES (?, ?, 'pending', ?, '排队中')`,
    [scopeType, scopeId != null ? String(scopeId) : null, requestedBy || null]
  );
  return r.insertId;
}

module.exports = {
  runBuildJob,
  createBuildJob,
  updateJob,
};
