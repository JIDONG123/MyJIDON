const crypto = require('crypto');
const { safeGet, safeSet, safeDel } = require('./redisClient');

const PREFIX = (process.env.CACHE_KEY_PREFIX || 'sg:') + 'captcha:';
const TTL_SEC = parseInt(process.env.CAPTCHA_TTL_SEC || '300', 10);

function randomColor(min = 40, max = 180) {
  const v = () => Math.floor(min + Math.random() * (max - min));
  return `rgb(${v()},${v()},${v()})`;
}

function buildSvg(code) {
  const w = 120;
  const h = 44;
  let noise = '';
  for (let i = 0; i < 10; i += 1) {
    const x1 = Math.random() * w;
    const y1 = Math.random() * h;
    const x2 = Math.random() * w;
    const y2 = Math.random() * h;
    noise += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${randomColor(100, 180)}" stroke-width="1" opacity="0.45"/>`;
  }
  for (let i = 0; i < 48; i += 1) {
    noise += `<circle cx="${Math.random() * w}" cy="${Math.random() * h}" r="${0.6 + Math.random() * 1.2}" fill="${randomColor(80, 160)}" opacity="0.35"/>`;
  }

  const chars = code.split('');
  const charSvg = chars
    .map((ch, i) => {
      const x = 18 + i * 24 + (Math.random() * 6 - 3);
      const y = 28 + (Math.random() * 8 - 4);
      const rotate = Math.random() * 30 - 15;
      return `<text x="${x}" y="${y}" fill="${randomColor(20, 120)}" font-size="22" font-family="Arial,sans-serif" font-weight="700" transform="rotate(${rotate} ${x} ${y})">${ch}</text>`;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect width="100%" height="100%" fill="#f1f5f9"/>
    ${noise}
    ${charSvg}
  </svg>`;
}

async function createCaptcha() {
  const code = String(Math.floor(1000 + Math.random() * 9000));
  const captchaId = crypto.randomUUID();
  const key = PREFIX + captchaId;
  const ok = await safeSet(key, code, 'EX', TTL_SEC);
  if (!ok) {
    const err = new Error('验证码服务暂不可用，请确认 Redis 已启动');
    err.status = 503;
    throw err;
  }
  const svg = buildSvg(code);
  const imageBase64 = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  return { captchaId, imageBase64 };
}

async function verifyCaptcha(captchaId, captchaCode) {
  if (!captchaId || captchaCode == null || String(captchaCode).trim() === '') {
    return { ok: false, message: '请输入图形验证码' };
  }
  const key = PREFIX + String(captchaId).trim();
  const stored = await safeGet(key);
  await safeDel(key);
  if (!stored) {
    return { ok: false, message: '验证码已过期，请刷新后重试' };
  }
  if (String(captchaCode).trim() !== String(stored)) {
    return { ok: false, message: '图形验证码错误' };
  }
  return { ok: true };
}

module.exports = {
  createCaptcha,
  verifyCaptcha,
};
