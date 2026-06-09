const nodemailer = require('nodemailer');

let transporter = null;
let transporterKey = '';

function smtpConfig() {
  const host = (process.env.SMTP_HOST || '').trim();
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure =
    process.env.SMTP_SECURE === '1' ||
    process.env.SMTP_SECURE === 'true' ||
    port === 465;
  const user = (process.env.SMTP_USER || '').trim();
  const pass = process.env.SMTP_PASS != null ? String(process.env.SMTP_PASS) : '';
  const from = (process.env.SMTP_FROM || user || '').trim();
  return { host, port, secure, user, pass, from };
}

function isSmtpConfigured() {
  const cfg = smtpConfig();
  return Boolean(cfg.host && cfg.user && cfg.pass && cfg.from);
}

function getTransporter() {
  const cfg = smtpConfig();
  if (!cfg.host || !cfg.user || !cfg.pass) {
    const err = new Error('邮件服务未配置，请在 .env 中设置 SMTP_HOST / SMTP_USER / SMTP_PASS');
    err.status = 503;
    throw err;
  }
  const key = `${cfg.host}:${cfg.port}:${cfg.user}:${cfg.secure}`;
  if (transporter && transporterKey === key) {
    return { transporter, from: cfg.from };
  }
  transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
  });
  transporterKey = key;
  return { transporter, from: cfg.from };
}

function buildResetEmailHtml({ realName, username, resetUrl, expireMinutes }) {
  const name = realName || username;
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>重置密码</title></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,.08);">
        <tr><td style="background:linear-gradient(135deg,#1677ff,#0958d9);padding:28px 32px;color:#fff;">
          <h1 style="margin:0;font-size:20px;font-weight:600;">龙芯智训 · 密码重置</h1>
        </td></tr>
        <tr><td style="padding:32px;color:#1d2129;line-height:1.7;font-size:15px;">
          <p style="margin:0 0 16px;">您好，<strong>${name}</strong>：</p>
          <p style="margin:0 0 20px;">我们收到了您的密码重置请求。请点击下方按钮设置新密码（链接 <strong>${expireMinutes} 分钟</strong> 内有效，仅可使用一次）：</p>
          <p style="margin:0 0 24px;text-align:center;">
            <a href="${resetUrl}" style="display:inline-block;padding:12px 32px;background:#1677ff;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">重置登录密码</a>
          </p>
          <p style="margin:0 0 8px;font-size:13px;color:#86909c;">若按钮无法点击，请复制以下链接到浏览器：</p>
          <p style="margin:0 0 20px;font-size:13px;color:#1677ff;word-break:break-all;">${resetUrl}</p>
          <p style="margin:0;font-size:13px;color:#86909c;">如非本人操作，请忽略此邮件，您的密码不会被更改。</p>
        </td></tr>
        <tr><td style="padding:16px 32px;background:#f7f8fa;font-size:12px;color:#86909c;text-align:center;">
          本邮件由系统自动发送，请勿直接回复。
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendPasswordResetEmail({ to, realName, username, resetUrl, expireMinutes = 15 }) {
  const { transporter: tx, from } = getTransporter();
  const subject = '【龙芯智训】重置您的登录密码';
  const html = buildResetEmailHtml({ realName, username, resetUrl, expireMinutes });
  await tx.sendMail({
    from,
    to,
    subject,
    html,
    text: `您好 ${realName || username}，请访问以下链接重置密码（${expireMinutes} 分钟内有效）：\n${resetUrl}`,
  });
}

module.exports = {
  isSmtpConfigured,
  sendPasswordResetEmail,
};
