export const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日']

export const WEEKDAY_COLUMNS = WEEKDAY_LABELS.map((label, i) => ({
  value: i + 1,
  label: `周${label}`,
  short: label,
}))

export function weekdayLabel(weekday) {
  const n = Number(weekday)
  if (!Number.isFinite(n) || n < 1 || n > 7) return '—'
  return `周${WEEKDAY_LABELS[n - 1]}`
}

export function periodLabel(row) {
  if (row?.period_start == null) return '—'
  const end = row.period_end ?? row.period_start
  return end === row.period_start ? `第${row.period_start}节` : `${row.period_start}-${end}节`
}

export function periodSlotKey(start, end) {
  return `${start}-${end ?? start}`
}

export function buildPeriodSlots(rows = []) {
  const map = new Map()
  for (const row of rows) {
    if (row.period_start == null) continue
    const start = Number(row.period_start)
    const end = Number(row.period_end ?? row.period_start)
    const key = periodSlotKey(start, end)
    if (!map.has(key)) {
      map.set(key, { start, end, label: start === end ? `第${start}节` : `${start}-${end}节` })
    }
  }
  return [...map.values()].sort((a, b) => a.start - b.start || a.end - b.end)
}

export function cellKey(weekday, slot) {
  return `${weekday}-${slot.start}-${slot.end}`
}

export function buildScheduleGrid(rows = [], weekdayMax = 5) {
  const slots = buildPeriodSlots(rows)
  const weekdays = WEEKDAY_COLUMNS.filter((c) => c.value <= weekdayMax)
  const cells = {}

  for (const slot of slots) {
    for (const col of weekdays) {
      const key = cellKey(col.value, slot)
      cells[key] = rows.filter(
        (r) =>
          Number(r.weekday) === col.value &&
          Number(r.period_start) === slot.start &&
          Number(r.period_end ?? r.period_start) === slot.end
      )
    }
  }

  return { slots, weekdays, cells }
}

export function computeSummary(rows = [], weekNo = 0) {
  const classIds = new Set(rows.map((r) => r.teaching_class_id).filter(Boolean))
  const taskRows = rows.filter((r) => r.task_id)
  const sessionCount = rows.length

  let nearest = null
  if (rows.length) {
    const sorted = [...rows].sort((a, b) => {
      const wd = Number(a.weekday) - Number(b.weekday)
      if (wd !== 0) return wd
      return Number(a.period_start) - Number(b.period_start)
    })
    nearest = sorted[0]
  }

  const weekHint = weekNo > 0 ? `第 ${weekNo} 周` : '当前筛选'

  return {
    sessionCount,
    classCount: classIds.size,
    taskCount: taskRows.length,
    nearest,
    weekHint,
  }
}
