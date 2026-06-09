const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  formatSseEvent,
  formatSseComment,
  isAssistantStreamEnabled,
  initSseResponse,
  writeSseEvent,
  writeSseHeartbeat,
  flushSse,
} = require('./sseHelper');

describe('formatSseEvent', () => {
  it('formats start event with JSON data', () => {
    const block = formatSseEvent('start', { sessionId: 1, userMessageId: 2 });
    assert.match(block, /^event: start\n/);
    assert.match(block, /data: \{"sessionId":1,"userMessageId":2\}\n\n$/);
  });

  it('formats delta event', () => {
    const block = formatSseEvent('delta', { content: '你好' });
    assert.equal(block, 'event: delta\ndata: {"content":"你好"}\n\n');
  });
});

describe('formatSseComment', () => {
  it('formats heartbeat comment', () => {
    assert.equal(formatSseComment('ping'), ': ping\n\n');
  });
});

describe('isAssistantStreamEnabled', () => {
  it('defaults to enabled', () => {
    const prev = process.env.AI_ASSISTANT_STREAM_ENABLED;
    delete process.env.AI_ASSISTANT_STREAM_ENABLED;
    assert.equal(isAssistantStreamEnabled(), true);
    if (prev !== undefined) process.env.AI_ASSISTANT_STREAM_ENABLED = prev;
  });

  it('disabled when env is 0', () => {
    const prev = process.env.AI_ASSISTANT_STREAM_ENABLED;
    process.env.AI_ASSISTANT_STREAM_ENABLED = '0';
    assert.equal(isAssistantStreamEnabled(), false);
    if (prev !== undefined) process.env.AI_ASSISTANT_STREAM_ENABLED = prev;
    else delete process.env.AI_ASSISTANT_STREAM_ENABLED;
  });
});

describe('initSseResponse', () => {
  it('sets SSE headers and flushes headers', () => {
    const headers = {};
    let flushed = false;
    const res = {
      setHeader(k, v) {
        headers[k] = v;
      },
      flushHeaders() {
        flushed = true;
      },
    };
    initSseResponse(res);
    assert.equal(headers['Content-Type'], 'text/event-stream; charset=utf-8');
    assert.equal(headers['Cache-Control'], 'no-cache, no-transform');
    assert.equal(headers['X-Accel-Buffering'], 'no');
    assert.equal(flushed, true);
  });
});

describe('writeSseEvent', () => {
  it('writes event and calls flush', () => {
    const chunks = [];
    let flushed = false;
    const res = {
      writableEnded: false,
      write(s) {
        chunks.push(s);
      },
      flush() {
        flushed = true;
      },
    };
    const ok = writeSseEvent(res, 'delta', { content: 'a' });
    assert.equal(ok, true);
    assert.equal(chunks.length, 1);
    assert.match(chunks[0], /event: delta/);
    assert.equal(flushed, true);
  });

  it('skips write when ended', () => {
    const res = { writableEnded: true, write() { throw new Error('should not write'); } };
    assert.equal(writeSseEvent(res, 'delta', { content: 'a' }), false);
  });
});

describe('writeSseHeartbeat', () => {
  it('writes ping comment', () => {
    const chunks = [];
    const res = {
      writableEnded: false,
      write(s) {
        chunks.push(s);
      },
    };
    writeSseHeartbeat(res);
    assert.equal(chunks[0], ': ping\n\n');
  });
});

describe('flushSse', () => {
  it('no-op when flush missing', () => {
    assert.doesNotThrow(() => flushSse({}));
  });
});
