/**
 * 执行 sql/migration_teacher_class_isolation.sql（班级/任务数据隔离：关公开、补 teacher_id）
 * 用法：在 backend 目录下 node scripts/run-migration-isolation.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function main() {
  const sqlPath = path.join(__dirname, '..', 'sql', 'migration_teacher_class_isolation.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
  });

  await conn.query(sql);
  console.log('已执行:', sqlPath);
  console.log('当前库:', process.env.DB_NAME);

  const [[{ pub }]] = await conn.query(
    'SELECT COUNT(*) AS pub FROM tasks WHERE COALESCE(is_public, 0) != 0'
  );
  console.log('校验仍为「公开」的任务数（应为 0）:', pub);

  const [clsRows] = await conn.query(
    'SELECT id, class_name, teacher_id FROM classes ORDER BY id'
  );
  console.log('班级 teacher_id:');
  for (const r of clsRows) {
    const flag = r.teacher_id ? 'OK' : '!! 未设置';
    console.log(`  - [${r.id}] ${r.class_name}: teacher_id=${r.teacher_id ?? 'NULL'} ${flag}`);
  }

  await conn.end();
  console.log('完成。若某班 teacher_id 仍为空，请在管理端「班级管理」指定负责教师。');
}

main().catch((e) => {
  console.error('迁移失败:', e.message);
  process.exit(1);
});
