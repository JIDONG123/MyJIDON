/** 课程/教学班角色码 → 中文（与后端 my_roles 一致） */
export const COURSE_ROLE_LABELS = {
  course_leader: '课程负责人',
  lead_teacher: '主讲教师',
  assistant_teacher: '协同教师',
  enterprise_mentor: '企业导师',
}

export const COURSE_ROLE_TAG_TYPE = {
  course_leader: 'danger',
  lead_teacher: 'primary',
  assistant_teacher: 'success',
  enterprise_mentor: 'warning',
}

export function courseRoleLabels(myRoles) {
  return (myRoles || []).map((code) => COURSE_ROLE_LABELS[code] || code)
}
