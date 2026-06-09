/**
 * Node.js cluster 入口：主进程唯一执行数据库 bootstrap，工作进程仅监听 HTTP。
 * 单进程模式（USE_CLUSTER=0）：当前进程 bootstrap 后启动服务。
 */
require('./config/loadEnv').loadEnv();

const cluster = require('cluster');
const os = require('os');

const useCluster =
  process.env.USE_CLUSTER === '1' || process.env.USE_CLUSTER === 'true';

/** Node 16+ isPrimary；旧版兼容 isMaster */
function isClusterPrimary() {
  if (typeof cluster.isPrimary === 'boolean') return cluster.isPrimary;
  if (typeof cluster.isMaster === 'boolean') return cluster.isMaster;
  return true;
}

function isClusterWorker() {
  if (typeof cluster.isWorker === 'boolean') return cluster.isWorker;
  return !isClusterPrimary();
}

async function startHttpServer() {
  const { listenApp } = require('./createHttpServer');
  const port = Number(process.env.PORT) || 3000;
  await listenApp(port);
  const role = useCluster && isClusterWorker() ? 'worker' : 'process';
  console.log(`[cluster] ${role} pid=${process.pid} listening on port ${port}`);
}

async function runDatabaseBootstrap() {
  const { bootstrapDatabase } = require('./db/bootstrap');
  console.log(`[cluster] primary pid=${process.pid} — database bootstrap starting`);
  await bootstrapDatabase();
  console.log(`[cluster] primary pid=${process.pid} — database bootstrap done`);
}

async function runSingleProcessMode() {
  try {
    await runDatabaseBootstrap();
    await startHttpServer();
  } catch (err) {
    console.error('[cluster] single-process startup failed:', err.message || err);
    process.exit(1);
  }
}

async function runPrimaryProcess() {
  try {
    await runDatabaseBootstrap();

    const cpus = os.cpus().length;
    const n = Math.min(
      Math.max(1, parseInt(process.env.CLUSTER_WORKERS || String(cpus), 10) || cpus),
      64
    );
    console.log(`[cluster] primary pid=${process.pid}, forking ${n} worker(s)`);

    for (let i = 0; i < n; i += 1) {
      cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
      if (code !== 0 && signal !== 'SIGTERM') {
        console.warn(
          `[cluster] worker ${worker.process.pid} exited (code=${code}, signal=${signal}), restarting`
        );
        cluster.fork();
      }
    });
  } catch (err) {
    console.error('[cluster] primary bootstrap failed:', err.message || err);
    process.exit(1);
  }
}

async function runWorkerProcess() {
  try {
    console.log(`[cluster] worker pid=${process.pid} — skip database bootstrap`);
    await startHttpServer();
  } catch (err) {
    console.error(`[cluster] worker pid=${process.pid} failed:`, err.message || err);
    process.exit(1);
  }
}

if (!useCluster) {
  runSingleProcessMode();
} else if (isClusterPrimary()) {
  runPrimaryProcess();
} else if (isClusterWorker()) {
  runWorkerProcess();
} else {
  runSingleProcessMode();
}
