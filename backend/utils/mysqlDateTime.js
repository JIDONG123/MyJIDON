/**
 * Convert client deadline values to MySQL DATETIME literal 'YYYY-MM-DD HH:mm:ss'.
 * - Naive "YYYY-MM-DD HH:mm:ss" from DB / forms is passed through (no TZ shift).
 * - ISO-8601 / timestamps are interpreted by Date and formatted in local server timezone.
 */
function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatLocal(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function toMysqlDateTime(input) {
  if (input == null || input === '') return null;

  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return null;
    return formatLocal(input);
  }

  if (typeof input === 'string') {
    const s = input.trim();
    const naive = s.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})/);
    if (naive) {
      return `${naive[1]} ${naive[2]}`;
    }
  }

  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return formatLocal(d);
}

module.exports = { toMysqlDateTime };
