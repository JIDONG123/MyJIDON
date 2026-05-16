/**
 * 在已有库执行 sql/migration_extension_v10.sql（依赖 backend/.env 中的 DB_*）
 * 用法：在 backend 目录下 node scripts/runMigrationV10.js
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function main() {
  const sqlPath = path.join(__dirname, '..', 'sql', 'migration_extension_v10.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
  });
  try {
    await conn.query(sql);
    console.log('migration_extension_v10.sql 执行成功');
  } catch (e) {
    console.error('迁移失败（若列/表已存在可忽略部分错误）:', e.message);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

main();
