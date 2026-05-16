/**
 * 生产：无 watch
 *   npm run pm2:start
 */
const { createApp } = require('./pm2.ecosystem.base');

module.exports = {
  apps: [createApp('production')],
};
