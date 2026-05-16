/**
 * 开发环境：删除旧进程后启动 ecosystem.dev.config.js
 */
const { execSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const cfg = path.join(root, 'ecosystem.dev.config.js');

/** Windows 下隐藏子进程控制台，避免 pm2 拉起时闪黑窗 */
const winHide =
  process.platform === 'win32' ? { windowsHide: true } : {};

try {
  execSync('pm2 delete smart-grading-api', {
    stdio: 'ignore',
    cwd: root,
    env: process.env,
    ...winHide,
  });
} catch {
  /* 不存在则忽略 */
}

execSync(`pm2 start "${cfg}" --env development --update-env`, {
  stdio: 'inherit',
  cwd: root,
  env: process.env,
  ...winHide,
});
