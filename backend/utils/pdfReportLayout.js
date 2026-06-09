const { pickCjkFont } = require('./pdfChineseFont');
const { formatDateTime, emptyDash } = require('./exportFormatters');

const PT_A4_W = 595.28;
const PT_A4_H = 841.89;
const MARGIN = 48;
const FOOTER_ZONE = 42;
const PRIMARY = '#0b3d6d';
const TEXT = '#1e293b';
const MUTED = '#64748b';
const BORDER = '#cbd5e1';
const HEADER_BG = '#e8f0fe';
const ROW_ALT = '#f8fafc';

/**
 * @returns {{ fontPath: string|null, error?: string }}
 */
function registerChineseFont(doc) {
  const fontPath = pickCjkFont();
  if (!fontPath) {
    return {
      fontPath: null,
      error:
        '服务器未找到可用的中文字体文件。请在服务器安装 Noto CJK / 文泉驿等字体，或设置环境变量 PDF_CJK_FONT 指向 .ttf/.otf 绝对路径（Windows 常见：C:\\Windows\\Fonts\\simhei.ttf）。',
    };
  }
  doc.font(fontPath);
  return { fontPath };
}

/**
 * @param {PDFKit.PDFDocument} doc
 * @param {object} ctx
 */
function createLayoutContext(doc, fontPath, options = {}) {
  const exportTime = options.exportTime || new Date();
  const pageW = doc.page?.width || PT_A4_W;
  const pageH = doc.page?.height || PT_A4_H;
  const ctx = {
    doc,
    fontPath,
    margin: MARGIN,
    contentW: pageW - MARGIN * 2,
    pageW,
    pageH,
    exportTime,
    footerLabel: options.footerLabel || '龙芯智训',
    compactHeaderTitle: options.compactHeaderTitle || '龙芯智训 · 学生实训成绩单',
    bottomLimit: pageH - MARGIN - FOOTER_ZONE,
  };
  return ctx;
}

function applyFont(ctx, size = 10, color = TEXT) {
  ctx.doc.font(ctx.fontPath).fontSize(size).fillColor(color);
}

function contentBottom(ctx) {
  return ctx.bottomLimit;
}

/**
 * @param {PDFKit.PDFDocument} doc
 * @param {object} ctx
 * @param {number} neededHeight
 */
function ensurePageSpace(ctx, neededHeight) {
  const { doc } = ctx;
  if (doc.y + neededHeight <= contentBottom(ctx)) return;
  doc.addPage();
  doc.y = MARGIN;
  drawCompactHeader(ctx);
}

function drawCompactHeader(ctx) {
  const { doc } = ctx;
  applyFont(ctx, 9, MUTED);
  doc.text(ctx.compactHeaderTitle || '龙芯智训 · 学生实训成绩单', MARGIN, MARGIN - 8, {
    width: ctx.contentW,
    align: 'left',
  });
  doc.y = MARGIN + 14;
}

/**
 * @param {PDFKit.PDFDocument} doc
 * @param {object} ctx
 * @param {{ mainTitle?: string, subTitle?: string }} opts
 */
function drawHeader(ctx, opts = {}) {
  const { doc } = ctx;
  const mainTitle = opts.mainTitle || '龙芯智训·学生实训成绩单';
  const subTitle = opts.subTitle || '校企协同实训智慧评价平台';

  doc.y = MARGIN;
  applyFont(ctx, 20, PRIMARY);
  doc.text(mainTitle, MARGIN, doc.y, { width: ctx.contentW, align: 'center' });
  doc.moveDown(0.35);
  applyFont(ctx, 11, MUTED);
  doc.text(subTitle, MARGIN, doc.y, { width: ctx.contentW, align: 'center' });
  doc.moveDown(0.85);
}

/**
 * 在所有页面绘制页脚（需在 doc.end() 前调用）
 */
function drawFootersOnAllPages(ctx) {
  const { doc, exportTime, footerLabel } = ctx;
  const range = doc.bufferedPageRange();
  const total = range.count;
  const timeStr = formatDateTime(exportTime);

  for (let i = 0; i < total; i += 1) {
    doc.switchToPage(range.start + i);
    const pageH = doc.page.height;
    const pageW = doc.page.width;
    const contentW = pageW - MARGIN * 2;
    const y = pageH - MARGIN + 6;
    doc.save();
    doc.strokeColor(BORDER).lineWidth(0.5).moveTo(MARGIN, y - 8).lineTo(pageW - MARGIN, y - 8).stroke();
    applyFont(ctx, 8, MUTED);
    const left = `${footerLabel} · 导出时间 ${timeStr}`;
    doc.text(left, MARGIN, y, { width: contentW * 0.75, align: 'left', lineBreak: false });
    doc.text(`第 ${i + 1} / ${total} 页`, MARGIN, y, { width: contentW, align: 'right', lineBreak: false });
    doc.restore();
  }
}

