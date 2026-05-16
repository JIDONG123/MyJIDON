<template>
  <div class="page-settings">
    <div class="settings-bg" aria-hidden="true">
      <div class="orb orb--a" />
      <div class="orb orb--b" />
      <div class="orb orb--c" />
    </div>

    <div class="settings-inner">
      <header class="page-head">
        <h1 class="page-title">我的设置</h1>
        <p class="page-desc">管理头像、联系方式与个人简介；头像与简介会在侧栏与顶栏同步展示。</p>
      </header>

      <el-row :gutter="20">
        <el-col :xs="24" :lg="10">
          <div class="avatar-panel card-elevated">
            <div class="avatar-ring" :class="{ uploading: uploading }">
              <div class="avatar-ring__pulse" />
              <UserAvatar
                class="avatar-ring__inner"
                :src="userStore.user?.avatarUrl"
                :name="userStore.user?.realName"
                :size="120"
              />
            </div>
            <p class="avatar-name">{{ userStore.user?.realName ?? '—' }}</p>
            <p class="avatar-role">{{ roleLabel }}</p>

            <el-upload
              class="upload-wrap"
              drag
              :show-file-list="false"
              accept="image/jpeg,image/png,image/gif,image/webp"
              :before-upload="beforeUpload"
            >
              <el-icon class="upload-icon"><UploadFilled /></el-icon>
              <div class="upload-text">拖拽图片到此处，或点击上传</div>
              <div class="upload-hint">JPG / PNG / GIF / WebP，最大 2MB</div>
            </el-upload>
            <p v-if="uploading" class="upload-status">
              <el-icon class="is-loading"><Loading /></el-icon> 正在上传…
            </p>
          </div>
        </el-col>

        <el-col :xs="24" :lg="14">
          <el-card class="info-card card-elevated" shadow="never">
            <template #header>
              <span class="card-head-title">基本信息</span>
            </template>
            <dl class="info-dl">
              <div class="info-row">
                <dt>用户名</dt>
                <dd>{{ userStore.user?.username ?? '—' }}</dd>
              </div>
              <div class="info-row">
                <dt>邮箱</dt>
                <dd>{{ userStore.user?.email || '未填写' }}</dd>
              </div>
              <template v-if="userStore.user?.role === 'teacher'">
                <div class="info-row">
                  <dt>学院 / 部门</dt>
                  <dd>{{ teacherDepartmentDisplay }}</dd>
                </div>
                <div class="info-row info-row--full">
                  <dt>负责班级</dt>
                  <dd>
                    <div v-if="managedList.length" class="tag-list">
                      <el-tag
                        v-for="c in managedList"
                        :key="c.id"
                        type="info"
                        effect="plain"
                        class="tag-animate"
                        :title="classTagTitle(c)"
                      >
                        {{ classTagLabel(c) }}
                      </el-tag>
                    </div>
                    <span v-else class="muted">暂无；请在管理端「班级管理」将班级的负责教师设为您</span>
                  </dd>
                </div>
              </template>
              <template v-else-if="userStore.user?.role === 'student'">
                <div class="info-row">
                  <dt>所在班级</dt>
                  <dd>
                    {{
                      userStore.user?.className ||
                      userStore.user?.class_name ||
                      (userStore.user?.classId ? `班级 ID ${userStore.user.classId}` : '') ||
                      '未分班'
                    }}
                    <template
                      v-if="userStore.user?.classMajor || userStore.user?.class_major"
                    >
                      · {{ userStore.user.classMajor || userStore.user.class_major }}
                      {{ userStore.user.classGrade || userStore.user.class_grade || '' }}
                    </template>
                  </dd>
                </div>
              </template>
            </dl>
          </el-card>

          <el-card
            v-if="userStore.user?.role === 'student' && classTeacher"
            class="info-card card-elevated teacher-card"
            shadow="never"
          >
            <template #header>
              <span class="card-head-title">我的负责教师</span>
            </template>
            <div class="teacher-row">
              <UserAvatar
                :src="classTeacher.avatarUrl"
                :name="classTeacher.realName"
                :size="56"
                class="teacher-av"
              />
              <div class="teacher-meta">
                <p class="teacher-name">{{ classTeacher.realName }}</p>
                <p class="teacher-sub">@{{ classTeacher.username }}</p>
                <p v-if="classTeacher.email" class="teacher-sub">{{ classTeacher.email }}</p>
                <p v-if="classTeacher.department" class="teacher-sub">{{ classTeacher.department }}</p>
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>

      <el-card v-if="showProfileEdit" class="info-card card-elevated profile-edit-card" shadow="never">
        <template #header>
          <span class="card-head-title">联系方式与简介</span>
        </template>
        <el-form label-width="100px" class="profile-form">
          <el-form-item v-if="userStore.user?.role === 'student'" label="学号">
            <el-input v-model="profileForm.studentNo" maxlength="32" show-word-limit placeholder="选填，用于导出报表等" />
          </el-form-item>
          <el-form-item label="手机">
            <el-input v-model="profileForm.phone" maxlength="20" placeholder="选填" />
          </el-form-item>
          <el-form-item label="其它联系">
            <el-input v-model="profileForm.contactExtra" maxlength="100" placeholder="如微信号等（选填）" />
          </el-form-item>
          <el-form-item label="个人简介">
            <el-input
              v-model="profileForm.profileBio"
              type="textarea"
              :rows="4"
              maxlength="2000"
              show-word-limit
              placeholder="选填；保存后将在顶栏姓名下方简要展示"
            />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="savingProfile" @click="saveProfile">保存资料</el-button>
          </el-form-item>
        </el-form>
      </el-card>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, reactive, watch, onMounted } from 'vue'
