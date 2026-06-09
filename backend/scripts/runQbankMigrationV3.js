/**
 * 执行 sql/migration_qbank_teaching_class.sql
 * 用法：在 backend 目录 node scripts/runQbankMigrationV3.js
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('../config/loadEnv').loadEnv();

async function main() {
  const sqlPath = path.join(__dirname, '..', 'sql', 'migration_qbank_teaching_class.sql');
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
    console.log('migration_qbank_teaching_class.sql 执行成功');
  } catch (e) {
    console.error('迁移失败:', e.message);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

main();
