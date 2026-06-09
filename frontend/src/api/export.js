import axios from 'axios'
import { getToken } from '../utils/authStorage'

function blobHeaders() {
  const token = getToken()
  const h = {}
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function downloadScoresExcel(audienceId, taskId, options = {}) {
  const isTeaching = options.scope === 'teaching' || options.teachingClassId != null
  const params = { taskId }
  if (isTeaching) {
    params.teachingClassId = options.teachingClassId ?? audienceId
  } else {
    params.classId = audienceId
  }
  const res = await axios.get('/api/export/scores', {
    params,
    responseType: 'blob',
    headers: blobHeaders(),
    validateStatus: () => true,
  })
  if (res.status !== 200) {
    let msg = '导出失败'
    try {
      const t = await res.data.text()
      const j = JSON.parse(t)
      msg = j.message || msg
    } catch (_) {}
    throw new Error(msg)
  }
  const label = isTeaching ? `教学班${params.teachingClassId}` : `班级${params.classId}`
  triggerDownload(res.data, `${label}-任务${taskId}-成绩统计.xlsx`)
}

export async function downloadSubmissionsZip(audienceId, taskId, options = {}) {
  const isTeaching = options.scope === 'teaching' || options.teachingClassId != null
  const params = { taskId }
  if (isTeaching) {
    params.teachingClassId = options.teachingClassId ?? audienceId
  } else {
    params.classId = audienceId
  }
  const res = await axios.get('/api/export/submissions-zip', {
    params,
    responseType: 'blob',
    headers: blobHeaders(),
    validateStatus: () => true,
  })
  if (res.status !== 200) {
    let msg = '打包失败'
    try {
      const t = await res.data.text()
      const j = JSON.parse(t)
      msg = j.message || msg
    } catch (_) {}
    throw new Error(msg)
  }
  const label = isTeaching ? `教学班${params.teachingClassId}` : `班级${params.classId}`
  triggerDownload(res.data, `${label}-任务${taskId}-作业附件.zip`)
}

export async function getExportLogs(options = {}) {
  const params = {}
  if (options.limit != null) params.limit = options.limit
  if (options.taskId != null) params.taskId = options.taskId
  const res = await axios.get('/api/export/logs', {
    params,
    headers: blobHeaders(),
  })
  return res.data
}
