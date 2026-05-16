import request from './index'

export const downloadQuestionTemplate = () =>
  request.get('/qb/questions/template', { responseType: 'blob' })

export const importQuestions = (file) => {
  const fd = new FormData()
  fd.append('file', file)
  return request.post('/qb/questions/import', fd)
}

export const listAdminQuestions = (params) => request.get('/qb/admin/questions', { params })

export const listQuestions = (params) => request.get('/qb/questions', { params })
export const getQuestion = (id) => request.get(`/qb/questions/${id}`)
export const createQuestion = (data) => request.post('/qb/questions', data)
export const updateQuestion = (id, data) => request.put(`/qb/questions/${id}`, data)
export const deleteQuestion = (id) => request.delete(`/qb/questions/${id}`)
export const getQuestionUsage = (id) => request.get(`/qb/questions/${id}/usage`)

export const listTeacherPractices = (params) => request.get('/qb/practices', { params })
export const createPractice = (data) => request.post('/qb/practices', data)
export const getPracticeTeacher = (id) => request.get(`/qb/practices/${id}`)
export const updatePractice = (id, data) => request.put(`/qb/practices/${id}`, data)
export const deletePractice = (id) => request.delete(`/qb/practices/${id}`)
export const setPracticeQuestions = (id, questionIds) =>
  request.put(`/qb/practices/${id}/questions`, { questionIds })
export const listPracticeAttempts = (id) => request.get(`/qb/practices/${id}/attempts`)
export const gradePracticeAttempt = (practiceId, attemptId, subjectiveScores) =>
  request.patch(`/qb/practices/${practiceId}/attempts/${attemptId}/grade`, { subjectiveScores })
export const adoptPracticeAiScores = (practiceId, attemptId, body) =>
  request.post(`/qb/practices/${practiceId}/attempts/${attemptId}/adopt-ai`, body || {})
export const runPracticeCode = (practiceId, body) => request.post(`/qb/student/practices/${practiceId}/run-code`, body)

export const listStudentPractices = () => request.get('/qb/student/practices')
export const getPracticePaper = (id) => request.get(`/qb/student/practices/${id}/paper`)
export const savePracticeDraft = (id, answers) => request.put(`/qb/student/practices/${id}/draft`, { answers })
export const submitPractice = (id, answers) => request.post(`/qb/student/practices/${id}/submit`, { answers })

export const listTeacherExams = (params) => request.get('/qb/exams', { params })
export const createExam = (data) => request.post('/qb/exams', data)
export const getExamTeacher = (id) => request.get(`/qb/exams/${id}`)
export const updateExam = (id, data) => request.put(`/qb/exams/${id}`, data)
export const deleteExam = (id) => request.delete(`/qb/exams/${id}`)
export const setExamQuestions = (id, items) => request.put(`/qb/exams/${id}/questions`, { items })
export const previewExamRandomPick = (id, body) => request.post(`/qb/exams/${id}/random-pick/preview`, body || {})
export const randomPickExamQuestions = (id, body) => request.post(`/qb/exams/${id}/random-pick`, body || {})
export const listExamAttempts = (id) => request.get(`/qb/exams/${id}/attempts`)
export const gradeExamAttempt = (examId, attemptId, subjectiveScores) =>
  request.patch(`/qb/exams/${examId}/attempts/${attemptId}/grade`, { subjectiveScores })
export const adoptExamAiScores = (examId, attemptId, body) =>
  request.post(`/qb/exams/${examId}/attempts/${attemptId}/adopt-ai`, body || {})
export const runExamCode = (examId, body) => request.post(`/qb/student/exams/${examId}/run-code`, body)

export const listStudentExams = (params = {}) => {
  const p = {}
  if (params.q) p.q = params.q
  return request.get('/qb/student/exams', { params: Object.keys(p).length ? p : undefined })
}
export const getExamMeta = (id) => request.get(`/qb/student/exams/${id}/meta`)
export const startExam = (id) => request.post(`/qb/student/exams/${id}/start`)
export const autosaveExam = (id, answers) => request.patch(`/qb/student/exams/${id}/autosave`, { answers })
export const tabExamEvent = (id) => request.post(`/qb/student/exams/${id}/tab`)
export const submitExam = (id, answers) => request.post(`/qb/student/exams/${id}/submit`, { answers })
export const getExamResult = (id) => request.get(`/qb/student/exams/${id}/result`)

export const exportExamScores = (id) =>
  request.get(`/qb/exams/${id}/export-scores`, { responseType: 'blob' })
