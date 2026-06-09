/**
 * 知识图谱构建队列（进程内单 worker，不阻塞批改/提交流程）
 */

const { runBuildJob } = require('../services/kgBuildService');

const queue = [];
let processing = false;

function enqueueBuild(jobId) {
  if (!jobId) return;
  queue.push(Number(jobId));
  void drain();
}

async function drain() {
  if (processing) return;
  processing = true;
  while (queue.length) {
    const jobId = queue.shift();
    try {
      await runBuildJob(jobId);
    } catch (e) {
      console.error('[kgBuildQueue]', jobId, e.message);
    }
  }
  processing = false;
}

module.exports = {
  enqueueBuild,
};
