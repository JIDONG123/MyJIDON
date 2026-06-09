/**
 * BullMQ contentSafetyQueue 预留（CONTENT_SAFETY_ASYNC=1 时启用）
 */
function isContentSafetyQueueEnabled() {
  return process.env.CONTENT_SAFETY_ASYNC === '1' && process.env.BULLMQ_ENABLED === '1';
}

async function enqueueContentSafetyScan(_payload) {
  if (!isContentSafetyQueueEnabled()) return { queued: false };
  // const { Queue } = require('bullmq');
  // contentSafetyQueue.add('scan', payload);
  return { queued: true, queue: 'contentSafetyQueue' };
}

module.exports = {
  isContentSafetyQueueEnabled,
  enqueueContentSafetyScan,
};
