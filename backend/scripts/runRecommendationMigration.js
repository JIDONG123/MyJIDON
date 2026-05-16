/**
 * 执行 sql/migration_class_recommendation_rules.sql（班级分层推荐阈值列）
 * 用法：在 backend 目录下 node scripts/runRecommendationMigration.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');

async function main() {
  const sqlPath = path.join(__dirname, '..', 'sql', 'migration_class_recommendation_rules.sql');
  const raw = fs.readFileSync(sqlPath, 'utf8');
  const sql = raw
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .trim();

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
  });

  try {
    await conn.query(sql);
    console.log('OK: migration_class_recommendation_rules 已执行。');
  } catch (e) {
    if (e.code === 'ER_DUP_FIELDNAME') {
      console.log('跳过: 列已存在，无需再次迁移。');
    } else {
      throw e;
    }
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
