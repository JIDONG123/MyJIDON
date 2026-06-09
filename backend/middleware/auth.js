const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { validateUserSession, SESSION_EXPIRED_MESSAGE } = require('../services/userSessionService');

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: '未授权访问' });
  }

  try {
    const user = jwt.verify(token, process.env.JWT_SECRET);
    const sessionCheck = await validateUserSession(pool, user);
    if (!sessionCheck.ok) {
      return res.status(401).json({
        success: false,
        code: sessionCheck.code,
        message: sessionCheck.message,
      });
    }
    req.user = user;
    return next();
  } catch (err) {
    if (err?.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        code: 'SESSION_EXPIRED',
        message: SESSION_EXPIRED_MESSAGE,
      });
    }
    return res.status(403).json({ success: false, message: 'Token无效' });
  }
};

const requireRole = (roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: '权限不足' });
    }
    next();
  };
};

module.exports = { authenticateToken, requireRole };
