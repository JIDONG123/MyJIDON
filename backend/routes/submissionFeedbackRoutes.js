const express = require('express');
const { authenticateToken, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/submissionFeedbackController');

const studentRouter = express.Router();
studentRouter.use(authenticateToken, requireRole(['student']));
studentRouter.get('/meta', ctrl.getMeta);
studentRouter.post('/', ctrl.createFeedback);
studentRouter.get('/my', ctrl.listMyFeedbacks);
studentRouter.get('/my/task/:taskId', ctrl.listMyFeedbacks);

const teacherRouter = express.Router();
teacherRouter.use(authenticateToken, requireRole(['teacher', 'admin']));
teacherRouter.get('/meta', ctrl.getMeta);
teacherRouter.get('/', ctrl.listTeacherFeedbacks);
teacherRouter.get('/:id', ctrl.getFeedbackDetail);
teacherRouter.post('/:id/reply', ctrl.replyFeedback);
teacherRouter.post('/:id/return', ctrl.returnForResubmit);
teacherRouter.post('/:id/reject', ctrl.rejectFeedback);
teacherRouter.post('/:id/close', ctrl.closeFeedback);

module.exports = { studentRouter, teacherRouter };
