/**
 * 复用 Qwen 向量模型，为知识点建立语义关联边（不修改 embeddingClient）
 */

const { embedTexts } = require('../utils/embeddingClient');
const { cosineSimilarity, parseEmbedding } = require('../utils/ragRetrieve');
const kgGraphStore = require('./kgGraphStore');
const { getKgConfig } = require('./kgConfigService');

const MAX_LINKS_PER_NODE = parseInt(process.env.KG_SEMANTIC_MAX_LINKS || '5', 10);

async function enrichSemanticLinks(nodeIds) {
  const nodes = await kgGraphStore.listNodes({
    nodeType: 'knowledge_point',
    limit: 800,
  });
  const targets = nodeIds?.length
    ? nodes.filter((n) => nodeIds.includes(n.id))
    : nodes;
  if (targets.length < 2) return { added: 0 };

  const { semanticMinSim: MIN_SIM } = await getKgConfig();

  const texts = targets.map((n) => `${n.name}\n${(n.meta && n.meta.desc) || ''}`.trim());
  let embeddings;
  try {
    embeddings = await embedTexts(texts);
  } catch (e) {
    return { added: 0, error: e.message };
  }

  const vectors = embeddings.map((e) => parseEmbedding(e));
  const edges = [];
  for (let i = 0; i < targets.length; i++) {
    if (!vectors[i]) continue;
    const sims = [];
    for (let j = 0; j < targets.length; j++) {
      if (i === j || !vectors[j]) continue;
      const sim = cosineSimilarity(vectors[i], vectors[j]);
      if (sim >= MIN_SIM) sims.push({ j, sim });
    }
    sims.sort((a, b) => b.sim - a.sim);
    for (const { j, sim } of sims.slice(0, MAX_LINKS_PER_NODE)) {
      edges.push({
        from: targets[i].id,
        to: targets[j].id,
        type: 'SEMANTIC_RELATED',
        source: 'qwen_embedding',
        weight: Number(sim.toFixed(4)),
      });
    }
    await kgGraphStore.upsertNode({
      id: targets[i].id,
      name: targets[i].name,
      type: targets[i].type,
      embedding: vectors[i],
    });
  }

  await kgGraphStore.upsertEdges(edges);
  return { added: edges.length };
}

module.exports = {
  enrichSemanticLinks,
};
