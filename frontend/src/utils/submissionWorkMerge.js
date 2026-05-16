/** 与后端 submissions.content 中拼接的标记一致；标记之后为附件解析全文（送评用），不在「作业正文」展示 */
export const ATTACHMENT_PARSE_MARKER = '---------- 附件解析文本 ----------'

/** 只保留学生在「文字说明」中填写的内容，不包含附件解析块 */
export function studentWrittenDescriptionOnly(raw) {
  if (raw == null || raw === '') return ''
  const s = String(raw)
  const i = s.indexOf(ATTACHMENT_PARSE_MARKER)
  if (i === -1) return s.trim()
  return s.slice(0, i).trim()
}

/** 从批改结果行提取作业展示字段（兼容 snake / camel） */
export function workFromGradingRow(r) {
  if (!r) return { text: '', fileName: '', fileUrl: '', fileType: '' }
  const raw =
    r.submission_content != null
      ? r.submission_content
      : r.submissionContent != null
        ? r.submissionContent
        : ''
  return {
    text: studentWrittenDescriptionOnly(raw),
    fileName: r.submission_file_name || r.submissionFileName || '',
    fileUrl: r.submission_file_url || r.submissionFileUrl || '',
    fileType: r.submission_file_type || r.submissionFileType || '',
  }
}

/** 从 GET /submissions/:id 返回行提取 */
export function workFromSubmissionApi(p) {
  if (!p) return { text: '', fileName: '', fileUrl: '', fileType: '' }
  const raw = p.content != null ? p.content : ''
  return {
    text: studentWrittenDescriptionOnly(raw),
    fileName: p.file_name || '',
    fileUrl: p.file_url || '',
    fileType: p.file_type || '',
  }
}

/** 批改接口缺字段时用提交详情补全（正文、附件名、下载地址） */
export function mergeSubmissionWork(fromGrading, fromSubmission) {
  const a = fromGrading || { text: '', fileName: '', fileUrl: '', fileType: '' }
  const b = fromSubmission || { text: '', fileName: '', fileUrl: '', fileType: '' }
  return {
    text: a.text || b.text,
    fileName: a.fileName || b.fileName,
    fileUrl: a.fileUrl || b.fileUrl,
    fileType: a.fileType || b.fileType,
  }
}
