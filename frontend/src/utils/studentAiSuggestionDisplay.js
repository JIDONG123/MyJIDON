import { parseJsonLoose } from './qbLabels'

export function parseAiSuggestion(raw) {
  if (raw == null) return null
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return null
    const parsed = parseJsonLoose(trimmed)
    if (parsed && typeof parsed === 'object') return parsed
    return { summary: trimmed }
  }
  if (typeof raw === 'object') return raw
  return null
}

export function buildQuestionIndexMap(rows = [], idField = 'eq_id') {
  const map = new Map()
  rows.forEach((row, i) => {
    const id = row[idField] ?? row.pq_id ?? row.eq_id
    if (id != null) map.set(String(id), row.sort_index ?? row.index ?? i + 1)
  })
  return map
}

/**
 * 将 AI 建议 JSON 转为学生可读列表
 * @param {unknown} raw ai_suggestion 字段
 * @param {{ indexMap?: Map<string, number> }} opts
 */
export function buildAiSuggestionDisplayItems(raw, { indexMap = null } = {}) {
  const data = parseAiSuggestion(raw)
  if (!data) return []

  if (data.summary && !data.items) {
    return [
      {
        questionNo: null,
        id: null,
        suggestedScore: null,
        suggestedScoreText: '',
        rationale: data.summary,
        keyPoints: [],
      },
    ]
  }

  const items = Array.isArray(data.items) ? data.items : Array.isArray(data) ? data : []
  return items
    .map((item, idx) => {
      const id = item.eq_id ?? item.pq_id ?? item.id
      const idStr = id != null ? String(id) : null
      const questionNo = (idStr && indexMap?.get(idStr)) ?? idx + 1
      const score = item.suggested_score
      const scoreNum = score != null && Number.isFinite(Number(score)) ? Number(score) : null
      const rationale = String(item.rationale || '').trim()
      const keyPoints = Array.isArray(item.key_points)
        ? item.key_points.map((x) => String(x).trim()).filter(Boolean)
        : []

      return {
        questionNo,
        id: idStr,
        suggestedScore: scoreNum,
        suggestedScoreText: scoreNum != null ? `${scoreNum} 分` : '—',
        rationale: rationale || '暂无评分说明',
        keyPoints,
      }
    })
    .filter((item) => item.rationale || item.suggestedScore != null || item.keyPoints.length)
}

export function hasAiSuggestionDisplay(raw) {
  return buildAiSuggestionDisplayItems(raw).length > 0
}
