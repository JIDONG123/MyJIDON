/**
 * MariaDB kg_nodes/kg_edges → Neo4j 异步镜像
 */

const kgGraphStore = require('./kgGraphStore');
const kgNeo4j = require('../utils/kgNeo4jClient');
const { getKgConfig } = require('./kgConfigService');

async function syncAllToNeo4j() {
  if (!(await kgNeo4j.isKgNeo4jEnabled())) {
    await kgGraphStore.updateSyncState({
      neo4j_status: 'disabled',
      reconcile_note: 'NEO4J 未启用',
    });
    return { skipped: true };
  }

  const nodes = await kgGraphStore.listNodes({ limit: 5000 });
  const edges = await kgGraphStore.listEdges({ limit: 10000 });
  const { batchSize } = await getKgConfig();

  for (let i = 0; i < nodes.length; i += batchSize) {
    const chunk = nodes.slice(i, i + batchSize);
    await kgNeo4j.upsertGraphBatch(
      chunk.map((n) => ({ id: n.id, name: n.name, type: n.type })),
      []
    );
  }

  for (let i = 0; i < edges.length; i += batchSize) {
    const chunk = edges.slice(i, i + batchSize).map((e) => ({
      from: e.from,
      to: e.to,
      type: e.type,
      weight: e.weight,
    }));
    await kgNeo4j.upsertGraphBatch([], chunk);
  }

  const counts = await kgGraphStore.countStore();
  await kgGraphStore.updateSyncState({
    neo4j_synced_at: new Date(),
    neo4j_status: 'synced',
    node_count: counts.nodes,
    edge_count: counts.edges,
  });
  return { nodes: counts.nodes, edges: counts.edges };
}

module.exports = {
  syncAllToNeo4j,
};
