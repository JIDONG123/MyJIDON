<template>
  <div class="page-settings">
    <header class="page-head">
      <h1 class="page-title">我的设置</h1>
      <p class="page-desc">管理头像、账号安全与联系方式；变更将同步至顶栏与侧栏。</p>
    </header>

    <div class="settings-layout">
      <!-- 左侧：个人资料卡 -->
      <aside class="profile-card">
        <div class="profile-card__avatar" :class="{ 'is-uploading': uploading }">
          <UserAvatar
            :src="userStore.user?.avatarUrl"
            :name="userStore.user?.realName"
            :size="88"
          />
        </div>
        <h2 class="profile-card__name">{{ userStore.user?.realName ?? '—' }}</h2>
        <el-tag size="small" effect="plain" class="profile-card__role">{{ roleLabel }}</el-tag>

        <template v-if="userStore.user?.role === 'teacher'">
          <p class="profile-card__meta">
            <span class="meta-label">学院 / 部门</span>
            <span class="meta-value">{{ teacherDepartmentDisplay }}</span>
          </p>
          <div v-if="managedList.length" class="profile-card__tags">
            <span class="meta-label">负责班级</span>
            <div class="tag-list">
              <el-tag
                v-for="c in managedList"
                :key="c.id"
                size="small"
                effect="plain"
                :title="classTagTitle(c)"
              >
                {{ classTagLabel(c) }}
              </el-tag>
            </div>
          </div>
          <p v-else class="profile-card__empty">暂无负责班级</p>
        </template>

        <template v-else-if="userStore.user?.role === 'student'">
          <p class="profile-card__meta">
            <span class="meta-label">所在班级</span>
            <span class="meta-value">{{ studentClassDisplay }}</span>
          </p>
        </template>

        <div class="profile-card__upload">
          <el-upload
            :show-file-list="false"
            accept="image/jpeg,image/png,image/gif,image/webp"
            :before-upload="beforeUpload"
          >
            <el-button size="small" type="primary" plain :loading="uploading">
              更换头像
            </el-button>
          </el-upload>
          <p class="upload-hint">JPG / PNG / GIF / WebP，最大 2MB</p>
        </div>
      </aside>

      <!-- 右侧：设置内容区 -->
      <div class="settings-main">
        <section class="settings-card">
          <h3 class="settings-card__title">基本信息</h3>
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
              <div class="info-row">
                <dt>负责班级</dt>
                <dd>
                  <div v-if="managedList.length" class="tag-list tag-list--inline">
                    <el-tag
                      v-for="c in managedList"
                      :key="c.id"
                      size="small"
                      effect="plain"
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
                <dd>{{ studentClassDisplay }}</dd>
              </div>
            </template>
          </dl>
        </section>

        <section
          v-if="userStore.user?.role === 'student' && classTeacher"
          class="settings-card"
        >
          <h3 class="settings-card__title">我的负责教师</h3>
          <div class="teacher-row">
            <UserAvatar
              :src="classTeacher.avatarUrl"
              :name="classTeacher.realName"
              :size="48"
            />
            <div class="teacher-meta">
              <p class="teacher-name">{{ classTeacher.realName }}</p>
              <p class="teacher-sub">@{{ classTeacher.username }}</p>
              <p v-if="classTeacher.email" class="teacher-sub">{{ classTeacher.email }}</p>
            </div>
          </div>
        </section>

        <section v-if="showProfileEdit" class="settings-card">
          <h3 class="settings-card__title">账号安全</h3>
          <el-form label-width="96px" class="compact-form" @submit.prevent>
            <el-form-item label="用户名">
              <el-input v-model="credForm.username" maxlength="64" autocomplete="off" />
            </el-form-item>
            <el-form-item label="当前密码">
              <el-input
                v-model="credForm.currentPassword"
                type="password"
                show-password
                autocomplete="current-password"
                placeholder="修改用户名或密码时必填"
              />
            </el-form-item>
            <el-form-item label="新密码">
              <el-input
                v-model="credForm.newPassword"
                type="password"
                show-password
                autocomplete="new-password"
                placeholder="不修改请留空"
              />
            </el-form-item>
            <el-form-item label="确认新密码">
              <el-input
                v-model="credForm.confirmPassword"
                type="password"
                show-password
                autocomplete="new-password"
                placeholder="再次输入新密码"
              />
            </el-form-item>
            <p class="form-hint">
              不修改密码时，新密码与确认新密码可留空。密码至少 6 位，建议包含字母与数字。
            </p>
            <el-form-item class="form-actions">
              <el-button type="primary" :loading="savingCreds" @click="saveCredentials">
                保存账号安全设置
              </el-button>
            </el-form-item>
          </el-form>
        </section>

        <section v-if="showProfileEdit" class="settings-card">
          <h3 class="settings-card__title">联系方式与简介</h3>
          <el-form label-width="96px" class="compact-form" @submit.prevent>
            <el-form-item v-if="userStore.user?.role === 'student'" label="学号">
              <el-input
                v-model="profileForm.studentNo"
                maxlength="32"
                show-word-limit
                placeholder="选填，用于导出报表等"
              />
            </el-form-item>
            <el-form-item label="手机">
              <el-input v-model="profileForm.phone" maxlength="20" placeholder="选填" />
            </el-form-item>
            <el-form-item label="其他联系方式">
              <el-input
                v-model="profileForm.contactExtra"
                maxlength="100"
                placeholder="如微信号等（选填）"
              />
            </el-form-item>
            <el-form-item label="个人简介">
              <el-input
                v-model="profileForm.profileBio"
                type="textarea"
                :rows="4"
                maxlength="2000"
                show-word-limit
                class="bio-textarea"
                placeholder="选填；保存后将在顶栏姓名下方简要展示"
              />
            </el-form-item>
            <el-form-item class="form-actions">
              <el-button type="primary" :loading="savingProfile" @click="saveProfile">
                保存个人资料
              </el-button>
            </el-form-item>
          </el-form>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, reactive, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useUserStore } from '../../stores/user'
