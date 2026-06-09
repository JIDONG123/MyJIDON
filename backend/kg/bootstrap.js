/**
 * 知识图谱模块启动（由 kgRoutes 加载，不修改 server/cluster 入口）
 */

const { startReconcileScheduler } = require('../services/kgReconcileService');

let started = false;

function startKgModule() {
  if (started) return;
  started = true;
  startReconcileScheduler().catch((e) => console.warn('[kgReconcile:scheduler]', e.message));
}

module.exports = { startKgModule };
