const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { runPendingMigrations } = require('./runMigrations');

const INIT_SQL = path.join(__dirname, '..', 'sql', 'init.sql');

function dbConfig(withDatabase = true) {
  const base = {
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    charset: 'utf8mb4',
    multipleStatements: true,
  };
  if (withDatabase) {
    base.database = process.env.DB_NAME || 'smart_grading_system';
  }
  return base;
}

async function waitForDatabase(maxAttempts = 60, delayMs = 2000) {
  for (let i = 1; i <= maxAttempts; i += 1) {
    try {
      const conn = await mysql.createConnection(dbConfig(true));
      await conn.ping();
      await conn.end();
      return;
    } catch (e) {
      if (i === maxAttempts) {
        throw new Error(`[db] cannot connect after ${maxAttempts} attempts: ${e.message}`);
      }
      console.log(`[db] waiting for database (${i}/${maxAttempts})...`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

async function tableExists(conn, tableName) {
  const db = process.env.DB_NAME || 'smart_grading_system';
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = ? AND table_name = ? LIMIT 1`,
    [db, tableName]
  );
  return rows.length > 0;
}

async function runInitSql(conn) {
  if (!fs.existsSync(INIT_SQL)) {
    throw new Error(`[db] init.sql not found: ${INIT_SQL}`);
  }
  const sql = fs.readFileSync(INIT_SQL, 'utf8');
  console.log('[db] core tables missing — executing init.sql (first-time bootstrap only)');
  await conn.query(sql);
  console.log('[db] init.sql completed');
}

/**
 * 启动自检：库可连 → 无 users 表则 init.sql → 迁移（仅未记录项）→ 完成后才启动 HTTP
 *
 * 调用约定：仅在 cluster 主进程或单进程模式（USE_CLUSTER=0）中调用一次；
 * 工作进程不得调用，以免并发 DDL。
 *
 * @returns {Promise<void>}
 */
async function bootstrapDatabase() {
  await waitForDatabase();
  const conn = await mysql.createConnection(dbConfig(true));
  try {
    const hasUsers = await tableExists(conn, 'users');
    if (!hasUsers) {
      await runInitSql(conn);
    } else {
      console.log('[db] users table exists — skip init.sql (preserve production data)');
    }
    await runPendingMigrations(conn);
    console.log('[db] bootstrap finished — ready to accept HTTP traffic');
  } catch (err) {
    console.error('[db] bootstrap failed:', err.message || err);
    throw err;
  } finally {
    await conn.end();
  }
}

module.exports = { bootstrapDatabase, waitForDatabase };