import { uploadMyAvatar, updateMyProfile, updateMyCredentials } from '../../api/user'
import UserAvatar from '../../components/UserAvatar.vue'
import { validatePasswordPlaintext } from '../../utils/passwordPolicy'
import { logoutAndGoLogin } from '../../utils/authLogout'

const router = useRouter()
const userStore = useUserStore()
const uploading = ref(false)
const savingProfile = ref(false)
const savingCreds = ref(false)

const profileForm = reactive({
  studentNo: '',
  phone: '',
  contactExtra: '',
  profileBio: '',
})

const credForm = reactive({
  username: '',
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
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
    credForm.username = u.username ?? ''
  },
  { immediate: true }
)

const saveCredentials = async () => {
  if (!credForm.currentPassword) {
    ElMessage.error('请输入当前密码以确认身份')
    return
  }
  const usernameChanged = credForm.username.trim() !== (userStore.user?.username ?? '')
  const wantsPassword = !!credForm.newPassword

  if (!usernameChanged && !wantsPassword) {
    ElMessage.warning('未修改用户名或密码')
    return
  }
  if (wantsPassword) {
    if (credForm.newPassword !== credForm.confirmPassword) {
      ElMessage.error('两次输入的新密码不一致')
      return
    }
    const pv = validatePasswordPlaintext(credForm.newPassword)
    if (!pv.ok) {
      ElMessage.error(pv.message)
      return
    }
  }

  savingCreds.value = true
  try {
    const payload = {
      username: credForm.username.trim(),
      currentPassword: credForm.currentPassword,
    }
    if (wantsPassword) {
      payload.newPassword = credForm.newPassword
      payload.confirmPassword = credForm.confirmPassword
    }
    const res = await updateMyCredentials(payload)
    if (res.success) {
      ElMessage.success(res.message || '账号安全设置已保存')
      credForm.currentPassword = ''
      credForm.newPassword = ''
      credForm.confirmPassword = ''
      if (res.requireRelogin) {
        await logoutAndGoLogin(router, { showToast: false })
      } else {
        await userStore.fetchUserInfo()
      }
    } else {
      ElMessage.error(res.message || '保存失败')
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '保存失败')
  } finally {
    savingCreds.value = false
  }
}

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
      ElMessage.success('个人资料已保存')
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

