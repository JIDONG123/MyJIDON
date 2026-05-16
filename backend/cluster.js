require('./config/loadEnv').loadEnv();
const cluster = require('cluster');
const os = require('os');

const useCluster = process.env.USE_CLUSTER === '1' || process.env.USE_CLUSTER === 'true';

if (useCluster && cluster.isPrimary) {
  const cpus = os.cpus().length;
  const n = Math.min(
    Math.max(1, parseInt(process.env.CLUSTER_WORKERS || String(cpus), 10) || cpus),
    64
  );
  console.log(`[cluster] primary ${process.pid}, spawning ${n} workers`);
  for (let i = 0; i < n; i += 1) {
    cluster.fork();
  }
  cluster.on('exit', (worker, code, signal) => {
    console.warn(`[cluster] worker ${worker.process.pid} died (${code}/${signal}), restarting`);
    cluster.fork();
  });
} else {
  (async () => {
    try {
      const { listenApp } = require('./createHttpServer');
      const PORT = process.env.PORT || 3000;
      await listenApp(PORT);
      console.log(`Server (pid ${process.pid}) listening on port ${PORT}`);
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
  })();
}
