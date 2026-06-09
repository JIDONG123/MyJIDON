/** 与后端 submissions.content 中拼接的标记一致 */
export const ATTACHMENT_PARSE_MARKER = '---------- 附件解析文本 ----------'
export const CODE_CONTENT_MARKER = '---------- 学生代码内容 ----------'

export function studentWrittenDescriptionOnly(raw) {
  if (raw == null || raw === '') return ''
  const s = String(raw)
  let cut = s.length
  for (const marker of [ATTACHMENT_PARSE_MARKER, CODE_CONTENT_MARKER]) {
    const i = s.indexOf(marker)
    if (i >= 0) cut = Math.min(cut, i)
  }
  return s.slice(0, cut).trim()
}

export function workFromGradingRow(r) {
  if (!r) return { text: '', codeContent: '', attachments: [], fileName: '', fileUrl: '', fileType: '' }
  const raw =
    r.submission_content != null
      ? r.submission_content
      : r.submissionContent != null
        ? r.submissionContent
        : ''
  const text =
    r.submission_text != null && String(r.submission_text).trim()
      ? String(r.submission_text).trim()
      : studentWrittenDescriptionOnly(raw)
  return {
    text,
    codeContent: r.code_content || r.codeContent || '',
    attachments: r.attachments || [],
    fileName: r.submission_file_name || r.submissionFileName || '',
    fileUrl: r.submission_file_url || r.submissionFileUrl || '',
    fileType: r.submission_file_type || r.submissionFileType || '',
  }
}

export function workFromSubmissionApi(p) {
  if (!p) return { text: '', codeContent: '', attachments: [], fileName: '', fileUrl: '', fileType: '' }
  const text =
    p.submission_text != null && String(p.submission_text).trim()
      ? String(p.submission_text).trim()
      : studentWrittenDescriptionOnly(p.content)
  return {
    text,
    codeContent: p.code_content || '',
    codeLanguage: p.code_language || '',
    attachments: p.attachments || [],
    fileName: p.file_name || '',
    fileUrl: p.file_url || '',
    fileType: p.file_type || '',
  }
}

export function mergeSubmissionWork(fromGrading, fromSubmission) {
  const a = fromGrading || { text: '', codeContent: '', attachments: [], fileName: '', fileUrl: '', fileType: '' }
  const b = fromSubmission || { text: '', codeContent: '', attachments: [], fileName: '', fileUrl: '', fileType: '' }
  const attachments = (b.attachments?.length ? b.attachments : a.attachments) || []
  return {
    text: a.text || b.text,
    codeContent: a.codeContent || b.codeContent,
    codeLanguage: a.codeLanguage || b.codeLanguage,
    attachments,
    fileName: a.fileName || b.fileName || attachments[0]?.originalName || attachments[0]?.fileName || '',
    fileUrl: a.fileUrl || b.fileUrl || attachments[0]?.fileUrl || '',
    fileType: a.fileType || b.fileType || attachments[0]?.mimeType || '',
  }
}

export function formatFileSize(bytes) {
  if (bytes == null || Number.isNaN(Number(bytes))) return '—'
  const n = Number(bytes)
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
