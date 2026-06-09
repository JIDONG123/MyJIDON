function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatInline(s) {
  let t = escapeHtml(s)
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>')
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  return t
}

function isBlank(line) {
  return !String(line || '').trim()
}

function isDivider(line) {
  return /^-{3,}$/.test(String(line || '').trim())
}

function isHeading(line) {
  return /^#{1,6}\s+/.test(String(line || '').trim())
}

function isBullet(line) {
  return /^[-*]\s+/.test(String(line || '').trim())
}

function isOrdered(line) {
  return /^\d+\.\s+/.test(String(line || '').trim())
}

function isFenceOpen(line) {
  return /^```/.test(String(line || '').trim())
}

function buildCodePanel(code, lang) {
  const escaped = escapeHtml(String(code || ''))
  const langLabel = lang ? escapeHtml(lang) : ''
  const toolbar = langLabel
    ? `<div class="asst-code-toolbar"><span class="asst-code-lang">${langLabel}</span></div>`
    : ''
  return `<div class="asst-code-panel">${toolbar}<pre class="asst-pre"><code class="asst-code-block">${escaped}</code></pre></div>`
}

/** 流式输出中的轻量预览：避免频繁全量 Markdown 解析 */
export function formatAssistantStreamPreview(text) {
  let raw = String(text || '')
  const fenceCount = (raw.match(/```/g) || []).length
  if (fenceCount % 2 === 1) {
    const lastFence = raw.lastIndexOf('```')
    raw = raw.slice(0, lastFence)
  }
  return escapeHtml(raw).replace(/\n/g, '<br />')
}

/**
 * 将助手回答转为正式排版 HTML（隐藏原始 Markdown 符号）
 */
export function formatAssistantContent(text) {
  const lines = String(text || '').split('\n')
  const parts = []
  let i = 0

  while (i < lines.length) {
    if (isBlank(lines[i])) {
      i += 1
      continue
    }

    const trimmed = lines[i].trim()

    if (isFenceOpen(trimmed)) {
      const lang = trimmed.slice(3).trim()
      i += 1
      const codeLines = []
      while (i < lines.length && !isFenceOpen(lines[i].trim())) {
        codeLines.push(lines[i])
        i += 1
      }
      if (i < lines.length) i += 1
      parts.push(buildCodePanel(codeLines.join('\n'), lang))
      continue
    }

    if (isDivider(trimmed)) {
      parts.push('<div class="asst-divider" role="separator"></div>')
      i += 1
      continue
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/)
    if (heading) {
      const level = Math.min(heading[1].length, 4)
      parts.push(
        `<h${level} class="asst-heading asst-heading--${level}">${formatInline(heading[2])}</h${level}>`
      )
      i += 1
      continue
    }

    if (isBullet(trimmed)) {
      const items = []
      while (i < lines.length && isBullet(lines[i])) {
        items.push(`<li>${formatInline(lines[i].trim().replace(/^[-*]\s+/, ''))}</li>`)
        i += 1
      }
      parts.push(`<ul class="asst-list">${items.join('')}</ul>`)
      continue
    }

    if (isOrdered(trimmed)) {
      const items = []
      while (i < lines.length && isOrdered(lines[i])) {
        items.push(`<li>${formatInline(lines[i].trim().replace(/^\d+\.\s+/, ''))}</li>`)
        i += 1
      }
      parts.push(`<ol class="asst-list asst-list--ordered">${items.join('')}</ol>`)
      continue
    }

    const paraLines = []
    while (i < lines.length) {
      const t = lines[i].trim()
      if (
        isBlank(lines[i]) ||
        isDivider(t) ||
        isHeading(t) ||
        isBullet(t) ||
        isOrdered(t) ||
        isFenceOpen(t)
      ) {
        break
      }
      paraLines.push(formatInline(t))
      i += 1
    }
    if (paraLines.length) {
      parts.push(`<p class="asst-p">${paraLines.join('<br />')}</p>`)
    }
  }

  return parts.join('') || ''
}
