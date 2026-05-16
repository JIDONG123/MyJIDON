const mysql = require('mysql2/promise');
const fs = require('fs');
const bcrypt = require('bcryptjs');

async function initDatabase() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '123456',
    multipleStatements: true
  });

  const sql = fs.readFileSync('./sql/init.sql', 'utf8');

  const statements = sql.split(';').filter(s => s.trim());
  for (const statement of statements) {
    if (statement.trim()) {
      try {
        await connection.query(statement);
      } catch (err) {
        console.log('Statement error (may be ok):', err.message.substring(0, 50));
      }
    }
  }

  console.log('Database schema created!');

  const hash = bcrypt.hashSync('admin123', 10);
  await connection.query('UPDATE users SET password = ? WHERE username = ?', [hash, 'admin']);
  await connection.query('UPDATE users SET password = ? WHERE username = ?', [hash, 'teacher1']);
  await connection.query('UPDATE users SET password = ? WHERE username = ?', [hash, 'student1']);

  console.log('Passwords updated to: admin123');

  const [rows] = await connection.execute('SELECT username, role FROM users');
  console.log('Users:', rows);

  await connection.end();
  console.log('Database initialization complete!');
}

initDatabase().catch(console.error);