const studentClassDisplay = computed(() => {
  const u = userStore.user
  if (!u) return '—'
  const name =
    u.className ||
    u.class_name ||
    (u.classId ? `班级 ID ${u.classId}` : '') ||
    '未分班'
  const extra = [u.classMajor || u.class_major, u.classGrade || u.class_grade].filter(Boolean)
  return extra.length ? `${name} · ${extra.join(' ')}` : name
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
  max-width: 980px;
  margin: 0 auto;
  padding: 4px 16px 24px;
  min-height: calc(100vh - 140px);
  background: #f3f6fa;
  border-radius: 8px;
}

.page-head {
  margin-bottom: 18px;
}

.page-title {
  margin: 0 0 6px;
  font-size: 22px;
  font-weight: 700;
  color: #0f172a;
}

.page-desc {
  margin: 0;
  font-size: 13px;
  color: #64748b;
  line-height: 1.5;
}

.settings-layout {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

/* 左侧资料卡 */
.profile-card {
  position: sticky;
  top: 16px;
  padding: 20px 18px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.06);
  text-align: center;
}

.profile-card__avatar {
  display: flex;
  justify-content: center;
  margin-bottom: 12px;
}

.profile-card__avatar.is-uploading {
  opacity: 0.65;
}

.profile-card__avatar :deep(.user-avatar) {
  border-radius: 50%;
}

.profile-card__name {
  margin: 0 0 8px;
  font-size: 17px;
  font-weight: 600;
  color: #0f172a;
}

.profile-card__role {
  margin-bottom: 14px;
}

.profile-card__meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0 0 12px;
  text-align: left;
  padding: 10px 12px;
  background: #f8fafc;
  border-radius: 8px;
}

.profile-card__tags {
  text-align: left;
  margin-bottom: 12px;
  padding: 10px 12px;
  background: #f8fafc;
  border-radius: 8px;
}

.profile-card__empty {
  margin: 0 0 12px;
  font-size: 12px;
  color: #94a3b8;
  text-align: left;
}

.meta-label {
  display: block;
  font-size: 11px;
  color: #64748b;
  font-weight: 500;
}

.meta-value {
  font-size: 13px;
  color: #334155;
  line-height: 1.45;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.tag-list--inline {
  margin-top: 0;
}

.profile-card__upload {
  margin-top: 4px;
  padding-top: 14px;
  border-top: 1px solid #f1f5f9;
}

.upload-hint {
  margin: 8px 0 0;
  font-size: 11px;
  color: #94a3b8;
  line-height: 1.4;
}

/* 右侧设置区 */
.settings-main {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.settings-card {
  padding: 16px 18px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.06);
}

.settings-card__title {
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 600;
  color: #0f172a;
}

.info-dl {
  margin: 0;
}

.info-row {
  display: grid;
  grid-template-columns: 96px 1fr;
  gap: 8px 12px;
  padding: 8px 0;
  border-bottom: 1px solid #f1f5f9;
  font-size: 13px;
  line-height: 1.5;
}

.info-row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.info-row:first-child {
  padding-top: 0;
}

.info-row dt {
  margin: 0;
  color: #64748b;
  font-weight: 500;
}

.info-row dd {
  margin: 0;
  color: #334155;
}

.muted {
  color: #94a3b8;
  font-size: 12px;
}

.compact-form :deep(.el-form-item) {
  margin-bottom: 14px;
}

.compact-form :deep(.el-form-item__label) {
  color: #64748b;
  font-size: 13px;
  padding-right: 8px;
}

.compact-form :deep(.el-input__wrapper),
.compact-form :deep(.el-textarea__inner) {
  border-radius: 8px;
}

.bio-textarea :deep(.el-textarea__inner) {
  min-height: 120px !important;
  max-height: 120px;
  resize: none;
}

.form-hint {
  margin: -4px 0 12px 96px;
  font-size: 12px;
  color: #64748b;
  line-height: 1.5;
}

.form-actions {
  margin-bottom: 0 !important;
  padding-top: 4px;
}

.teacher-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.teacher-name {
  margin: 0 0 2px;
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
}

.teacher-sub {
  margin: 0;
  font-size: 12px;
  color: #64748b;
  line-height: 1.45;
}

@media (max-width: 768px) {
  .settings-layout {
    grid-template-columns: 1fr;
  }

  .profile-card {
    position: static;
  }

  .form-hint {
    margin-left: 0;
  }
}
</style>