/**
 * @param {object} ctx
 * @param {string} title
 */
function drawSectionTitle(ctx, title) {
  const { doc } = ctx;
  ensurePageSpace(ctx, 36);
  doc.moveDown(0.35);
  const barY = doc.y;
  const barH = 22;
  doc.save();
  doc.fillColor(HEADER_BG).rect(MARGIN, barY, ctx.contentW, barH).fill();
  applyFont(ctx, 11, PRIMARY);
  doc.text(title, MARGIN + 8, barY + 5, { width: ctx.contentW - 16, align: 'left' });
  doc.restore();
  doc.y = barY + barH + 8;
}

function measureCellHeight(ctx, text, width, fontSize = 9) {
  applyFont(ctx, fontSize, TEXT);
  const t = emptyDash(text);
  return Math.max(18, ctx.doc.heightOfString(t, { width: width - 10, align: 'left' }) + 10);
}

/**
 * rows: Array<{ label: string, value: string }>
 * columns: 每行几组 label-value（默认 2 组 = 4 列）
 */
function drawKeyValueTable(ctx, rows, columns = 2) {
  const { doc } = ctx;
  const tableW = ctx.contentW;
  const groupW = tableW / columns;
  const labelW = groupW * 0.32;
  const valueW = groupW * 0.68;

  let rowIdx = 0;
  while (rowIdx < rows.length) {
    const chunk = rows.slice(rowIdx, rowIdx + columns);
    let rowH = 20;
    for (const item of chunk) {
      const h = Math.max(
        measureCellHeight(ctx, item.label, labelW, 9),
        measureCellHeight(ctx, item.value, valueW, 9)
      );
      rowH = Math.max(rowH, h);
    }
    ensurePageSpace(ctx, rowH + 4);

    const startY = doc.y;
    let x = MARGIN;
    for (const item of chunk) {
      doc.save();
      doc.strokeColor(BORDER).lineWidth(0.5).rect(x, startY, labelW, rowH).stroke();
      doc.rect(x + labelW, startY, valueW, rowH).stroke();
      applyFont(ctx, 8.5, MUTED);
      doc.text(emptyDash(item.label), x + 5, startY + 5, { width: labelW - 10, align: 'left' });
      applyFont(ctx, 9, TEXT);
      doc.text(emptyDash(item.value), x + labelW + 5, startY + 5, { width: valueW - 10, align: 'left' });
      doc.restore();
      x += groupW;
    }
    for (let i = chunk.length; i < columns; i += 1) {
      doc.save();
      doc.strokeColor(BORDER).lineWidth(0.5).rect(x, startY, labelW, rowH).stroke();
      doc.rect(x + labelW, startY, valueW, rowH).stroke();
      doc.restore();
      x += groupW;
    }
    doc.y = startY + rowH + 2;
    rowIdx += columns;
  }
  doc.moveDown(0.25);
}

/**
 * @param {object} ctx
 * @param {Array<{ label: string, value: string }>} items
 */
function drawScoreSummary(ctx, items) {
  const { doc } = ctx;
  const cols = items.length || 4;
  const colW = ctx.contentW / cols;
  let maxH = 24;
  for (const it of items) {
    maxH = Math.max(maxH, measureCellHeight(ctx, it.value, colW - 8, 14) + 14);
  }
  ensurePageSpace(ctx, maxH + 8);

  const startY = doc.y;
  let x = MARGIN;
  for (const it of items) {
    doc.save();
    doc.strokeColor(BORDER).lineWidth(0.5).rect(x, startY, colW, maxH).stroke();
    applyFont(ctx, 8.5, MUTED);
    doc.text(emptyDash(it.label), x + 4, startY + 6, { width: colW - 8, align: 'center' });
    applyFont(ctx, 14, PRIMARY);
    doc.text(emptyDash(it.value), x + 4, startY + 20, { width: colW - 8, align: 'center' });
    doc.restore();
    x += colW;
  }
  doc.y = startY + maxH + 10;
}

/**
 * @param {object} ctx
 * @param {{ headers: string[], rows: string[][], colWidths?: number[] }} table
 */
