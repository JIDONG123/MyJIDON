import { createRouter, createWebHistory } from 'vue-router'
import { useUserStore } from '../stores/user'

const routes = [
  {
    path: '/',
    redirect: '/login'
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue')
  },
  {
    path: '/register',
    name: 'Register',
    component: () => import('../views/Register.vue')
  },
  {
    path: '/reset-password',
    name: 'ResetPassword',
    component: () => import('../views/ResetPassword.vue')
  },
  {
    path: '/admin',
    name: 'AdminLayout',
    component: () => import('../layouts/AdminLayout.vue'),
    meta: { role: 'admin' },
    children: [
      { path: 'dashboard', name: 'AdminDashboard', meta: { keepAlive: true }, component: () => import('../views/admin/Dashboard.vue') },
      { path: 'classes', name: 'ClassManagement', component: () => import('../views/admin/ClassManagement.vue') },
      { path: 'curriculum', name: 'AdminCurriculum', component: () => import('../views/admin/AdminCurriculum.vue') },
      {
        path: 'teaching-classes/:id',
        name: 'AdminTeachingClassDetail',
        component: () => import('../views/teacher/TeacherTeachingClassDetail.vue'),
      },
      { path: 'users', redirect: '/admin/users/students' },
      {
        path: 'users/students',
        name: 'AdminStudentUsers',
        meta: { keepAlive: true },
        component: () => import('../views/admin/StudentUserManagement.vue'),
      },
      {
        path: 'users/teachers',
        name: 'AdminTeacherUsers',
        meta: { keepAlive: true },
        component: () => import('../views/admin/TeacherUserManagement.vue'),
      },
      {
        path: 'users/enterprise',
        name: 'AdminEnterpriseUsers',
        component: () => import('../views/admin/EnterpriseAccounts.vue'),
      },
      { path: 'tasks', name: 'TaskManagement', meta: { keepAlive: true }, component: () => import('../views/admin/TaskManagement.vue') },
      { path: 'tasks/create', name: 'AdminCreateTask', component: () => import('../views/teacher/TaskForm.vue') },
      { path: 'tasks/:id/edit', name: 'AdminEditTask', component: () => import('../views/teacher/TaskForm.vue') },
      { path: 'submissions/:taskId', name: 'AdminSubmissions', component: () => import('../views/admin/Submissions.vue') },
      {
        path: 'submissions/:taskId/similarity/:submissionId',
        name: 'AdminSimilarityCompare',
        component: () => import('../views/teacher/SimilarityCompare.vue'),
      },
      { path: 'grading/:submissionId', name: 'AdminGrading', component: () => import('../views/admin/Grading.vue') },
      {
        path: 'grading-jobs',
        name: 'AdminGradingJobList',
        meta: { keepAlive: true },
        component: () => import('../views/teacher/GradingJobList.vue'),
        props: { basePath: '/admin' },
      },
      {
        path: 'grading-jobs/:id',
        name: 'AdminGradingJobDetail',
        component: () => import('../views/teacher/GradingJobDetail.vue'),
        props: { basePath: '/admin' },
      },
      {
        path: 'statistics',
        name: 'AdminStatistics',
        component: () => import('../views/teacher/Statistics.vue'),
      },
      {
        path: 'big-screen',
        name: 'AdminBigScreen',
        component: () => import('../views/admin/AdminBigScreen.vue'),
      },
      { path: 'settings', name: 'AdminSettings', component: () => import('../views/admin/SystemSettings.vue') },
      {
        path: 'knowledge-graph',
        name: 'AdminKnowledgeGraph',
        component: () => import('../views/admin/AdminKnowledgeGraph.vue'),
      },
      {
        path: 'content-safety',
        name: 'AdminContentSafety',
        component: () => import('../views/admin/ContentSafetyReview.vue'),
      },
      {
        path: 'qbank/questions',
        name: 'AdminQbQuestions',
        meta: { keepAlive: true },
        component: () => import('../views/admin/QbAdminQuestions.vue'),
      },
    ]
  },
  {
    path: '/teacher/change-initial-password',
    name: 'TeacherChangeInitialPassword',
    component: () => import('../views/student/ChangeInitialPassword.vue'),
    meta: { role: 'teacher', mustChangeRoute: true },
  },
  {
    path: '/teacher',
    name: 'TeacherLayout',
    component: () => import('../layouts/TeacherLayout.vue'),
    meta: { role: 'teacher' },
    children: [
      { path: 'dashboard', name: 'TeacherDashboard', component: () => import('../views/teacher/Dashboard.vue') },
      { path: 'courses', name: 'TeacherCourses', component: () => import('../views/teacher/TeacherCourseList.vue') },
      { path: 'teaching-classes', name: 'TeacherTeachingClasses', component: () => import('../views/teacher/TeacherTeachingClassList.vue') },
      {
        path: 'teaching-classes/:id',
        name: 'TeacherTeachingClassDetail',
        component: () => import('../views/teacher/TeacherTeachingClassDetail.vue'),
      },
      { path: 'project-templates', name: 'TeacherProjectTemplates', component: () => import('../views/teacher/ProjectTemplateList.vue') },
      { path: 'training-calendar', name: 'TeacherTrainingCalendar', component: () => import('../views/teacher/TrainingCalendar.vue') },
      {
        path: 'class-weak-analysis',
        name: 'TeacherClassWeakAnalysis',
        component: () => import('../views/teacher/TeacherClassWeakAnalysis.vue'),
      },
      { path: 'classes', name: 'TeacherClassList', component: () => import('../views/teacher/TeacherClassList.vue') },
      {
        path: 'classes/:id/students',
        name: 'TeacherClassStudents',
        component: () => import('../views/teacher/TeacherClassStudents.vue'),
      },
      {
        path: 'classes/:id',
        name: 'TeacherClassDetail',
        component: () => import('../views/teacher/TeacherClassDetail.vue'),
      },
      {
        path: 'class-announcements',
        name: 'TeacherClassAnnouncements',
        component: () => import('../views/teacher/TeacherClassAnnouncements.vue'),
      },
      { path: 'tasks', name: 'TeacherTasks', meta: { keepAlive: true }, component: () => import('../views/teacher/TaskList.vue') },
      { path: 'grading-queue', name: 'TeacherGradingQueue', component: () => import('../views/teacher/GradingQueue.vue') },
      { path: 'submission-feedbacks', name: 'TeacherSubmissionFeedbacks', component: () => import('../views/teacher/SubmissionFeedbacks.vue') },
      { path: 'grading-jobs', name: 'TeacherGradingJobList', meta: { keepAlive: true }, component: () => import('../views/teacher/GradingJobList.vue') },
      { path: 'tasks/create', name: 'CreateTask', component: () => import('../views/teacher/TaskForm.vue') },
      { path: 'tasks/:id/edit', name: 'EditTask', component: () => import('../views/teacher/TaskForm.vue') },
      {
        path: 'online-practice',
        name: 'TeacherOnlinePractice',
        component: () => import('../views/teacher/OnlinePracticeTemplates.vue'),
      },
      {
        path: 'online-practice/create',
        name: 'TeacherOnlinePracticeCreate',
        component: () => import('../views/teacher/OnlinePracticeTemplateForm.vue'),
      },
      {
        path: 'online-practice/:id/edit',
        name: 'TeacherOnlinePracticeEdit',
        component: () => import('../views/teacher/OnlinePracticeTemplateForm.vue'),
      },
      { path: 'submissions/:taskId', name: 'TeacherSubmissions', component: () => import('../views/teacher/Submissions.vue') },
      {
        path: 'submissions/:taskId/similarity/:submissionId',
        name: 'TeacherSimilarityCompare',
        component: () => import('../views/teacher/SimilarityCompare.vue'),
      },
      { path: 'grading/:submissionId', name: 'TeacherGrading', component: () => import('../views/teacher/Grading.vue') },
      {
        path: 'grading-jobs/:id',
        name: 'TeacherGradingJobDetail',
        component: () => import('../views/teacher/GradingJobDetail.vue'),
      },
      {
        path: 'assistant-stats',
        name: 'TeacherAssistantStats',
        component: () => import('../views/teacher/TeacherAssistantStats.vue'),
      },
      {
        path: 'big-screen',
        name: 'TeacherBigScreen',
        component: () => import('../views/teacher/TeacherBigScreen.vue'),
      },
      { path: 'statistics', name: 'TeacherStatistics', component: () => import('../views/teacher/Statistics.vue') },
      { path: 'export', name: 'TeacherExport', component: () => import('../views/teacher/TeacherExport.vue') },
      {
        path: 'knowledge-base',
        name: 'TeacherKnowledgeBase',
        component: () => import('../views/teacher/TeacherKnowledgeBase.vue'),
      },
      {
        path: 'knowledge-graph',
        name: 'TeacherKnowledgeGraph',
        component: () => import('../views/teacher/TeacherKnowledgeGraph.vue'),
      },
      {
        path: 'qbank/questions',
        name: 'TeacherQbQuestions',
        meta: { keepAlive: true },
        component: () => import('../views/teacher/QbQuestions.vue'),
      },
      {
        path: 'qbank/practices',
        name: 'TeacherQbPractices',
        component: () => import('../views/teacher/QbPractices.vue'),
      },
      {
        path: 'qbank/exams',
        name: 'TeacherQbExams',
        component: () => import('../views/teacher/QbExams.vue'),
      },
      {
        path: 'qbank/exams/:examId/monitor',
        name: 'TeacherExamMonitor',
        component: () => import('../views/teacher/TeacherExamMonitor.vue'),
      },
      { path: 'settings', name: 'TeacherSettings', component: () => import('../views/shared/MySettings.vue') },
    ]
  },
  {
    path: '/enterprise',
    component: () => import('../layouts/EnterpriseLayout.vue'),
    meta: { role: 'enterprise' },
    children: [
      { path: '', name: 'EnterpriseLayout', redirect: 'home' },
      { path: 'home', name: 'EnterpriseHome', component: () => import('../views/enterprise/EnterpriseHome.vue') },
      {
        path: 'submissions/:taskId',
        name: 'EnterpriseSubmissions',
        component: () => import('../views/enterprise/EnterpriseSubmissions.vue'),
      },
      {
        path: 'grading/:submissionId',
        name: 'EnterpriseGrading',
        component: () => import('../views/enterprise/EnterpriseGrading.vue'),
      },
    ],
  },
  {
    path: '/student/change-initial-password',
    name: 'ChangeInitialPassword',
    component: () => import('../views/student/ChangeInitialPassword.vue'),
    meta: { role: 'student', mustChangeRoute: true },
  },
  {
    path: '/student',
    name: 'StudentLayout',
    component: () => import('../layouts/StudentLayout.vue'),
    meta: { role: 'student' },
    children: [
      { path: '', name: 'StudentIndex', redirect: 'tasks' },
      { path: 'tasks', name: 'StudentTasks', meta: { keepAlive: true }, component: () => import('../views/student/TaskList.vue') },
      { path: 'tasks/:id', name: 'TaskDetail', component: () => import('../views/student/TaskDetail.vue') },
      {
        path: 'online-practice',
        name: 'StudentOnlinePractice',
        component: () => import('../views/student/OnlinePracticeList.vue'),
      },
      {
        path: 'online-practice/:templateId',
        name: 'StudentOnlinePracticeWorkbench',
        meta: { studentWorkspace: true },
        component: () => import('../views/student/OnlinePracticeWorkbench.vue'),
      },
      {
        path: 'training-calendar',
        name: 'StudentTrainingCalendar',
        component: () => import('../views/student/StudentTrainingCalendar.vue'),
      },
      {
        path: 'learning',
        name: 'StudentLearning',
        meta: { keepAlive: true },
        component: () => import('../views/student/StudentLearning.vue'),
      },
      {
        path: 'knowledge-graph',
        name: 'StudentKnowledgeGraph',
        component: () => import('../views/student/StudentKnowledgeGraph.vue'),
      },
      {
        path: 'assistant',
        name: 'StudentAssistant',
        meta: { studentWorkspace: true },
        component: () => import('../views/student/StudentAssistant.vue'),
      },
      {
        path: 'big-screen',
        name: 'StudentBigScreen',
        component: () => import('../views/student/StudentBigScreen.vue'),
      },
      {
        path: 'archive',
        name: 'StudentArchive',
        meta: { keepAlive: true },
        component: () => import('../views/student/StudentArchive.vue'),
      },
      { path: 'submissions', name: 'StudentSubmissions', meta: { keepAlive: true }, component: () => import('../views/student/Submissions.vue') },
      { path: 'results', name: 'StudentResults', meta: { keepAlive: true }, component: () => import('../views/student/Results.vue') },
      { path: 'results/:submissionId', name: 'ResultDetail', component: () => import('../views/student/ResultDetail.vue') },
      {
        path: 'qbank/practices',
        name: 'StudentQbPractices',
        component: () => import('../views/student/StudentQbPractices.vue'),
      },
      {
        path: 'qbank/practices/:id/take',
        name: 'StudentPracticeTake',
        meta: { studentWorkspace: true },
        component: () => import('../views/student/StudentPracticeTake.vue'),
      },
      {
        path: 'qbank/exams',
        name: 'StudentQbExams',
        component: () => import('../views/student/StudentQbExams.vue'),
      },
      {
        path: 'qbank/exams/:id/take',
        name: 'StudentExamTake',
        meta: { studentWorkspace: true, studentExamLock: true },
        component: () => import('../views/student/StudentExamTake.vue'),
      },
      { path: 'settings', name: 'StudentSettings', component: () => import('../views/shared/MySettings.vue') },
    ]
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, from, next) => {
  const userStore = useUserStore()

  if (to.path === '/login' || to.path === '/register' || to.path === '/reset-password') {
    if (userStore.isLoggedIn) {
      next(getRedirectPath(userStore.user))
    } else {
      next()
    }
    return
  }

  if (!userStore.isLoggedIn) {
    next('/login')
    return
  }

  const required = to.matched.find((r) => r.meta?.role)?.meta?.role
  if (required && required !== userStore.user?.role) {
    next(getRedirectPath(userStore.user))
    return
  }

  if (userStore.user?.mustChangePassword) {
    const role = userStore.user?.role
    const changePath =
      role === 'teacher'
        ? '/teacher/change-initial-password'
        : role === 'student'
          ? '/student/change-initial-password'
          : null
    if (changePath && to.path !== changePath) {
      next(changePath)
      return
    }
  } else if (
    to.path === '/student/change-initial-password' ||
    to.path === '/teacher/change-initial-password'
  ) {
    next(getRedirectPath(userStore.user))
    return
  }

  next()
})

function getRedirectPath(user) {
  if (!user) return '/login'
  if (user.mustChangePassword) {
    if (user.role === 'teacher') return '/teacher/change-initial-password'
    if (user.role === 'student') return '/student/change-initial-password'
  }
  switch (user.role) {
    case 'admin': return '/admin/dashboard'
    case 'teacher': return '/teacher/dashboard'
    case 'student': return '/student/tasks'
    case 'enterprise': return '/enterprise/home'
    default: return '/login'
  }
}

export default router