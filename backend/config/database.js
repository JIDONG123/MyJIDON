require('./loadEnv').loadEnv();
const mysql = require('mysql2/promise');

function parseIntEnv(name, def) {
  const v = parseInt(process.env[name], 10);
  return Number.isFinite(v) && v >= 0 ? v : def;
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: parseIntEnv('DB_POOL_CONNECTION_LIMIT', 50),
  queueLimit: parseIntEnv('DB_POOL_QUEUE_LIMIT', 100),
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

module.exports = pool;