import { UploadFilled, Loading } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useUserStore } from '../../stores/user'
import { uploadMyAvatar, updateMyProfile } from '../../api/user'
import UserAvatar from '../../components/UserAvatar.vue'

const userStore = useUserStore()
const uploading = ref(false)
const savingProfile = ref(false)

const profileForm = reactive({
  studentNo: '',
  phone: '',
  contactExtra: '',
  profileBio: '',
})

const showProfileEdit = computed(() => ['teacher', 'student'].includes(userStore.user?.role))

watch(
  () => userStore.user,
  (u) => {
    if (!u) return
    profileForm.studentNo = u.studentNo ?? u.student_no ?? ''
    profileForm.phone = u.phone ?? ''
    profileForm.contactExtra = u.contactExtra ?? u.contact_extra ?? ''
    profileForm.profileBio = u.profileBio ?? u.profile_bio ?? ''
  },
  { immediate: true }
)

const saveProfile = async () => {
  savingProfile.value = true
  try {
    const payload = {
      phone: profileForm.phone || null,
      profileBio: profileForm.profileBio || null,
      contactExtra: profileForm.contactExtra || null,
    }
    if (userStore.user?.role === 'student') {
      payload.studentNo = profileForm.studentNo || null
    }
    const res = await updateMyProfile(payload)
    if (res.success) {
      ElMessage.success('资料已保存')
      await userStore.fetchUserInfo()
    } else {
      ElMessage.error(res.message || '保存失败')
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '保存失败')
  } finally {
    savingProfile.value = false
  }
}

const roleLabel = computed(() => {
  const r = userStore.user?.role
  if (r === 'teacher') return '教师'
  if (r === 'student') return '学生'
  return '用户'
})

const managedList = computed(() => {
  const raw = userStore.user?.managedClasses
  if (!Array.isArray(raw)) return []
  return raw
})

const teacherDepartmentDisplay = computed(() => {
  const u = userStore.user
  if (!u || u.role !== 'teacher') return '—'
  const d = u.department ?? u.department_name ?? u.dept
  if (d != null && String(d).trim() !== '') return String(d).trim()
  return '未填写（可在管理端用户管理中补充）'
})

function classTagLabel(c) {
  return c?.className || c?.class_name || '—'
}

function classTagTitle(c) {
  const parts = [c?.major, c?.grade].filter(Boolean)
  return parts.length ? parts.join(' · ') : ''
}

const classTeacher = computed(() => userStore.user?.classTeacher || null)

const beforeUpload = (file) => {
  const okType = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)
  if (!okType) {
    ElMessage.error('仅支持 JPG、PNG、GIF、WebP')
    return false
  }
  const okSize = file.size / 1024 / 1024 < 2
  if (!okSize) {
    ElMessage.error('图片需小于 2MB')
    return false
  }
  doUpload(file)
  return false
}

const doUpload = async (file) => {
  uploading.value = true
  try {
    const res = await uploadMyAvatar(file)
    if (res.success) {
      ElMessage.success('头像已更新')
      await userStore.fetchUserInfo()
    } else {
      ElMessage.error(res.message || '上传失败')
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '上传失败')
  } finally {
    uploading.value = false
  }
}

onMounted(() => {
  userStore.fetchUserInfo()
})
</script>

<style scoped>
.page-settings {
  position: relative;
  min-height: calc(100vh - 120px);
  max-width: 1100px;
  margin: 0 auto;
}

.settings-bg {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  overflow: hidden;
}

.orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(72px);
  opacity: 0.22;
  animation: float-orb 18s ease-in-out infinite;
}

