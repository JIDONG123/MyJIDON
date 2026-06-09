/**
 * 手动将种子账号密码同步为与生产一致的 bcryptjs 哈希（可选脚本）
 * 用法：在 backend 目录 node update-passwords.js
 */
const mysql = require('mysql2/promise');
require('./config/loadEnv').loadEnv();

const HASH_ADMIN = '$2a$10$Z9fxLg22Vv//etmNbIllruT6WT0NtsIZTyi7iXD.ezYbDqIOZM0GG';
const HASH_TEACHER_STUDENT = '$2a$10$yCilYCYozCmBP5ykHfbJleRUtIWd5BrQ42E0bXtK1y7oVsoysKSW2';

async function updatePasswords() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'smart_grading_system',
  });

  await connection.execute('UPDATE users SET password = ? WHERE role = ?', [HASH_ADMIN, 'admin']);
  await connection.execute(
    'UPDATE users SET password = ? WHERE role IN (?, ?, ?)',
    [HASH_TEACHER_STUDENT, 'teacher', 'student', 'enterprise']
  );

  console.log('Passwords unified: admin/admin123, teacher|student|enterprise/123456');

  const [rows] = await connection.execute('SELECT username, role FROM users ORDER BY id');
  console.log('Users:', rows);

  await connection.end();
}

updatePasswords().catch(console.error);
