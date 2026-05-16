/**
 * ECharts 雷达图刻度工具。
 * 雷达坐标系会对每个维度调用 alignScaleTicks；当 max/splitNumber 得到的 interval
 * 不是「整刻度」（如 30÷5=6）时，开发环境会打印 alignTicks 告警。
 */

/** @param {number} interval */
function isNiceInterval(interval) {
  if (!(interval > 0) || !Number.isFinite(interval)) return false
  const exp = Math.pow(10, Math.floor(Math.log10(Math.abs(interval) || 1)))
  const f = Math.abs(interval / exp)
  return f === 0 || f === 1 || f === 2 || f === 3 || f === 5
}

/**
 * 根据数据所需上限，选出 axisMax 与 splitNumber，使 axisMax / splitNumber 为 nice interval。
 * @param {number} needMax
 * @returns {{ axisMax: number, splitNumber: number }}
 */
export function pickRadarAxisScale(needMax) {
  const need = Math.max(1, needMax)
  const splitCandidates = [5, 6, 4, 3, 10, 8]

  for (const split of splitCandidates) {
    const interval = Math.ceil(need / split)
    if (isNiceInterval(interval)) {
      return { axisMax: interval * split, splitNumber: split }
    }
  }

  let split = 5
  let interval = Math.ceil(need / split)
  while (!isNiceInterval(interval) && interval < 10000) {
    interval += 1
  }
  return { axisMax: interval * split, splitNumber: split }
}

/**
 * @param {Array<{ name: string, maxScore?: number, score?: number, value?: number }>} dimensionScores
 * @returns {{ indicators: Array<{ name: string, max: number }>, splitNumber: number }}
 */
export function buildRadarChartMeta(dimensionScores) {
  if (!dimensionScores?.length) {
    return { indicators: [], splitNumber: 5 }
  }

  const entries = dimensionScores.map((d) => {
    const maxRaw = Number(d.maxScore)
    const sc = Number(d.score ?? d.value)
    const base = Number.isFinite(maxRaw) && maxRaw > 0 ? maxRaw : 100
    return {
      name: d.name,
      need: Math.max(base, Number.isFinite(sc) ? sc : 0, 1),
    }
  })

  const { axisMax, splitNumber } = pickRadarAxisScale(Math.max(...entries.map((e) => e.need)))
  const indicators = entries.map((e) => ({ name: e.name, max: axisMax }))
  return { indicators, splitNumber }
}

/** @deprecated 使用 buildRadarChartMeta */
export function buildRadarIndicators(dimensionScores) {
  return buildRadarChartMeta(dimensionScores).indicators
}
