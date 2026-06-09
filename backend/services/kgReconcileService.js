/**
 * MariaDB 与 Neo4j 定时全量校验（以 MariaDB 为准，不一致时触发 Neo4j 重同步）
 */

const kgGraphStore = require('./kgGraphStore');
const kgNeo4j = require('../utils/kgNeo4jClient');
const { syncAllToNeo4j } = require('./kgNeo4jSyncService');
const { getKgConfig } = require('./kgConfigService');

async function reconcile() {
  const maria = await kgGraphStore.countStore();
  let neo = { nodes: 0, edges: 0, skipped: true };
  if (await kgNeo4j.isKgNeo4jEnabled()) {
    try {
      neo = await kgNeo4j.countGraph();
    } catch (e) {
      await kgGraphStore.updateSyncState({
        last_reconcile_at: new Date(),
        neo4j_status: 'error',
        reconcile_note: e.message,
      });
      return { ok: false, error: e.message };
    }
  }

  const mismatch =
    !neo.skipped &&
    (Math.abs(maria.nodes - neo.nodes) > 2 || Math.abs(maria.edges - neo.edges) > 5);

  if (mismatch || neo.skipped) {
    await syncAllToNeo4j();
  }

  await kgGraphStore.updateSyncState({
    last_reconcile_at: new Date(),
    node_count: maria.nodes,
    edge_count: maria.edges,
    neo4j_status: neo.skipped ? 'disabled' : mismatch ? 'reconciled' : 'ok',
    reconcile_note: mismatch ? '检测到不一致，已按 MariaDB 重同步 Neo4j' : null,
  });

  return { ok: true, maria, neo, mismatch };
}

let timer = null;

async function startReconcileScheduler() {
  if (timer) return;
  const cfg = await getKgConfig();
  const enabled = cfg.reconcileEnabled || cfg.enabled;
  if (!enabled) return;

  const intervalMs = cfg.reconcileIntervalMs;
  timer = setInterval(() => {
    reconcile().catch((e) => console.warn('[kgReconcile]', e.message));
  }, intervalMs);
  timer.unref?.();
  setTimeout(() => {
    reconcile().catch((e) => console.warn('[kgReconcile:init]', e.message));
  }, 15000).unref?.();
}

module.exports = {
  reconcile,
  startReconcileScheduler,
};
