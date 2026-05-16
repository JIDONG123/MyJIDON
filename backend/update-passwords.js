const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

async function updatePasswords() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '123456',
    database: 'smart_grading_system'
  });

  const hash = bcrypt.hashSync('admin123', 10);
  console.log('Generated hash:', hash);

  await connection.execute('UPDATE users SET password = ? WHERE username IN (?, ?, ?)',
    [hash, 'admin', 'teacher1', 'student1']);

  console.log('Passwords updated successfully!');

  const [rows] = await connection.execute('SELECT username, role FROM users');
  console.log('Users:', rows);

  await connection.end();
}

updatePasswords().catch(console.error);