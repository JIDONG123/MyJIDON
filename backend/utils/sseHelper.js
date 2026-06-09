/**

 * SSE 工具：事件格式化、响应头初始化、flush 与心跳

 */



function formatSseEvent(event, data) {

  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

}



function formatSseComment(comment) {

  return `: ${comment}\n\n`;

}



function isAssistantStreamEnabled() {

  return process.env.AI_ASSISTANT_STREAM_ENABLED !== '0';

}



function flushSse(res) {

  if (res && typeof res.flush === 'function') {

    res.flush();

  }

}



/** 初始化 SSE 响应头（含 Nginx X-Accel-Buffering） */

function initSseResponse(res) {

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');

  res.setHeader('Cache-Control', 'no-cache, no-transform');

  res.setHeader('Connection', 'keep-alive');

  res.setHeader('X-Accel-Buffering', 'no');

  if (typeof res.flushHeaders === 'function') {

    res.flushHeaders();

  }

}



/**

 * 写入 SSE 事件并立即 flush（降低反向代理缓冲概率）

 * @returns {boolean} 是否写入成功

 */

function writeSseEvent(res, event, data, { endedCheck } = {}) {

  if (!res || res.writableEnded || endedCheck?.()) return false;

  res.write(formatSseEvent(event, data));

  flushSse(res);

  return true;

}



/** 写入 SSE 注释心跳（: ping） */

function writeSseHeartbeat(res, { endedCheck } = {}) {

  if (!res || res.writableEnded || endedCheck?.()) return false;

  res.write(formatSseComment('ping'));

  flushSse(res);

  return true;

}



/**

 * 启动 SSE 心跳定时器（默认 15s）

 * @returns {NodeJS.Timeout|null}

 */

function createSseHeartbeat(res, intervalMs = 15000, { endedCheck } = {}) {

  const ms = Number(intervalMs) > 0 ? Number(intervalMs) : 15000;

  const timer = setInterval(() => {

    writeSseHeartbeat(res, { endedCheck });

  }, ms);

  if (typeof timer.unref === 'function') {

    timer.unref();

  }

  return timer;

}



function clearSseHeartbeat(timer) {

  if (timer) clearInterval(timer);

}



module.exports = {

  formatSseEvent,

  formatSseComment,

  isAssistantStreamEnabled,

  initSseResponse,

  writeSseEvent,

  writeSseHeartbeat,

  createSseHeartbeat,

  clearSseHeartbeat,

  flushSse,

};


