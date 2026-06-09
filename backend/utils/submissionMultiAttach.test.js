/**
 * node --test utils/submissionMultiAttach.test.js
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  computeSubmissionCodeHash,
  buildMergedContent,
  looksLikeCodeInText,
  validateSubmitInput,
} = require('../services/submissionSubmitService');
const {
  computeSubmissionCodeHash: hashFromUtil,
  buildGradingWorkText: gradingText,
  looksLikeCodeInText: looksCode,
} = require('./submissionContentBuild');
const { MAX_ATTACHMENTS, MAX_FILE_BYTES, MAX_TOTAL_BYTES, isAllowedSubmissionExt } = require('./submissionAttachConfig');
const { legacyAttachmentFromSubmission } = require('../services/submissionAttachmentService');

test('validateSubmitInput requires at least one of text/code/files', async () => {
  assert.equal((await validateSubmitInput({ submissionText: '', codeContent: '', files: [] })).ok, false);
  assert.equal((await validateSubmitInput({ submissionText: 'hi', codeContent: '', files: [] })).ok, true);
  assert.equal((await validateSubmitInput({ submissionText: '', codeContent: 'print(1)', files: [] })).ok, true);
  assert.equal((await validateSubmitInput({ submissionText: '', codeContent: '', files: [{}] })).ok, true);
});

test('computeSubmissionCodeHash changes when code or attachments change', () => {
  const h1 = hashFromUtil({ codeContent: 'a=1', codeLanguage: 'python', attachmentHashes: [] });
  const h2 = hashFromUtil({ codeContent: 'a=2', codeLanguage: 'python', attachmentHashes: [] });
  const h3 = hashFromUtil({ codeContent: 'a=1', codeLanguage: 'python', attachmentHashes: ['abc'] });
  assert.notEqual(h1, h2);
  assert.notEqual(h1, h3);
});

test('looksLikeCodeInText detects code in prose', () => {
  const code = 'import os\n\ndef main():\n    print("hello")\n\nif __name__ == "__main__":\n    main()';
  assert.equal(looksCode(code), true);
  assert.equal(looksCode('今天完成了实验报告'), false);
});

test('buildGradingWorkText includes text code and attachments', () => {
  const text = gradingText(
    { submission_text: '说明', code_content: 'print(1)', code_language: 'python', content: '' },
    [{ originalName: 'a.py', parsedText: 'print(1)', fileExt: 'py' }]
  );
  assert.match(text, /文字说明/);
  assert.match(text, /print\(1\)/);
  assert.match(text, /a\.py/);
});

test('buildMergedContent merges sections', () => {
  const merged = buildMergedContent({
    submissionText: '说明',
    codeContent: 'x=1',
    attachmentParseBlocks: ['【附件：a.txt】\nhello'],
    vlBlocks: [],
  });
  assert.match(merged, /说明/);
  assert.match(merged, /x=1/);
  assert.match(merged, /a\.txt/);
});

test('attachment limits and allowed extensions', () => {
  assert.equal(MAX_ATTACHMENTS, 5);
  assert.equal(MAX_FILE_BYTES, 50 * 1024 * 1024);
  assert.equal(MAX_TOTAL_BYTES, 100 * 1024 * 1024);
  assert.equal(isAllowedSubmissionExt('report.pdf'), true);
  assert.equal(isAllowedSubmissionExt('evil.exe'), false);
});

test('legacy single attachment fallback', () => {
  const list = legacyAttachmentFromSubmission({
    id: 1,
    file_path: '/uploads/x.pdf',
    file_name: 'x.pdf',
    file_type: 'application/pdf',
  });
  assert.equal(list.length, 1);
  assert.equal(list[0].legacy, true);
});

test('code hash export from submit service matches util', () => {
  const a = computeSubmissionCodeHash({ codeContent: '1', codeLanguage: 'python', attachmentHashes: [] });
  const b = hashFromUtil({ codeContent: '1', codeLanguage: 'python', attachmentHashes: [] });
  assert.equal(a, b);
});
