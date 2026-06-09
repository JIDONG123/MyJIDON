const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

const HEADER_FILL = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFE8F0FE' },
};
const HEADER_FILL_DARK = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF0B3D6D' },
};
const HEADER_FONT = { bold: true, color: { argb: 'FF0B3D6D' }, size: 11 };
const HEADER_FONT_WHITE = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
const TITLE_FONT = { bold: true, size: 14, color: { argb: 'FF0B3D6D' } };
const META_LABEL_FONT = { bold: true, size: 10, color: { argb: 'FF475569' } };
const META_VALUE_FONT = { size: 10, color: { argb: 'FF334155' } };
const BORDER_THIN = {
  top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
};

function createWorkbook() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '龙芯智训';
  workbook.created = new Date();
  return workbook;
}

/**
 * @param {import('exceljs').Worksheet} sheet
 * @param {number} startRow 1-based
 * @param {string[]} lines
 */
function addTitleRows(sheet, startRow, lines) {
  let row = startRow;
  for (const line of lines) {
    const r = sheet.getRow(row);
    r.getCell(1).value = line;
    r.getCell(1).font = row === startRow ? TITLE_FONT : { size: 10, color: { argb: 'FF64748B' } };
    row += 1;
  }
  return row;
}

/**
 * @param {import('exceljs').Worksheet} sheet
 * @param {number} rowIndex 1-based
 * @param {string[]} headers
 * @param {number} [colStart=1]
 */
function addStyledHeader(sheet, rowIndex, headers, colStart = 1, style = 'light') {
  const row = sheet.getRow(rowIndex);
  const fill = style === 'dark' ? HEADER_FILL_DARK : HEADER_FILL;
  const font = style === 'dark' ? HEADER_FONT_WHITE : HEADER_FONT;
  headers.forEach((h, i) => {
    const cell = row.getCell(colStart + i);
    cell.value = h;
    cell.font = font;
    cell.fill = fill;
    cell.border = BORDER_THIN;
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  row.height = 22;
}

/**
 * 合并居中标题行
 * @param {import('exceljs').Worksheet} sheet
 * @param {number} rowIndex 1-based
 * @param {string} text
 * @param {number} colCount
 */
function addMergedTitleRow(sheet, rowIndex, text, colCount, options = {}) {
  if (colCount > 1) {
    sheet.mergeCells(rowIndex, 1, rowIndex, colCount);
  }
  const cell = sheet.getRow(rowIndex).getCell(1);
  cell.value = text;
  cell.font = options.font || TITLE_FONT;
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  sheet.getRow(rowIndex).height = options.height || 30;
}

/**
 * 元信息行：标签占前两列合并，值占剩余列合并
 * @param {{ label: string, value: string }[]} pairs
 * @returns {number} 下一可用行号
 */
function addMetaRows(sheet, startRow, pairs, colCount) {
  let row = startRow;
  for (const pair of pairs) {
    if (colCount > 2) {
      sheet.mergeCells(row, 1, row, 2);
      sheet.mergeCells(row, 3, row, colCount);
    }
    const r = sheet.getRow(row);
    r.getCell(1).value = pair.label;
    r.getCell(1).font = META_LABEL_FONT;
    r.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
    r.getCell(3).value = pair.value;
    r.getCell(3).font = META_VALUE_FONT;
    r.getCell(3).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    r.height = 20;
    row += 1;
  }
  return row;
}

function setAutoFilter(sheet, fromRow, fromCol, toCol) {
  sheet.autoFilter = {
    from: { row: fromRow, column: fromCol },
    to: { row: fromRow, column: toCol },
  };
}

function freezeHeader(sheet, rowIndex, colIndex = 1) {
  sheet.views = [{ state: 'frozen', ySplit: rowIndex, xSplit: colIndex - 1, activeCell: 'A2' }];
}

/**
 * @param {import('exceljs').Worksheet} sheet
 * @param {Record<string, number>} widthMap column letter or 1-based index → width
 */
function setColumnWidths(sheet, widthMap) {
  for (const [key, width] of Object.entries(widthMap)) {
    if (/^[A-Z]+$/i.test(key)) {
      sheet.getColumn(key).width = width;
    } else {
      sheet.getColumn(Number(key)).width = width;
    }
  }
}

/** 按表头文字长度估算列宽 */
function setColumnWidthsByHeaders(sheet, headers, startCol = 1) {
  headers.forEach((h, i) => {
    const w = Math.min(42, Math.max(10, String(h).length * 2 + 4));
    sheet.getColumn(startCol + i).width = w;
  });
}

function cellDisplayLength(value) {
  if (value == null || value === '') return 0;
  if (value instanceof Date) return 19;
  const s = String(value);
  const lines = s.split('\n');
  return Math.max(...lines.map((line) => {
    let len = 0;
    for (const ch of line) {
      len += ch.charCodeAt(0) > 255 ? 2 : 1;
    }
    return len;
  }));
}

/**
 * 根据表头 + 数据行内容自动列宽
 * @param {import('exceljs').Worksheet} sheet
 * @param {number} startCol 1-based
 * @param {number} endCol 1-based
 * @param {number} headerRow 1-based
 * @param {number} dataStartRow 1-based
 * @param {number} dataEndRow 1-based
 */
function autoFitColumns(sheet, startCol, endCol, headerRow, dataStartRow, dataEndRow, options = {}) {
  const minW = options.minWidth ?? 8;
  const maxW = options.maxWidth ?? 48;
  for (let c = startCol; c <= endCol; c += 1) {
    let maxLen = cellDisplayLength(sheet.getRow(headerRow).getCell(c).value);
    for (let r = dataStartRow; r <= dataEndRow; r += 1) {
      maxLen = Math.max(maxLen, cellDisplayLength(sheet.getRow(r).getCell(c).value));
    }
    sheet.getColumn(c).width = Math.min(maxW, Math.max(minW, maxLen + 2));
  }
}

function applyScoreFormat(sheet, colIndex, fromRow, toRow) {
  for (let r = fromRow; r <= toRow; r += 1) {
    sheet.getRow(r).getCell(colIndex).numFmt = '0.00';
  }
}

function applyDateFormat(sheet, colIndex, fromRow, toRow) {
  for (let r = fromRow; r <= toRow; r += 1) {
    sheet.getRow(r).getCell(colIndex).numFmt = 'yyyy-mm-dd hh:mm:ss';
  }
}

function styleDataRow(sheet, rowIndex, colCount, alt = false) {
  const row = sheet.getRow(rowIndex);
  for (let c = 1; c <= colCount; c += 1) {
    const cell = row.getCell(c);
    cell.border = BORDER_THIN;
    cell.alignment = { vertical: 'top', wrapText: true };
    if (alt) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    }
  }
}

async function writeWorkbookBuffer(workbook) {
  return workbook.xlsx.writeBuffer();
}

async function writeWorkbookFile(workbook, filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  await workbook.xlsx.writeFile(filePath);
  return filePath;
}

module.exports = {
  createWorkbook,
  addTitleRows,
  addMergedTitleRow,
  addMetaRows,
  addStyledHeader,
  setAutoFilter,
  freezeHeader,
  setColumnWidths,
  setColumnWidthsByHeaders,
  autoFitColumns,
  applyScoreFormat,
  applyDateFormat,
  styleDataRow,
  writeWorkbookBuffer,
  writeWorkbookFile,
  HEADER_FILL,
  HEADER_FILL_DARK,
  HEADER_FONT,
  HEADER_FONT_WHITE,
  BORDER_THIN,
  TITLE_FONT,
};
