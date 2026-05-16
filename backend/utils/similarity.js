const CODE_EXT = /\.(java|py|js|ts|tsx|jsx|cpp|c|h|cs|go|rs)$/i;

function normalizeWhitespace(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/[\t ]+/g, ' ')
    .trim();
}

/** 去标识符后比较大段文本的字符二元组 Jaccard，0~1 */
function charBigramJaccard(a, b) {
  const s1 = normalizeWhitespace(a).toLowerCase();
  const s2 = normalizeWhitespace(b).toLowerCase();
  if (s1.length < 4 || s2.length < 4) return 0;
  const setA = new Set();
  for (let i = 0; i < s1.length - 1; i += 1) {
    setA.add(s1.slice(i, i + 2));
  }
  const setB = new Set();
  for (let i = 0; i < s2.length - 1; i += 1) {
    setB.add(s2.slice(i, i + 2));
  }
  let inter = 0;
  for (const x of setA) {
    if (setB.has(x)) inter += 1;
  }
  const union = setA.size + setB.size - inter;
  return union > 0 ? inter / union : 0;
}

function stripCodeNoise(text) {
  return String(text || '')
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/#.*$/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function similarityBetweenSubmissions(a, b) {
  const nameA = (a.file_name || '').toLowerCase();
  const nameB = (b.file_name || '').toLowerCase();
  const ca = CODE_EXT.test(nameA) || CODE_EXT.test(nameB);
  const t1 = ca ? stripCodeNoise(a.content || '') : a.content || '';
  const t2 = ca ? stripCodeNoise(b.content || '') : b.content || '';
  return charBigramJaccard(t1, t2);
}

function levelFromRatio(ratio, warnPct, suspectPct) {
  const pct = ratio * 100;
  if (pct >= suspectPct) return 'high';
  if (pct >= warnPct) return 'warn';
  if (pct >= 8) return 'low';
  return 'none';
}

/**
 * @returns {{ maxSimilarity: number, pairs: Array<{otherId:number, ratio:number, snippet:string}> }}
 */
function computeTaskSimilarityForSubmission(current, others, warnPct, suspectPct) {
  const pairs = [];
  let maxR = 0;
  for (const o of others) {
    if (o.id === current.id) continue;
    const r = similarityBetweenSubmissions(current, o);
    if (r > maxR) maxR = r;
    if (r >= warnPct / 100) {
      pairs.push({
        otherId: o.id,
        ratio: parseFloat((r * 100).toFixed(2)),
        snippet: `与提交 #${o.id} 相似度约 ${(r * 100).toFixed(1)}%`,
      });
    }
  }
  pairs.sort((x, y) => y.ratio - x.ratio);
  const top = pairs.slice(0, 5);
  const maxSimilarity = parseFloat((maxR * 100).toFixed(2));
  const similarity_level = levelFromRatio(maxR, warnPct, suspectPct);
  return { maxSimilarity, similarity_level, pairs: top };
}

module.exports = {
  similarityBetweenSubmissions,
  computeTaskSimilarityForSubmission,
  levelFromRatio,
};
