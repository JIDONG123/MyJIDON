/**
 * 批改 Prompt 长度控制：超长提交文本截断/保留关键段
 */
const DEFAULT_MAX = parseInt(process.env.AI_GRADING_PROMPT_MAX_CHARS || '14000', 10);

const CODE_MARKERS = [
  '---------- 附件解析文本 ----------',
  '---------- 代码运行检查 ----------',
  'def ',
  'class ',
  'function ',
  'public ',
  '#include',
  'import ',
];

function extractImportantSections(text) {
  const s = String(text || '');
  const sections = [];
  for (const marker of CODE_MARKERS) {
    const idx = s.indexOf(marker);
    if (idx >= 0) {
      sections.push(s.slice(idx, idx + 4000));
    }
  }
  return sections;
}

/**
 * @returns {{ text: string, summarized: boolean }}
 */
function prepareSubmissionPromptText(raw, maxChars = DEFAULT_MAX) {
  const s = String(raw || '').trim();
  if (!s) return { text: '（无有效文本）', summarized: false };
  if (s.length <= maxChars) return { text: s, summarized: false };

  const head = s.slice(0, Math.floor(maxChars * 0.35));
  const tail = s.slice(-Math.floor(maxChars * 0.25));
  const important = extractImportantSections(s).join('\n\n').slice(0, Math.floor(maxChars * 0.35));

  const combined = [
    head,
    important ? `\n…（中间内容已压缩）…\n${important}` : '\n…（中间内容已截断）…',
    tail,
  ].join('\n');

  const out = combined.length > maxChars ? combined.slice(0, maxChars) : combined;
  return { text: out, summarized: true };
}

module.exports = {
  prepareSubmissionPromptText,
  DEFAULT_MAX,
};
