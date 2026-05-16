const http = require('http');
const { createApp } = require('./app');
const { initSocketServer } = require('./socket/socketServer');

/**
 * 创建 HTTP Server 并挂载 Socket.IO（与 Express 共用端口）
 * @param {number} port
 */
async function listenApp(port) {
  const app = createApp();
  const server = http.createServer(app);
  await initSocketServer(server);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => {
      resolve({ app, server });
    });
  });
}

module.exports = { listenApp };
