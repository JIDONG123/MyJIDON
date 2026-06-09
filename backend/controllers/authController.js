const { createCaptcha, verifyCaptcha } = require('../utils/captchaService');
const { requestPasswordReset, resetPasswordWithToken } = require('../utils/passwordResetService');
const pool = require('../config/database');
const cache = require('../utils/cacheService');
const { verifyPassword, validatePasswordPlaintext, hashPassword } = require('../utils/passwordPolicy');

const getCaptcha = async (req, res) => {
  try {
    const data = await createCaptcha();
    res.json({ success: true, ...data });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({
      success: false,
      message: error.message || '获取验证码失败',
    });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { username, email } = req.body;
    const result = await requestPasswordReset({ username, email });
    res.json(result);
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({
      success: false,
      message: error.message || '发送失败，请稍后重试',
    });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { token, newPassword, confirmPassword } = req.body;
    const result = await resetPasswordWithToken({ token, newPassword, confirmPassword });
    res.json(result);
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({
      success: false,
      message: error.message || '重置失败，请稍后重试',
    });
  }
};

function passwordsMatch(a, b) {
  return String(a ?? '') === String(b ?? '');
}

const changeInitialPassword = async (req, res) => {
  try {
    if (req.user?.role !== 'student' && req.user?.role !== 'teacher') {
      return res.status(403).json({ success: false, message: '仅学生或教师可修改初始密码' });
    }

    const uid = req.user.id;
    const { oldPassword, newPassword, confirmPassword } = req.body;

    if (oldPassword == null || String(oldPassword) === '') {
      return res.status(400).json({ success: false, message: '请输入当前密码' });
    }
    if (!newPassword || !confirmPassword) {
      return res.status(400).json({ success: false, message: '请填写新密码' });
    }
    if (!passwordsMatch(newPassword, confirmPassword)) {
      return res.status(400).json({ success: false, message: '两次输入的新密码不一致' });
    }
    if (passwordsMatch(newPassword, oldPassword)) {
      return res.status(400).json({ success: false, message: '新密码不能与当前密码相同' });
    }

    const pv = validatePasswordPlaintext(newPassword);
    if (!pv.ok) {
      return res.status(400).json({ success: false, message: pv.message, code: 'PASSWORD_POLICY' });
    }

    const [rows] = await pool.query(
      `SELECT id, password, IFNULL(must_change_password, 0) AS must_change_password FROM users WHERE id = ? LIMIT 1`,
      [uid]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }
    if (Number(rows[0].must_change_password) !== 1) {
      return res.status(400).json({ success: false, message: '当前账号无需修改初始密码' });
    }

    const okCurrent = await verifyPassword(oldPassword, rows[0].password);
    if (!okCurrent) {
      return res.status(400).json({ success: false, message: '当前密码不正确' });
    }

    const hp = await hashPassword(newPassword);
    if (!hp.ok) {
      return res.status(400).json({ success: false, message: hp.message });
    }

    await pool.query(
      `UPDATE users SET password = ?, password_plain = NULL, must_change_password = 0, password_changed_at = NOW() WHERE id = ?`,
      [hp.hash, uid]
    );

    try {
      await cache.invalidateUserMe(uid);
    } catch {
      /* ignore */
    }

    res.json({
      success: true,
      message: '密码修改成功',
      mustChangePassword: false,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '修改失败', error: error.message });
  }
};

module.exports = {
  getCaptcha,
  verifyCaptcha,
  forgotPassword,
  resetPassword,
  changeInitialPassword,
};
