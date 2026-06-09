const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseOpenAiStreamLine } = require('./llmClient');

describe('parseOpenAiStreamLine', () => {
  it('extracts delta content from OpenAI-compatible chunk', () => {
    const chunks = [];
    const line = 'data: {"choices":[{"delta":{"content":"你好"}}]}';
    const out = parseOpenAiStreamLine(line, (d) => chunks.push(d));
    assert.equal(out, '你好');
    assert.deepEqual(chunks, ['你好']);
  });

  it('ignores DONE sentinel', () => {
    const out = parseOpenAiStreamLine('data: [DONE]', () => {});
    assert.equal(out, '');
  });

  it('ignores malformed JSON', () => {
    const out = parseOpenAiStreamLine('data: {bad', () => {});
    assert.equal(out, '');
  });
});