.orb--a {
  width: 320px;
  height: 320px;
  background: linear-gradient(135deg, #bae6fd, #7dd3fc);
  top: -80px;
  right: 10%;
  animation-delay: 0s;
}

.orb--b {
  width: 260px;
  height: 260px;
  background: linear-gradient(135deg, #cbd5e1, #e2e8f0);
  bottom: 10%;
  left: -40px;
  animation-delay: -6s;
}

.orb--c {
  width: 200px;
  height: 200px;
  background: linear-gradient(135deg, #99f6e4, #5eead4);
  top: 40%;
  left: 40%;
  animation-delay: -12s;
}

@keyframes float-orb {
  0%,
  100% {
    transform: translate(0, 0) scale(1);
  }
  33% {
    transform: translate(24px, -20px) scale(1.05);
  }
  66% {
    transform: translate(-16px, 16px) scale(0.95);
  }
}

.settings-inner {
  position: relative;
  z-index: 1;
}

.page-head {
  margin-bottom: 28px;
}

.page-title {
  margin: 0 0 8px;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.02em;
  background: linear-gradient(120deg, #1d2129 0%, #4e5969 55%, #1677ff 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.page-desc {
  margin: 0;
  font-size: 14px;
  color: var(--sg-text-secondary);
}

.card-elevated {
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(12px);
  box-shadow: 0 4px 24px rgba(15, 23, 42, 0.06);
}

.avatar-panel {
  padding: 28px 24px 32px;
  text-align: center;
}

.avatar-ring {
  position: relative;
  width: 140px;
  height: 140px;
  margin: 0 auto 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar-ring__pulse {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 2px solid rgba(22, 119, 255, 0.28);
  animation: pulse-ring 2.4s ease-out infinite;
}

.avatar-ring.uploading .avatar-ring__pulse {
  animation-duration: 1s;
  border-color: rgba(34, 211, 238, 0.6);
}

@keyframes pulse-ring {
  0% {
    transform: scale(1);
    opacity: 0.9;
  }
  100% {
    transform: scale(1.35);
    opacity: 0;
  }
}

.avatar-ring__inner {
  position: relative;
  z-index: 1;
}

.avatar-name {
  margin: 0 0 4px;
  font-size: 18px;
  font-weight: 600;
  color: var(--sg-text);
}

.avatar-role {
  margin: 0 0 20px;
  font-size: 13px;
  color: var(--sg-text-secondary);
}

.upload-wrap {
  width: 100%;
}

.upload-wrap :deep(.el-upload-dragger) {
  border-radius: 12px;
  border-style: dashed;
  background: rgba(248, 250, 252, 0.9);
  transition:
    border-color 0.25s ease,
    background 0.25s ease,
    transform 0.2s ease;
}

.upload-wrap :deep(.el-upload-dragger:hover) {
  border-color: var(--sg-primary);
  background: rgba(239, 246, 255, 0.95);
  transform: translateY(-2px);
}

.upload-icon {
  font-size: 36px;
  color: var(--sg-primary);
  margin-bottom: 8px;
}

.upload-text {
  font-size: 14px;
  color: var(--sg-text);
  margin-bottom: 4px;
}

.upload-hint {
  font-size: 12px;
  color: var(--sg-text-placeholder);
}

.upload-status {
  margin: 12px 0 0;
  font-size: 13px;
  color: var(--sg-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.profile-edit-card {
  margin-top: 8px;
}

.profile-form {
  max-width: 640px;
}

.info-card {
  margin-bottom: 20px;
}

.card-head-title {
  font-weight: 600;
  font-size: 15px;
}

.info-dl {
  margin: 0;
}

.info-row {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--sg-border);
  font-size: 14px;
}

.info-row:last-child {
  border-bottom: none;
}

.info-row--full {
  grid-template-columns: 120px 1fr;
}

.info-row dt {
  margin: 0;
  color: var(--sg-text-secondary);
  font-weight: 500;
}

.info-row dd {
  margin: 0;
  color: var(--sg-text);
}

.muted {
  color: var(--sg-text-placeholder);
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag-animate {
  animation: tag-in 0.45s ease backwards;
}

.tag-animate:nth-child(1) {
  animation-delay: 0.05s;
}
.tag-animate:nth-child(2) {
  animation-delay: 0.1s;
}
.tag-animate:nth-child(3) {
  animation-delay: 0.15s;
}

@keyframes tag-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.teacher-card {
  border-left: 3px solid var(--sg-primary);
}

.teacher-row {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.teacher-av {
  animation: teacher-av-in 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
}

@keyframes teacher-av-in {
  from {
    opacity: 0;
    transform: scale(0.8) rotate(-8deg);
  }
  to {
    opacity: 1;
    transform: scale(1) rotate(0);
  }
}

.teacher-name {
  margin: 0 0 4px;
  font-size: 16px;
  font-weight: 600;
}

.teacher-sub {
  margin: 0 0 2px;
  font-size: 13px;
  color: var(--sg-text-secondary);
}
</style>
