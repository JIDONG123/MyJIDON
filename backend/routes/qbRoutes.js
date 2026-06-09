const express = require('express');
const multer = require('multer');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { createQbExamSubmitLimiter, createQbExamAutosaveLimiter, createQbCodeRunLimiter } = require('../utils/rateLimiter');
const qbQ = require('../controllers/qbQuestionController');
const qbP = require('../controllers/qbPracticeController');
const qbE = require('../controllers/qbExamController');

const mem = multer.memoryStorage();
const uploadXlsx = multer({
  storage: mem,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/\.xlsx$/i.test(file.originalname)) {
      return cb(new Error('仅支持 .xlsx 文件'));
    }
    cb(null, true);
  },
});

const examSubmitLimit = createQbExamSubmitLimiter();
const examAutosaveLimit = createQbExamAutosaveLimiter();
const qbCodeRunLimit = createQbCodeRunLimiter();

const router = express.Router();

router.get('/admin/questions', authenticateToken, requireRole(['admin']), qbQ.listAdminQuestions);
router.get('/admin/questions/:id', authenticateToken, requireRole(['admin']), qbQ.getAdminQuestion);
router.get('/admin/questions/:id/usage', authenticateToken, requireRole(['admin']), qbQ.getAdminQuestionUsage);

router.get('/questions/template', authenticateToken, requireRole(['teacher']), qbQ.downloadTemplate);
router.post('/questions/import', authenticateToken, requireRole(['teacher']), (req, res, next) => {
  uploadXlsx.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message || '上传失败' });
    next();
  });
}, qbQ.importQuestions);

router.get('/questions', authenticateToken, requireRole(['teacher']), qbQ.listQuestions);
router.post('/questions', authenticateToken, requireRole(['teacher']), qbQ.createQuestion);
router.get('/questions/:id', authenticateToken, requireRole(['teacher']), qbQ.getQuestion);
router.put('/questions/:id', authenticateToken, requireRole(['teacher']), qbQ.updateQuestion);
router.delete('/questions/:id', authenticateToken, requireRole(['teacher']), qbQ.deleteQuestion);
router.get('/questions/:id/usage', authenticateToken, requireRole(['teacher']), qbQ.questionUsage);

router.get('/practices', authenticateToken, requireRole(['teacher']), qbP.listTeacherPractices);
router.post('/practices', authenticateToken, requireRole(['teacher']), qbP.createPractice);
router.get('/practices/:id', authenticateToken, requireRole(['teacher']), qbP.getPracticeTeacher);
router.put('/practices/:id', authenticateToken, requireRole(['teacher']), qbP.updatePractice);
router.delete('/practices/:id', authenticateToken, requireRole(['teacher']), qbP.deletePractice);
router.put('/practices/:id/questions', authenticateToken, requireRole(['teacher']), qbP.setPracticeQuestions);
router.get('/practices/:id/attempts', authenticateToken, requireRole(['teacher']), qbP.listPracticeAttempts);
router.patch('/practices/:id/attempts/:attemptId/grade', authenticateToken, requireRole(['teacher']), qbP.gradePracticeAttempt);
router.post(
  '/practices/:id/attempts/:attemptId/adopt-ai',
  authenticateToken,
  requireRole(['teacher']),
  qbP.adoptPracticeAiScores
);

router.get('/student/practices', authenticateToken, requireRole(['student']), qbP.listStudentPractices);
router.get('/student/practices/:id/paper', authenticateToken, requireRole(['student']), qbP.getStudentPracticePaper);
router.put('/student/practices/:id/draft', authenticateToken, requireRole(['student']), qbP.savePracticeDraft);
router.post('/student/practices/:id/submit', authenticateToken, requireRole(['student']), qbP.submitPractice);
router.post('/student/practices/:id/run-code', authenticateToken, requireRole(['student']), qbCodeRunLimit, qbP.studentRunPracticeCode);

router.get('/exams', authenticateToken, requireRole(['teacher']), qbE.listTeacherExams);
router.post('/exams', authenticateToken, requireRole(['teacher']), qbE.createExam);
router.get('/exams/:id', authenticateToken, requireRole(['teacher']), qbE.getExamTeacher);
router.put('/exams/:id', authenticateToken, requireRole(['teacher']), qbE.updateExam);
router.delete('/exams/:id', authenticateToken, requireRole(['teacher']), qbE.deleteExam);
router.put('/exams/:id/questions', authenticateToken, requireRole(['teacher']), qbE.setExamQuestions);
router.post('/exams/:id/random-pick/preview', authenticateToken, requireRole(['teacher']), qbE.previewRandomExamQuestions);
router.post('/exams/:id/random-pick', authenticateToken, requireRole(['teacher']), qbE.randomPickExamQuestions);
router.get('/exams/:id/attempts', authenticateToken, requireRole(['teacher']), qbE.listExamAttempts);
router.patch('/exams/:id/attempts/:attemptId/grade', authenticateToken, requireRole(['teacher']), qbE.gradeExamAttempt);
router.post(
  '/exams/:id/attempts/:attemptId/adopt-ai',
  authenticateToken,
  requireRole(['teacher']),
  qbE.adoptExamAiScores
);
router.get('/exams/:id/export-scores', authenticateToken, requireRole(['teacher']), qbE.exportExamScores);

router.get('/student/exams', authenticateToken, requireRole(['student']), qbE.listStudentExams);
router.get('/student/exams/:id/meta', authenticateToken, requireRole(['student']), qbE.studentExamMeta);
router.post('/student/exams/:id/start', authenticateToken, requireRole(['student']), qbE.startExam);
router.patch('/student/exams/:id/autosave', authenticateToken, requireRole(['student']), examAutosaveLimit, qbE.autosaveExam);
router.post('/student/exams/:id/run-code', authenticateToken, requireRole(['student']), qbCodeRunLimit, qbE.studentRunExamCode);
router.post('/student/exams/:id/tab', authenticateToken, requireRole(['student']), qbE.tabEventExam);
router.post('/student/exams/:id/submit', authenticateToken, requireRole(['student']), examSubmitLimit, qbE.submitExam);
router.get('/student/exams/:id/result', authenticateToken, requireRole(['student']), qbE.studentExamResult);

module.exports = router;
