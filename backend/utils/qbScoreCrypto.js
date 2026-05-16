const crypto = require('crypto');

function getKey() {
  const raw = (process.env.QB_SCORE_ENC_KEY || '').trim() || `${process.env.JWT_SECRET || 'dev'}::qb-score-bundle-v1`;
  return crypto.createHash('sha256').update(raw).digest();
}

/**
 * AES-256-GCM，输出 base64(iv+tag+ciphertext)
 * @param {object} obj
 */
function encryptScoreBundle(obj) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const pt = Buffer.from(JSON.stringify(obj), 'utf8');
  const enc = Buffer.concat([cipher.update(pt), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decryptScoreBundle(b64) {
  if (!b64 || typeof b64 !== 'string') return null;
  try {
    const buf = Buffer.from(b64, 'base64');
    if (buf.length < 28) return null;
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const key = getKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const out = Buffer.concat([decipher.update(data), decipher.final()]);
    return JSON.parse(out.toString('utf8'));
  } catch (e) {
    console.warn('[qbScoreCrypto] decrypt failed:', e.message);
    return null;
  }
}

/**
 * @param {Date|string|null} publishAt
 */
function shouldSealScores(publishAt) {
  if (!publishAt) return false;
  const t = new Date(publishAt).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() < t;
}

module.exports = {
  encryptScoreBundle,
  decryptScoreBundle,
  shouldSealScores,
};
