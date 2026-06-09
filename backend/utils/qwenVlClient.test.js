const test = require('node:test');
const assert = require('node:assert/strict');
const {
  formatRecognitionForGrading,
  tryParseRecognitionJson,
} = require('./qwenVlClient');

test('tryParseRecognitionJson parses object', () => {
  const raw = '{"imageType":"操作截图","extractedText":"hello","operationSteps":["a"],"answerContent":"x","pageFlow":"y","otherNotes":""}';
  const obj = tryParseRecognitionJson(raw);
  assert.equal(obj.imageType, '操作截图');
  assert.equal(obj.extractedText, 'hello');
});

test('formatRecognitionForGrading builds marker block', () => {
  const text = formatRecognitionForGrading({
    imageType: '代码截图',
    extractedText: 'main()',
    operationSteps: ['打开IDE'],
    answerContent: '完成',
    pageFlow: '登录页',
    otherNotes: '',
  });
  assert.match(text, /图片视觉识别（Qwen-VL）/);
  assert.match(text, /【提取文字】main\(\)/);
});
