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
    path: '/admin',
    name: 'AdminLayout',
    component: () => import('../layouts/AdminLayout.vue'),
    meta: { role: 'admin' },
    children: [
      { path: 'dashboard', name: 'AdminDashboard', component: () => import('../views/admin/Dashboard.vue') },
      { path: 'classes', name: 'ClassManagement', component: () => import('../views/admin/ClassManagement.vue') },
      { path: 'users', redirect: '/admin/users/students' },
      {
        path: 'users/students',
        name: 'AdminStudentUsers',
        component: () => import('../views/admin/StudentUserManagement.vue'),
      },
      {
        path: 'users/teachers',
        name: 'AdminTeacherUsers',
        component: () => import('../views/admin/TeacherUserManagement.vue'),
      },
      {
        path: 'users/enterprise',
        name: 'AdminEnterpriseUsers',
        component: () => import('../views/admin/EnterpriseAccounts.vue'),
      },
      { path: 'tasks', name: 'TaskManagement', component: () => import('../views/admin/TaskManagement.vue') },
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
        path: 'statistics',
        name: 'AdminStatistics',
        component: () => import('../views/teacher/Statistics.vue'),
      },
      { path: 'settings', name: 'AdminSettings', component: () => import('../views/admin/SystemSettings.vue') },
      {
        path: 'qbank/questions',
        name: 'AdminQbQuestions',
        component: () => import('../views/admin/QbAdminQuestions.vue'),
      },
    ]
  },
  {
    path: '/teacher',
    name: 'TeacherLayout',
    component: () => import('../layouts/TeacherLayout.vue'),
    meta: { role: 'teacher' },
    children: [
      { path: 'dashboard', name: 'TeacherDashboard', component: () => import('../views/teacher/Dashboard.vue') },
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
      { path: 'tasks', name: 'TeacherTasks', component: () => import('../views/teacher/TaskList.vue') },
      { path: 'tasks/create', name: 'CreateTask', component: () => import('../views/teacher/TaskForm.vue') },
      { path: 'tasks/:id/edit', name: 'EditTask', component: () => import('../views/teacher/TaskForm.vue') },
      { path: 'submissions/:taskId', name: 'TeacherSubmissions', component: () => import('../views/teacher/Submissions.vue') },
      {
        path: 'submissions/:taskId/similarity/:submissionId',
        name: 'TeacherSimilarityCompare',
        component: () => import('../views/teacher/SimilarityCompare.vue'),
      },
      { path: 'grading/:submissionId', name: 'TeacherGrading', component: () => import('../views/teacher/Grading.vue') },
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
        path: 'qbank/questions',
        name: 'TeacherQbQuestions',
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
    path: '/student',
    name: 'StudentLayout',
    component: () => import('../layouts/StudentLayout.vue'),
    meta: { role: 'student' },
    children: [
      { path: '', name: 'StudentIndex', redirect: 'tasks' },
      { path: 'tasks', name: 'StudentTasks', component: () => import('../views/student/TaskList.vue') },
      { path: 'tasks/:id', name: 'TaskDetail', component: () => import('../views/student/TaskDetail.vue') },
      {
        path: 'learning',
        name: 'StudentLearning',
        component: () => import('../views/student/StudentLearning.vue'),
      },
      {
        path: 'assistant',
        name: 'StudentAssistant',
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
        component: () => import('../views/student/StudentArchive.vue'),
      },
      { path: 'submissions', name: 'StudentSubmissions', component: () => import('../views/student/Submissions.vue') },
      { path: 'results', name: 'StudentResults', component: () => import('../views/student/Results.vue') },
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
  
  if (to.path === '/login' || to.path === '/register') {
    if (userStore.isLoggedIn) {
      next(getRedirectPath(userStore.user?.role))
    } else {
      next()
    }
  } else {
    if (!userStore.isLoggedIn) {
      next('/login')
    } else {
      const required = to.matched.find((r) => r.meta?.role)?.meta?.role
      if (required && required !== userStore.user?.role) {
        next(getRedirectPath(userStore.user?.role))
      } else {
        next()
      }
    }
  }
})

function getRedirectPath(role) {
  switch (role) {
    case 'admin': return '/admin/dashboard'
    case 'teacher': return '/teacher/dashboard'
    case 'student': return '/student/tasks'
    case 'enterprise': return '/enterprise/home'
    default: return '/login'
  }
}

export default router