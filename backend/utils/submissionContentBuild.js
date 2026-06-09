const crypto = require('crypto');

const ATTACHMENT_PARSE_MARKER = '---------- 附件解析文本 ----------';
const CODE_CONTENT_MARKER = '---------- 学生代码内容 ----------';
const VL_MARKER = '---------- 图片视觉识别（Qwen-VL） ----------';

function sha256Text(s) {
  return crypto.createHash('sha256').update(String(s || ''), 'utf8').digest('hex');
}

function computeSubmissionCodeHash({ codeContent, codeLanguage, attachmentHashes = [] }) {
  const payload = JSON.stringify({
    code: String(codeContent || '').trim(),
    lang: String(codeLanguage || '').toLowerCase(),
    attachments: [...attachmentHashes].sort(),
  });
  return sha256Text(payload);
}

function studentWrittenDescriptionOnly(content) {
  const s = String(content || '');
  const idx = s.indexOf(ATTACHMENT_PARSE_MARKER);
  if (idx >= 0) return s.slice(0, idx).trim();
  const idx2 = s.indexOf(CODE_CONTENT_MARKER);
  if (idx2 >= 0) return s.slice(0, idx2).trim();
  return s.trim();
}

function buildMergedContent({ submissionText, codeContent, attachmentParseBlocks, vlBlocks }) {
  const parts = [];
  const text = String(submissionText || '').trim();
  if (text) parts.push(text);
  const code = String(codeContent || '').trim();
  if (code) {
    parts.push(`${CODE_CONTENT_MARKER}\n${code}`);
  }
  const attach = (attachmentParseBlocks || []).filter(Boolean).join('\n\n');
  if (attach) {
    parts.push(`${ATTACHMENT_PARSE_MARKER}\n${attach}`);
  }
  const vl = (vlBlocks || []).filter(Boolean).join('\n\n');
  if (vl) parts.push(vl);
  return parts.join('\n\n').trim();
}

function looksLikeCodeInText(text) {
  const s = String(text || '');
  if (s.length < 40) return false;
  const signals = [
    /^\s*(import|from|def |class |function |public static|#include|console\.log)/m,
    /[{};]\s*$/m,
    /\b(function|def|class|int main|public class)\b/,
  ];
  let score = 0;
  for (const re of signals) {
    if (re.test(s)) score += 1;
  }
  return score >= 2;
}

/** AI 批改用：合并文字说明、代码区、全部附件解析与 VL 摘要 */
function buildGradingWorkText(submission, attachments = []) {
  const parts = [];
  const text =
    submission.submission_text != null && String(submission.submission_text).trim()
      ? String(submission.submission_text).trim()
      : studentWrittenDescriptionOnly(submission.content);
  if (text) parts.push(`【学生文字说明】\n${text}`);
  const code = String(submission.code_content || '').trim();
  if (code) {
    const lang = submission.code_language ? `（${submission.code_language}）` : '';
    parts.push(`${CODE_CONTENT_MARKER}${lang}\n${code}`);
  }
  for (const att of attachments || []) {
    const name = att.originalName || att.fileName || att.original_name || '附件';
    const ext = att.fileExt || att.file_ext || '';
    const head = `【附件：${name}${ext ? ` · ${ext}` : ''}】`;
    const parsed = att.parsedText || att.parsed_text;
    const vl = att.visionText || att.vision_text;
    if (parsed?.trim()) {
      parts.push(`${head}\n${parsed.trim()}`);
    } else if (vl?.trim()) {
      parts.push(`${head}\n${VL_MARKER}\n${vl.trim()}`);
    } else {
      parts.push(`${head}\n（未能解析文本内容）`);
    }
  }
  if (!parts.length) {
    return (
      (submission.archive_extracted_text && String(submission.archive_extracted_text).trim()) ||
      submission.content ||
      submission.file_name ||
      ''
    );
  }
  return parts.join('\n\n');
}

module.exports = {
  ATTACHMENT_PARSE_MARKER,
  CODE_CONTENT_MARKER,
  VL_MARKER,
  sha256Text,
  computeSubmissionCodeHash,
  studentWrittenDescriptionOnly,
  buildMergedContent,
  buildGradingWorkText,
  looksLikeCodeInText,
};
