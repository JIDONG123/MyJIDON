/**
 * 执行 sql/migration_task_max_submissions.sql（依赖 backend/.env）
 * 用法：在 backend 目录下 node scripts/runMigrationMaxSubmissions.js
 */
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  try {
    await conn.query(`
      ALTER TABLE tasks
      ADD COLUMN max_submissions INT NOT NULL DEFAULT 1 COMMENT '学生最大可提交次数（每次成功提交计 1 次）' AFTER max_score
    `);
    console.log('max_submissions 列已添加');
  } catch (e) {
    if (e.code === 'ER_DUP_FIELDNAME' || /Duplicate column name/i.test(String(e.message))) {
      console.log('max_submissions 列已存在，跳过');
    } else {
      console.error('迁移失败:', e.message);
      process.exitCode = 1;
    }
  } finally {
    await conn.end();
  }
}

main();
