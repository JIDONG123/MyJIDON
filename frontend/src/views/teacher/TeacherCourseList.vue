<template>
  <div class="tw-page">
    <header class="tw-head">
      <div>
        <h1 class="tw-title">我的课程</h1>
        <p class="tw-subtitle">查看您负责或任课的课程，管理课程项目模板与教学班。</p>
      </div>
      <div class="tw-head__actions">
        <el-button type="primary" plain @click="router.push('/teacher/project-templates')">
          实训项目模板
        </el-button>
      </div>
    </header>

    <el-skeleton v-if="loading" animated :rows="8" />

    <template v-else>
      <section class="tw-metric-grid">
        <div v-for="card in summaryCards" :key="card.key" class="tw-metric-card">
          <div class="tw-metric-card__icon" :class="`tw-metric-card__icon--${card.tone}`">
            <el-icon><component :is="card.icon" /></el-icon>
          </div>
          <div class="tw-metric-card__body">
            <span class="tw-metric-card__value">{{ card.value }}</span>
            <span class="tw-metric-card__label">{{ card.label }}</span>
          </div>
        </div>
      </section>

      <section class="tw-panel">
        <div class="tw-panel__header">
          <h2 class="tw-panel__title">课程列表</h2>
          <span class="tw-panel__meta">共 {{ enrichedCourses.length }} 门课程</span>
        </div>
        <div class="tw-panel__body">
          <el-empty
            v-if="!enrichedCourses.length"
            description="暂无课程，请联系管理员在「基础数据」中创建并指定您为负责人"
            :image-size="96"
          />
          <div v-else class="tw-entity-grid">
            <article v-for="course in enrichedCourses" :key="course.id" class="tw-entity-card">
              <div class="tw-entity-card__top">
                <div>
                  <h3 class="tw-entity-card__title">{{ course.course_name }}</h3>
                  <p class="tw-entity-card__code">{{ course.course_code || '—' }}</p>
                </div>
                <el-tag size="small" type="info" effect="plain">{{ course.course_type || '—' }}</el-tag>
              </div>

              <div class="tw-entity-card__meta">
                <el-tag size="small" effect="plain">{{ course.major_name || '未指定专业' }}</el-tag>
                <el-tag size="small" type="info" effect="plain">负责人：{{ course.leader_name || '—' }}</el-tag>
                <el-tag
                  v-for="label in courseRoleLabels(course.my_roles)"
                  :key="label"
                  size="small"
                  :type="roleTagType(course.my_roles, label)"
                  class="tw-role-tag"
                >
                  {{ label }}
                </el-tag>
              </div>

              <div class="tw-entity-card__stats">
                <span><strong>{{ course.teachingClassCount }}</strong> 教学班</span>
                <span><strong>{{ course.templateCount }}</strong> 项目模板</span>
              </div>

              <p class="tw-entity-card__note">课程级资源入口：在此管理教学班与可复用实训项目模板。</p>

              <div class="tw-entity-card__actions">
                <el-button type="primary" @click="goCourseWorkbench(course.id)">进入课程工作台</el-button>
                <el-button plain @click="goTeachingClasses(course.id)">教学班</el-button>
                <el-button plain @click="goTemplates(course.id)">项目模板</el-button>
              </div>
            </article>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Reading, User, School, Document } from '@element-plus/icons-vue'
import { listMyCourses } from '../../api/course'
import { listMyTeachingClasses } from '../../api/teachingClass'
import { listProjectTemplates } from '../../api/projectTemplate'
import { COURSE_ROLE_LABELS, COURSE_ROLE_TAG_TYPE, courseRoleLabels } from '../../utils/courseRoleDisplay'

const roleTagType = (myRoles, label) => {
  const code = (myRoles || []).find((c) => COURSE_ROLE_LABELS[c] === label)
  return COURSE_ROLE_TAG_TYPE[code] || 'info'
}

const router = useRouter()
const loading = ref(true)
const courses = ref([])
const teachingClasses = ref([])
const templates = ref([])

const tcCountByCourse = computed(() => {
  const map = new Map()
  for (const tc of teachingClasses.value) {
    const cid = Number(tc.course_id)
    map.set(cid, (map.get(cid) || 0) + 1)
  }
  return map
})

const tplCountByCourse = computed(() => {
  const map = new Map()
  for (const tpl of templates.value) {
    const cid = Number(tpl.course_id)
    map.set(cid, (map.get(cid) || 0) + 1)
  }
  return map
})

const enrichedCourses = computed(() =>
  courses.value.map((c) => ({
    ...c,
    teachingClassCount: tcCountByCourse.value.get(Number(c.id)) || 0,
    templateCount: tplCountByCourse.value.get(Number(c.id)) || 0,
  }))
)

const leadCourseCount = computed(() =>
  courses.value.filter((c) => (c.my_roles || []).includes('course_leader')).length
)

const participateCourseCount = computed(() =>
  courses.value.filter((c) =>
    (c.my_roles || []).some((r) => r === 'lead_teacher' || r === 'assistant_teacher')
  ).length
)

const summaryCards = computed(() => [
  { key: 'lead', label: '负责课程数', value: leadCourseCount.value, icon: Reading, tone: 'blue' },
  { key: 'part', label: '参与授课课程数', value: participateCourseCount.value, icon: School, tone: 'indigo' },
  { key: 'tc', label: '教学班数', value: teachingClasses.value.length, icon: User, tone: 'teal' },
  { key: 'tpl', label: '项目模板数', value: templates.value.length, icon: Document, tone: 'violet' },
])

const goCourseWorkbench = (courseId) =>
  router.push({ path: '/teacher/teaching-classes', query: { courseId: String(courseId) } })
const goTeachingClasses = (courseId) =>
  router.push({ path: '/teacher/teaching-classes', query: { courseId: String(courseId) } })
const goTemplates = (courseId) =>
  router.push({ path: '/teacher/project-templates', query: { courseId: String(courseId) } })

onMounted(async () => {
  try {
    const [cRes, tcRes, tplRes] = await Promise.all([
      listMyCourses(),
      listMyTeachingClasses(),
      listProjectTemplates(),
    ])
    if (cRes.success) courses.value = cRes.data || []
    if (tcRes.success) teachingClasses.value = tcRes.data || []
    if (tplRes.success) templates.value = tplRes.data || []
  } finally {
    loading.value = false
  }
})
</script>
