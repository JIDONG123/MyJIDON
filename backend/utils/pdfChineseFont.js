const fs = require('fs');
const path = require('path');

function windowsFontsDir() {
  return path.join(process.env.WINDIR || process.env.SystemRoot || 'C:\\Windows', 'Fonts');
}

/**
 * 解析可用于 PDFKit 的中文字体路径（TTF/OTF 优先；部分环境仅有 TTC）。
 * 可通过环境变量 PDF_CJK_FONT 指定绝对路径覆盖。
 */
function pickCjkFont() {
  const extra = process.env.PDF_CJK_FONT ? [process.env.PDF_CJK_FONT] : [];
  const bundledDir = path.join(__dirname, '../fonts');
  const candidates = [
    ...extra,
    path.join(bundledDir, 'NotoSansSC-Regular.otf'),
    path.join(bundledDir, 'SourceHanSansCN-Regular.otf'),
    path.join(windowsFontsDir(), 'simhei.ttf'),
    path.join(windowsFontsDir(), 'simkai.ttf'),
    path.join(windowsFontsDir(), 'STXIHEI.TTF'),
    path.join(windowsFontsDir(), 'msyhbd.ttf'),
    path.join(windowsFontsDir(), 'msyh.ttf'),
    '/usr/share/fonts/opentype/noto/NotoSansCJKsc-Regular.otf',
    '/usr/share/fonts/truetype/noto/NotoSansCJKsc-Regular.otf',
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.otf',
    '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.otf',
    '/usr/share/fonts/truetype/arphic/uming.ttc',
    '/usr/share/fonts/truetype/wqy/wqy-microhei.ttc',
    '/Library/Fonts/Arial Unicode.ttf',
    '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
    path.join(windowsFontsDir(), 'simsun.ttc'),
    path.join(windowsFontsDir(), 'msyh.ttc'),
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
    '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
  ];

  const preferTtfOtf = [];
  const ttcLast = [];
  for (const p of candidates) {
    if (!p) continue;
    const lower = p.toLowerCase();
    if (lower.endsWith('.ttc')) ttcLast.push(p);
    else preferTtfOtf.push(p);
  }

  for (const p of [...preferTtfOtf, ...ttcLast]) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* ignore */
    }
  }
  return null;
}

module.exports = { pickCjkFont };
