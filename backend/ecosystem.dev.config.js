/**
 * 开发：watch + 忽略目录 + 合并重启防抖（文件名含 ecosystem 便于 PM2 识别）
 *   npm run pm2:dev
 */
const { createApp } = require('./pm2.ecosystem.base');

module.exports = {
  apps: [createApp('development')],
};
