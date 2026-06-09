const LOGIN_USER_SELECT = `
  SELECT id, username, password, real_name, role, class_id, email, department,
         IFNULL(is_disabled, 0) AS is_disabled, avatar, phone, student_no, teacher_no,
         profile_bio, contact_extra,
         IFNULL(must_change_password, 0) AS must_change_password, password_changed_at
  FROM users
`;

const LOGIN_FAIL_MESSAGE = '账号或密码错误';
const IDENTIFIER_CONFLICT_MESSAGE = '账号标识存在冲突，请使用用户名登录或联系管理员处理。';

function normalizeLoginIdentifier(raw) {
  return String(raw ?? '').trim();
}

/**
 * @param {Array<{ id: number|string }>} rows
 * @returns {{ status: 'not_found'|'ok'|'conflict', user?: object, users?: object[] }}
 */
function resolveLoginMatches(rows) {
  const map = new Map();
  for (const row of rows || []) {
    if (row?.id == null) continue;
    map.set(Number(row.id), row);
  }
  const users = [...map.values()];
  if (users.length === 0) return { status: 'not_found' };
  if (users.length > 1) return { status: 'conflict', users };
  return { status: 'ok', user: users[0] };
}

/**
 * @param {import('mysql2/promise').Pool} dbPool
 * @param {string} identifier
 * @returns {Promise<{ ok: true, user: object } | { ok: false, code: string, message: string }>}
 */
async function findUserByLoginIdentifier(dbPool, identifier) {
  const loginId = normalizeLoginIdentifier(identifier);
  if (!loginId) {
    return { ok: false, code: 'EMPTY', message: '账号不能为空' };
  }

  const [rows] = await dbPool.query(
    `${LOGIN_USER_SELECT}
     WHERE username = ?
        OR (student_no IS NOT NULL AND student_no != '' AND student_no = ?)
        OR (teacher_no IS NOT NULL AND teacher_no != '' AND teacher_no = ?)`,
    [loginId, loginId, loginId]
  );

  const resolved = resolveLoginMatches(rows);
  if (resolved.status === 'not_found') {
    return { ok: false, code: 'AUTH_FAIL', message: LOGIN_FAIL_MESSAGE };
  }
  if (resolved.status === 'conflict') {
    return { ok: false, code: 'IDENTIFIER_CONFLICT', message: IDENTIFIER_CONFLICT_MESSAGE };
  }
  return { ok: true, user: resolved.user };
}

module.exports = {
  LOGIN_FAIL_MESSAGE,
  IDENTIFIER_CONFLICT_MESSAGE,
  normalizeLoginIdentifier,
  resolveLoginMatches,
  findUserByLoginIdentifier,
};
