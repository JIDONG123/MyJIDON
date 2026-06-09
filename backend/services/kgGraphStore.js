/**
 * 知识图谱 MariaDB 存储（权威数据源）
 */

const pool = require('../config/database');

function parseJson(val) {
  if (val == null) return null;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return null;
  }
}

async function upsertNode(node) {
  const id = String(node.id || '').trim();
  if (!id) return;
  await pool.query(
    `INSERT INTO kg_nodes (id, name, node_type, source_table, source_id, embedding_json, meta_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       name = VALUES(name),
       node_type = VALUES(node_type),
       source_table = VALUES(source_table),
       source_id = VALUES(source_id),
       embedding_json = VALUES(embedding_json),
       meta_json = VALUES(meta_json)`,
    [
      id,
      node.name || id,
      node.type || node.node_type || 'entity',
      node.source_table || null,
      node.source_id != null ? String(node.source_id) : null,
      node.embedding ? JSON.stringify(node.embedding) : null,
      node.meta ? JSON.stringify(node.meta) : null,
    ]
  );
}

async function upsertNodes(nodes) {
  for (const n of nodes || []) {
    await upsertNode(n);
  }
}

async function upsertEdge(edge) {
  const from = String(edge.from || edge.from_node_id || '').trim();
  const to = String(edge.to || edge.to_node_id || '').trim();
  const type = String(edge.type || edge.rel_type || 'RELATED').trim();
  if (!from || !to) return;
  await pool.query(
    `INSERT INTO kg_edges (from_node_id, to_node_id, rel_type, source, weight, meta_json)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       source = VALUES(source),
       weight = VALUES(weight),
       meta_json = VALUES(meta_json)`,
    [
      from,
      to,
      type,
      edge.source || 'rule',
      edge.weight != null ? edge.weight : null,
      edge.meta ? JSON.stringify(edge.meta) : null,
    ]
  );
}

async function upsertEdges(edges) {
  for (const e of edges || []) {
    await upsertEdge(e);
  }
}

async function mergeExtractPayload(payload) {
  const nodes = Array.isArray(payload?.nodes) ? payload.nodes : [];
  const rels = Array.isArray(payload?.relationships) ? payload.relationships : [];
  await upsertNodes(
    nodes.map((n) => ({
      id: n.id,
      name: n.name,
      type: n.type,
      meta: n,
    }))
  );
  await upsertEdges(
    rels.map((r) => ({
      from: r.from,
      to: r.to,
      type: r.type,
      source: r.source || 'deepseek',
      weight: r.weight,
    }))
  );
  return { nodeCount: nodes.length, edgeCount: rels.length };
}

async function listNodes(filters = {}) {
  const where = [];
  const params = [];
  if (filters.nodeType) {
    where.push('node_type = ?');
    params.push(filters.nodeType);
  }
  if (filters.ids && filters.ids.length) {
    where.push(`id IN (${filters.ids.map(() => '?').join(',')})`);
    params.push(...filters.ids);
  }
  const sql = `SELECT id, name, node_type, source_table, source_id, embedding_json, meta_json
    FROM kg_nodes ${where.length ? `WHERE ${where.join(' AND ')}` : ''} LIMIT ${Math.min(parseInt(filters.limit || '500', 10), 2000)}`;
  const [rows] = await pool.query(sql, params);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.node_type,
    source_table: r.source_table,
    source_id: r.source_id,
    embedding: parseJson(r.embedding_json),
    meta: parseJson(r.meta_json),
  }));
}

async function listEdges(filters = {}) {
  const where = [];
  const params = [];
  if (filters.fromIds && filters.fromIds.length) {
    where.push(`from_node_id IN (${filters.fromIds.map(() => '?').join(',')})`);
    params.push(...filters.fromIds);
  }
  if (filters.toIds && filters.toIds.length) {
    where.push(`to_node_id IN (${filters.toIds.map(() => '?').join(',')})`);
    params.push(...filters.toIds);
  }
  const limit = Math.min(parseInt(filters.limit || '2000', 10), 5000);
  const sql = `SELECT from_node_id, to_node_id, rel_type, source, weight, meta_json
    FROM kg_edges ${where.length ? `WHERE ${where.join(' AND ')}` : ''} LIMIT ${limit}`;
  const [rows] = await pool.query(sql, params);
  return rows.map((r) => ({
    from: r.from_node_id,
    to: r.to_node_id,
    type: r.rel_type,
    source: r.source,
    weight: r.weight != null ? Number(r.weight) : 1,
    meta: parseJson(r.meta_json),
  }));
}

async function countStore() {
  const [[n]] = await pool.query('SELECT COUNT(*) AS c FROM kg_nodes');
  const [[e]] = await pool.query('SELECT COUNT(*) AS c FROM kg_edges');
  return { nodes: Number(n.c) || 0, edges: Number(e.c) || 0 };
}

async function updateSyncState(patch) {
  const fields = [];
  const vals = [];
  for (const [k, v] of Object.entries(patch)) {
    fields.push(`${k} = ?`);
    vals.push(v);
  }
  if (!fields.length) return;
  await pool.query(`UPDATE kg_sync_state SET ${fields.join(', ')} WHERE id = 1`, vals);
}

module.exports = {
  upsertNode,
  upsertNodes,
  upsertEdge,
  upsertEdges,
  mergeExtractPayload,
  listNodes,
  listEdges,
  countStore,
  updateSyncState,
};
