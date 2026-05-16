/**
 * PM2 应用配置工厂（生产 / 开发共用）
 *
 * - 多 Worker：由 cluster.js + Node cluster 实现；PM2 使用 fork + instances:1，避免与进程内队列冲突。
 * - 开发：watch + watch_delay + ignore_watch；生产：关闭 watch。
 */
const path = require('path');

const projectRoot = __dirname;
const logDir = path.join(projectRoot, 'logs', 'pm2');

const IGNORE_WATCH = [
  'node_modules',
  '**/node_modules/**',
  'logs',
  '**/logs/**',
  'uploads',
  '**/uploads/**',
  'tmp',
  '**/tmp/**',
  '.git',
  '**/.git/**',
  '*.log',
  '**/*.log',
  '.env.local',
  'coverage',
  '**/coverage/**',
];

/**
 * @param {'production' | 'development'} mode
 */
function createApp(mode) {
  const isDev = mode === 'development';

  const app = {
    name: 'smart-grading-api',

    script: path.join(projectRoot, 'cluster.js'),
    cwd: projectRoot,
    interpreter: 'node',
    exec_mode: 'fork',
    instances: 1,

    watch: isDev,
    ignore_watch: IGNORE_WATCH,

    autorestart: true,
    windowsHide: true,

    kill_timeout: 8000,
    shutdown_with_message: false,

    min_uptime: isDev ? 2000 : 10000,
    max_restarts: isDev ? 80 : 15,
    restart_delay: isDev ? 1500 : 4000,
    exp_backoff_restart_delay: isDev ? 2000 : 4000,

    max_memory_restart: isDev ? '1024M' : '1536M',

    merge_logs: false,
    time: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    error_file: path.join(logDir, 'smart-grading-api-error.log'),
    out_file: path.join(logDir, 'smart-grading-api-out.log'),

    env: {
      NODE_ENV: isDev ? 'development' : 'production',
      PORT: process.env.PORT || '3000',
      USE_CLUSTER: '1',
      ...(isDev ? { CLUSTER_WORKERS: process.env.CLUSTER_WORKERS || '2' } : {}),
    },
    env_development: {
      NODE_ENV: 'development',
      PORT: process.env.PORT || '3000',
      USE_CLUSTER: '1',
      CLUSTER_WORKERS: process.env.CLUSTER_WORKERS || '2',
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: process.env.PORT || '3000',
      USE_CLUSTER: '1',
    },
  };

  if (isDev) {
    app.watch_delay = 1500;
    app.watch_options = {
      followSymlinks: false,
      usePolling: process.env.PM2_USE_POLLING === '1',
    };
  }

  return app;
}

module.exports = { createApp, projectRoot, logDir, IGNORE_WATCH };
