import { parseJsonLoose } from './qbLabels'

function normStr(s) {
  return String(s || '').trim()
}

export function qbStemSummary(stem, max = 52) {
  const s = normStr(stem).replace(/\s+/g, ' ')
  if (!s) return '—'
  return s.length > max ? `${s.slice(0, max)}…` : s
}

/** 管理端质量状态 */
export function qbQualityMeta(row, detail) {
  const d = detail || row || {}
  const type = d.type
  const refAns = normStr(d.reference_answer)
  const ansJson = parseJsonLoose(d.answer_json)

  if (type === 'short' || type === 'code') {
    if (!refAns) return { text: '缺少答案', type: 'warning' }
    if (refAns.length < 12) return { text: '答案待核查', type: 'warning' }
    return { text: '正常', type: 'success' }
  }

  if (type === 'fill') {
    if (!normStr(ansJson?.correct)) return { text: '缺少答案', type: 'warning' }
    return { text: '正常', type: 'success' }
  }

  if (type === 'single' || type === 'multi' || type === 'judge') {
    const hasStructuredAnswer =
      type === 'judge'
        ? ansJson?.correct != null
        : type === 'single'
          ? !!normStr(ansJson?.correct)
          : Array.isArray(ansJson?.correct) && ansJson.correct.length > 0
    if (!hasStructuredAnswer) return { text: '缺少答案', type: 'warning' }
    return { text: '正常', type: 'success' }
  }

  return { text: '正常', type: 'info' }
}

/** 教师端答案完整性 */
export function qbAnswerCompletenessMeta(row, detail) {
  const q = qbQualityMeta(row, detail)
  const map = {
    正常: { text: '答案完整', type: 'success' },
    缺少答案: { text: '缺少参考答案', type: 'warning' },
    缺少解析: { text: '缺少解析', type: 'warning' },
    答案待核查: { text: '待完善', type: 'warning' },
  }
  return map[q.text] || { text: q.text, type: q.type }
}

export function qbUsageMeta(row) {
  const count = Number(row?.usage_count) || 0
  const last = row?.last_used_at
  if (count <= 0) return { count: 0, label: '未引用', last: null }
  return { count, label: `${count} 次`, last }
}

export function qbQualityAlerts(rows) {
  const alerts = []
  const missingAnswer = rows.filter((r) => qbQualityMeta(r).text === '缺少答案').length
  const missingExplain = rows.filter((r) => qbQualityMeta(r).text === '缺少解析').length
  const unused = rows.filter((r) => (Number(r.usage_count) || 0) === 0).length
  const highRef = rows.filter((r) => (Number(r.usage_count) || 0) >= 5).length

  if (missingAnswer) alerts.push({ key: 'missing_answer', label: '缺少答案', count: missingAnswer })
  if (missingExplain) alerts.push({ key: 'missing_explain', label: '缺少解析', count: missingExplain })
  if (unused) alerts.push({ key: 'unused', label: '未引用题', count: unused })
  if (highRef) alerts.push({ key: 'high_ref', label: '高频引用', count: highRef })
  alerts.push({ key: 'duplicate', label: '疑似重复', count: '--' })
  return alerts
}

export function isObjectiveType(type) {
  return ['single', 'multi', 'judge', 'fill'].includes(type)
}

export function isWithinDays(value, days) {
  if (!value) return false
  const t = new Date(value).getTime()
  if (!Number.isFinite(t)) return false
  return Date.now() - t <= days * 24 * 60 * 60 * 1000
}

export function isThisMonth(value) {
  if (!value) return false
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return false
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
}
