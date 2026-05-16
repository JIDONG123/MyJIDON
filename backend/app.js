const express = require('express');
const cors = require('cors');
const path = require('path');
const userRoutes = require('./routes/userRoutes');
const classRoutes = require('./routes/classRoutes');
const taskRoutes = require('./routes/taskRoutes');
const submissionRoutes = require('./routes/submissionRoutes');
const gradingRoutes = require('./routes/gradingRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const reportRoutes = require('./routes/reportRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const exportRoutes = require('./routes/exportRoutes');
const kbRoutes = require('./routes/kbRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const assistantRoutes = require('./routes/assistantRoutes');
const qbRoutes = require('./routes/qbRoutes');
const { createApiLimiter } = require('./utils/rateLimiter');

function createApp() {
  const app = express();
  const apiLimiter = createApiLimiter();

  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

  app.use('/api', apiLimiter);

  app.use('/api/users', userRoutes);
  app.use('/api/classes', classRoutes);
  app.use('/api/tasks', taskRoutes);
  app.use('/api/submissions', submissionRoutes);
  app.use('/api/grading', gradingRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/export', exportRoutes);
  app.use('/api/kb', kbRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/assistant', assistantRoutes);
  app.use('/api/qb', qbRoutes);

  app.get('/', (req, res) => {
    res.json({ success: true, message: '基于大模型的实训智能批改系统 API（LoongArch / 麒麟 OS 可部署）' });
  });

  app.use((err, req, res, next) => {
    if (res.headersSent) {
      return next(err);
    }
    const msg = err && err.message ? String(err.message) : '服务器错误';
    const badRequest = err.name === 'MulterError' || /不支持的文件类型/.test(msg);
    const status = badRequest ? 400 : 500;
    res.status(status).json({ success: false, message: msg });
  });

  return app;
}

module.exports = { createApp };
