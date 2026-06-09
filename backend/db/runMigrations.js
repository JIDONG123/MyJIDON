const fs = require('fs');
const mysql = require('mysql2/promise');
const { getMigrationPaths } = require('./migrationList');
const { executeMigrationSql } = require('./sqlMigrationExec');

const MIGRATIONS_TABLE = 'migrations';
const LEGACY_TABLE = 'schema_migrations';

async function ensureMigrationsTable(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS \`${MIGRATIONS_TABLE}\` (
      id INT AUTO_INCREMENT PRIMARY KEY,
      migration_name VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const [legacyTables] = await conn.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1`,
    [LEGACY_TABLE]
  );
  if (legacyTables.length > 0) {
    await conn.query(`
      INSERT IGNORE INTO \`${MIGRATIONS_TABLE}\` (migration_name)
      SELECT filename FROM \`${LEGACY_TABLE}\`
    `);
  }
}

async function getAppliedSet(conn) {
  const [rows] = await conn.query(
    `SELECT migration_name FROM \`${MIGRATIONS_TABLE}\``
  );
  return new Set(rows.map((r) => r.migration_name));
}

/**
 * 执行未记录的迁移；失败则抛错（由 bootstrap 终止进程）
 * @param {import('mysql2/promise').Connection} conn
 */
async function runPendingMigrations(conn) {
  await ensureMigrationsTable(conn);
  const applied = await getAppliedSet(conn);
  const list = getMigrationPaths();

  const [verRows] = await conn.query('SELECT VERSION() AS v');
  const dbVersion = verRows[0]?.v || 'unknown';
  console.log(`[db] database version: ${dbVersion}`);

  if (list.length === 0) {
    console.log('[db] no migration files found');
    return;
  }

  for (const { name, path: filePath } of list) {
    if (applied.has(name)) {
      continue;
    }
    if (!fs.existsSync(filePath)) {
      console.warn(`[db] migration file missing, skip: ${name}`);
      continue;
    }
    const sql = fs.readFileSync(filePath, 'utf8').trim();
    if (!sql) {
      await conn.query(
        `INSERT INTO \`${MIGRATIONS_TABLE}\` (migration_name) VALUES (?)`,
        [name]
      );
      continue;
    }

    console.log(`[db] applying migration: ${name}`);
    await conn.beginTransaction();
    try {
      await executeMigrationSql(conn, sql, name);
      await conn.query(
        `INSERT INTO \`${MIGRATIONS_TABLE}\` (migration_name) VALUES (?)`,
        [name]
      );
      await conn.commit();
      console.log(`[db] migration applied: ${name}`);
    } catch (err) {
      await conn.rollback();
      const msg = err && err.message ? err.message : String(err);
      console.error(`[db] migration FAILED: ${name} — ${msg}`);
      throw new Error(`Migration "${name}" failed: ${msg}`);
    }
  }

  console.log('[db] all pending migrations applied');
}

module.exports = { runPendingMigrations, ensureMigrationsTable, MIGRATIONS_TABLE };
