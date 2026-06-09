const fs = require('fs');

const SIGNATURES = [
  { ext: '.pdf', magic: [0x25, 0x50, 0x44, 0x46] },
  { ext: '.png', magic: [0x89, 0x50, 0x4e, 0x47] },
  { ext: '.jpg', magic: [0xff, 0xd8, 0xff] },
  { ext: '.jpeg', magic: [0xff, 0xd8, 0xff] },
  { ext: '.gif', magic: [0x47, 0x49, 0x46] },
  { ext: '.webp', magic: [0x52, 0x49, 0x46, 0x46] },
  { ext: '.zip', magic: [0x50, 0x4b, 0x03, 0x04] },
  { ext: '.docx', magic: [0x50, 0x4b, 0x03, 0x04] },
  { ext: '.xlsx', magic: [0x50, 0x4b, 0x03, 0x04] },
  { ext: '.doc', magic: [0xd0, 0xcf, 0x11, 0xe0] },
  { ext: '.xls', magic: [0xd0, 0xcf, 0x11, 0xe0] },
];

function readHead(filePathOrBuffer, len = 16) {
  if (Buffer.isBuffer(filePathOrBuffer)) {
    return filePathOrBuffer.subarray(0, Math.min(len, filePathOrBuffer.length));
  }
  if (typeof filePathOrBuffer === 'string' && fs.existsSync(filePathOrBuffer)) {
    const fd = fs.openSync(filePathOrBuffer, 'r');
    try {
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, 0);
      return buf;
    } finally {
      fs.closeSync(fd);
    }
  }
  return Buffer.alloc(0);
}

function matchMagic(head) {
  for (const sig of SIGNATURES) {
    let ok = true;
    for (let i = 0; i < sig.magic.length; i += 1) {
      if (head[i] !== sig.magic[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return sig.ext;
  }
  return null;
}

function extname(name) {
  const n = String(name || '').toLowerCase();
  const i = n.lastIndexOf('.');
  return i >= 0 ? n.slice(i) : '';
}

function verifyExtensionMatchesMagic(fileName, head) {
  const ext = extname(fileName);
  const detected = matchMagic(head);
  if (!detected) return { ok: true, detected: null };
  const alias = { '.jpeg': '.jpg' };
  const normExt = alias[ext] || ext;
  const normDetected = alias[detected] || detected;
  if (['.docx', '.xlsx', '.zip'].includes(normExt) && normDetected === '.zip') {
    return { ok: true, detected };
  }
  if (normExt && normDetected && normExt !== normDetected) {
    return { ok: false, detected, reason: '文件内容与扩展名不匹配' };
  }
  return { ok: true, detected };
}

module.exports = {
  readHead,
  matchMagic,
  extname,
  verifyExtensionMatchesMagic,
};
