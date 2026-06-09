/** 解析任务 step_checklist */
export function parseStepChecklist(raw) {
  if (raw == null) return []
  let list = raw
  if (typeof list === 'string') {
    try {
      list = JSON.parse(list)
    } catch {
      return []
    }
  }
  if (!Array.isArray(list)) return []
  return list.map((x, i) => ({
    id: x.id != null ? Number(x.id) : i + 1,
    title: String(x.title || x.name || `步骤${i + 1}`).trim(),
    required: Boolean(x.required),
  }))
}

function titleMatches(a, b) {
  if (!a || !b) return false
  const sa = String(a)
  const sb = String(b)
  return sa.includes(sb) || sb.includes(sa)
}

/**
 * AI 对单步骤的判断：已完成 / 未完成 / 证据不足
 */
export function resolveAiStepJudgment(row, verificationResult) {
  const vr = verificationResult
  const fallback = {
    status: 'uncertain',
    label: '证据不足',
    tagType: 'warning',
    basis: '未识别到明确证据，建议教师结合提交内容复核',
  }
  if (!vr) return fallback

  const missing = vr.stepCompleteness?.missing || []
  const covered = vr.stepCompleteness?.covered || []
  const mids = vr.missingStepIds

  if (Array.isArray(mids) && mids.map(Number).includes(Number(row.id))) {
    return {
      status: 'notdone',
      label: '未完成',
      tagType: 'danger',
      basis: 'AI判断该步骤可能未完成',
    }
  }

  const inMissing = missing.some((m) => titleMatches(row.title, m))
  const inCovered = covered.some((c) => titleMatches(row.title, c))

  if (inCovered && !inMissing) {
    return {
      status: 'done',
      label: '已完成',
      tagType: 'success',
      basis: '识别到相关证据，与步骤要求匹配',
    }
  }
  if (inMissing && !inCovered) {
    return {
      status: 'notdone',
      label: '未完成',
      tagType: 'danger',
      basis: 'AI判断该步骤可能未完成',
    }
  }
  return fallback
}

export function passedToTeacherChoice(passed) {
  if (passed === true) return 'done'
  if (passed === false) return 'notdone'
  return 'inherit'
}

export function applyStepOverridesToRows(rows, override) {
  const list = override?.stepOverrides
  const notes = override?.stepNotes
  const noteMap = new Map(
    (Array.isArray(notes) ? notes : []).map((x) => [Number(x.stepId), String(x.note || '')])
  )
  if (!Array.isArray(list)) {
    return rows.map((r) => ({
      ...r,
      teacherChoice: 'inherit',
      stepNote: noteMap.get(r.id) || '',
    }))
  }
  const map = new Map(list.map((x) => [Number(x.stepId), x.passed]))
  return rows.map((r) => ({
    ...r,
    teacherChoice: map.has(r.id) ? passedToTeacherChoice(map.get(r.id)) : 'inherit',
    stepNote: noteMap.get(r.id) || '',
  }))
}

/** 智能核查总览统计 */
export function computeVerificationSummary(stepRows, verificationResult) {
  const vr = verificationResult
  const rows = stepRows || []

  if (rows.length) {
    let aiDone = 0
    let uncertain = 0
    let teacherCorrected = 0
    rows.forEach((r) => {
      const j = r.aiJudgment || resolveAiStepJudgment(r, vr)
      if (j.status === 'done') aiDone += 1
      else if (j.status === 'uncertain') uncertain += 1
      if (r.teacherChoice && r.teacherChoice !== 'inherit') teacherCorrected += 1
    })
    const total = rows.length
    const percent = total > 0 ? Math.round((aiDone / total) * 100) : 0
    return {
      totalSteps: total,
      aiDoneCount: aiDone,
      uncertainCount: uncertain,
      teacherCorrectedCount: teacherCorrected,
      completionRatio: `${aiDone} / ${total}`,
      completionPercent: percent,
    }
  }

  const covered = vr?.stepCompleteness?.covered || []
  const missing = vr?.stepCompleteness?.missing || []
  const totalFallback = covered.length + missing.length
  const aiDone = covered.length
  const total = totalFallback > 0 ? totalFallback : null
  const percent =
    total != null && total > 0
      ? Math.round((aiDone / total) * 100)
      : vr?.stepCompleteness?.score != null
        ? Number(vr.stepCompleteness.score)
        : null

  return {
    totalSteps: total,
    aiDoneCount: aiDone,
    uncertainCount: missing.length,
    teacherCorrectedCount: 0,
    completionRatio: total != null ? `${aiDone} / ${total}` : '—',
    completionPercent: percent,
  }
}

/** 步骤相关得分（0–100）与完成数量区分展示 */
export function formatStepScoreDisplay(verificationResult, summary) {
  const score = verificationResult?.stepCompleteness?.score
  if (score == null || score === '') return null
  const n = Number(score)
  if (!Number.isFinite(n)) return null
  return {
    scoreText: `${n} / 100`,
    label: '步骤相关得分',
    hint: 'AI 对步骤完成质量的整体评分（0–100），与上方完成数量相互独立',
  }
}
