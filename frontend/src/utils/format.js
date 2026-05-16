/**
 * 列表与详情中的日期时间展示：YYYY/M/D HH:mm:ss（月日不补零，时分秒两位）
 * 使用本地时区，与常见教务/报表习惯一致。
 */
export function formatDateTime(value) {
  if (value == null || value === '') return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  const y = d.getFullYear()
  const mo = d.getMonth() + 1
  const day = d.getDate()
  const h = d.getHours()
  const mi = d.getMinutes()
  const s = d.getSeconds()
  const p2 = (n) => String(n).padStart(2, '0')
  return `${y}/${mo}/${day} ${p2(h)}:${p2(mi)}:${p2(s)}`
}

const pad2 = (n) => String(n).padStart(2, '0')

/**
 * 供 Element Plus date-picker（value-format="YYYY-MM-DD HH:mm:ss"）回填表单
 */
export function formatDateTimePicker(value) {
  if (value == null || value === '') return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}
