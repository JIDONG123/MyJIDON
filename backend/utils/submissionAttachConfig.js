/** 学生提交多附件配置 */
const MAX_ATTACHMENTS = parseInt(process.env.SUBMISSION_MAX_ATTACHMENTS || '5', 10);
const MAX_FILE_BYTES = parseInt(process.env.SUBMISSION_MAX_FILE_BYTES || String(50 * 1024 * 1024), 10);
const MAX_TOTAL_BYTES = parseInt(process.env.SUBMISSION_MAX_TOTAL_BYTES || String(100 * 1024 * 1024), 10);

const ALLOWED_EXT = new Set([
  'pdf', 'doc', 'docx', 'txt', 'md',
  'png', 'jpg', 'jpeg', 'webp',
  'zip', 'py', 'js', 'java', 'cpp', 'c', 'html', 'css', 'json', 'sql',
]);

function extOf(name) {
  const m = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}

function isAllowedSubmissionExt(name) {
  return ALLOWED_EXT.has(extOf(name));
}

module.exports = {
  MAX_ATTACHMENTS,
  MAX_FILE_BYTES,
  MAX_TOTAL_BYTES,
  ALLOWED_EXT,
  extOf,
  isAllowedSubmissionExt,
};
