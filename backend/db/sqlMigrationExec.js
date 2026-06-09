/**
 * 迁移 SQL 执行：兼容 MySQL 8.0 与 MariaDB 10.5+
 *
 * MySQL 不支持：
 *   - ALTER TABLE ... ADD COLUMN IF NOT EXISTS
 *   - CREATE [UNIQUE] INDEX IF NOT EXISTS
 *
 * 策略：执行前剥离 IF NOT EXISTS；重复列/表/索引错误（1060/1061/1050）视为幂等跳过。
 */

/** @type {Record<number, string>} */
const ERRNO_HINT = {
  1050: 'table already exists',
  1060: 'column already exists',
  1061: 'index already exists',
};

/**
 * 将 MariaDB 扩展语法转为 MySQL/MariaDB 通用写法
 * @param {string} sql
 */
function normalizeMigrationSql(sql) {
  return (
    sql
      // CREATE UNIQUE INDEX IF NOT EXISTS → CREATE UNIQUE INDEX
      .replace(/\bCREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\b/gi, 'CREATE UNIQUE INDEX')
      // CREATE INDEX IF NOT EXISTS → CREATE INDEX
      .replace(/\bCREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\b/gi, 'CREATE INDEX')
      // ALTER TABLE ... ADD COLUMN / ADD INDEX
      .replace(/\bADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\b/gi, 'ADD COLUMN')
      .replace(/\bADD\s+INDEX\s+IF\s+NOT\s+EXISTS\b/gi, 'ADD INDEX')
  );
}

/** @param {string} sql */
function splitSqlStatements(sql) {
  const withoutLineComments = sql
    .split('\n')
    .filter((line) => !/^\s*--/.test(line))
    .join('\n');

  return withoutLineComments
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * @param {unknown} err
 */
function isIgnorableMigrationError(err) {
  const errno = err && typeof err === 'object' && 'errno' in err ? Number(err.errno) : null;
  if (errno != null && Object.prototype.hasOwnProperty.call(ERRNO_HINT, errno)) {
    return true;
  }
  const msg = String((err && err.message) || err).toLowerCase();
  return (
    msg.includes('duplicate column') ||
    msg.includes('duplicate key name') ||
    msg.includes('already exists')
  );
}

/**
 * @param {unknown} err
 */
function formatIdempotentSkip(err) {
  const errno = err && typeof err === 'object' && 'errno' in err ? Number(err.errno) : null;
  if (errno != null && ERRNO_HINT[errno]) {
    return ERRNO_HINT[errno];
  }
  return String((err && err.message) || err).slice(0, 120);
}

/**
 * @param {import('mysql2/promise').Connection} conn
 * @param {string} sql
 * @param {string} migrationName
 */
async function executeMigrationSql(conn, sql, migrationName) {
  const normalized = normalizeMigrationSql(sql);
  const statements = splitSqlStatements(normalized);

  for (let i = 0; i < statements.length; i += 1) {
    const stmt = statements[i];
    try {
      await conn.query(stmt);
    } catch (err) {
      if (isIgnorableMigrationError(err)) {
        console.warn(
          `[db] ${migrationName} stmt#${i + 1} skipped (idempotent): ${formatIdempotentSkip(err)}`
        );
        continue;
      }
      throw err;
    }
  }
}

module.exports = {
  executeMigrationSql,
  normalizeMigrationSql,
  /** @deprecated 使用 normalizeMigrationSql */
  stripAddColumnIfNotExists: normalizeMigrationSql,
  splitSqlStatements,
  isIgnorableMigrationError,
  formatIdempotentSkip,
};