function drawSimpleTable(ctx, table) {
  const { doc } = ctx;
  const { headers, rows } = table;
  const headerStyle = table.headerStyle || 'light';
  const n = headers.length;
  const colWidths =
    table.colWidths ||
    headers.map(() => ctx.contentW / n);

  const tableW = colWidths.reduce((a, b) => a + b, 0);
  const startX = MARGIN + Math.max(0, (ctx.contentW - tableW) / 2);
  const headerFill = headerStyle === 'dark' ? PRIMARY : HEADER_BG;
  const headerTextColor = headerStyle === 'dark' ? '#ffffff' : PRIMARY;

  function drawRow(cells, y, h, isHeader, alt) {
    let x = startX;
    if (isHeader) {
      doc.save();
      doc.fillColor(headerFill).rect(startX, y, tableW, h).fill();
      doc.restore();
    } else if (alt) {
      doc.save();
      doc.fillColor(ROW_ALT).rect(startX, y, tableW, h).fill();
      doc.restore();
    }
    for (let i = 0; i < n; i += 1) {
      doc.save();
      doc.strokeColor(BORDER).lineWidth(0.5).rect(x, y, colWidths[i], h).stroke();
      if (isHeader) {
        applyFont(ctx, 8.5, headerTextColor);
      } else {
        applyFont(ctx, 8, TEXT);
      }
      doc.text(emptyDash(cells[i]), x + 3, y + 4, { width: colWidths[i] - 6, align: 'left' });
      doc.restore();
      x += colWidths[i];
    }
  }

  let headerH = 22;
  for (let i = 0; i < n; i += 1) {
    headerH = Math.max(headerH, measureCellHeight(ctx, headers[i], colWidths[i], 9));
  }
  ensurePageSpace(ctx, headerH + 4);
  let y = doc.y;
  drawRow(headers, y, headerH, true, false);
  y += headerH;

  rows.forEach((cells, ri) => {
    let rowH = 20;
    for (let i = 0; i < n; i += 1) {
      rowH = Math.max(rowH, measureCellHeight(ctx, cells[i], colWidths[i], 8.5));
    }
    if (y + rowH > contentBottom(ctx)) {
      doc.addPage({ layout: table.pageLayout || doc.page.layout, size: doc.page.size });
      ctx.pageW = doc.page.width;
      ctx.pageH = doc.page.height;
      ctx.contentW = ctx.pageW - MARGIN * 2;
      ctx.bottomLimit = ctx.pageH - MARGIN - FOOTER_ZONE;
      doc.y = MARGIN;
      drawCompactHeader(ctx);
      y = doc.y;
      drawRow(headers, y, headerH, true, false);
      y += headerH;
    }
    drawRow(cells, y, rowH, false, ri % 2 === 1);
    y += rowH;
  });
  doc.y = y + 8;
}

/**
 * @param {object} ctx
 * @param {string} text
 * @param {{ minHeight?: number, fontSize?: number }} [opts]
 */
function drawTextBox(ctx, text, opts = {}) {
  const { doc } = ctx;
  const fontSize = opts.fontSize || 9;
  const minHeight = opts.minHeight || 56;
  const content = emptyDash(text);
  applyFont(ctx, fontSize, TEXT);
  const textH = doc.heightOfString(content, { width: ctx.contentW - 16, align: 'left' });
  const boxH = Math.max(minHeight, textH + 16);
  ensurePageSpace(ctx, boxH + 6);

  const startY = doc.y;
  doc.save();
  doc.strokeColor(BORDER).lineWidth(0.8).rect(MARGIN, startY, ctx.contentW, boxH).stroke();
  doc.text(content, MARGIN + 8, startY + 8, { width: ctx.contentW - 16, align: 'left' });
  doc.restore();
  doc.y = startY + boxH + 8;
}

function addSignatureArea(ctx) {
  const { doc } = ctx;
  ensurePageSpace(ctx, 72);
  doc.moveDown(0.5);
  applyFont(ctx, 10, TEXT);
  const y = doc.y;
  doc.text('教师签名：________________    日期：________________', MARGIN, y, {
    width: ctx.contentW,
    align: 'left',
  });
  doc.moveDown(1.2);
  doc.text('企业导师签名：________________    日期：________________', MARGIN, doc.y, {
    width: ctx.contentW,
    align: 'left',
  });
  doc.moveDown(0.5);
}

module.exports = {
  PT_A4_W,
  PT_A4_H,
  MARGIN,
  registerChineseFont,
  createLayoutContext,
  drawHeader,
  drawFooter: drawFootersOnAllPages,
  drawFootersOnAllPages,
  drawSectionTitle,
  drawKeyValueTable,
  drawScoreSummary,
  drawSimpleTable,
  drawTextBox,
  ensurePageSpace,
  addSignatureArea,
  drawCompactHeader,
};
