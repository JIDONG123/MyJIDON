/**
 * 本地手工初始化库（可选）；推荐 Docker 使用 init.sql + 自动迁移
 */
const mysql = require('mysql2/promise');
const fs = require('fs');
require('./config/loadEnv').loadEnv();

const HASH_ADMIN = '$2a$10$Z9fxLg22Vv//etmNbIllruT6WT0NtsIZTyi7iXD.ezYbDqIOZM0GG';
const HASH_TEACHER_STUDENT = '$2a$10$yCilYCYozCmBP5ykHfbJleRUtIWd5BrQ42E0bXtK1y7oVsoysKSW2';

async function initDatabase() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '123456',
    multipleStatements: true,
  });

  const sql = fs.readFileSync('./sql/init.sql', 'utf8');
  await connection.query(sql);
  console.log('Database schema created from init.sql');

  await connection.query('USE ??', [process.env.DB_NAME || 'smart_grading_system']);
  await connection.query('UPDATE users SET password = ? WHERE role = ?', [HASH_ADMIN, 'admin']);
  await connection.query('UPDATE users SET password = ? WHERE role IN (?, ?, ?)', [
    HASH_TEACHER_STUDENT,
    'teacher',
    'student',
    'enterprise',
  ]);

  console.log('Seed passwords: admin/admin123, teacher|student/123456');

  const [rows] = await connection.execute('SELECT username, role FROM users');
  console.log('Users:', rows);

  await connection.end();
  console.log('Database initialization complete!');
}

initDatabase().catch(console.error);
