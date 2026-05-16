import axios from 'axios'

function blobHeaders() {
  const token = localStorage.getItem('token')
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

export async function downloadScoresExcel(classId, taskId) {
  const res = await axios.get('/api/export/scores', {
    params: { classId, taskId },
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
  triggerDownload(res.data, `班级${classId}-任务${taskId}-成绩统计.xlsx`)
}

export async function downloadSubmissionsZip(classId, taskId) {
  const res = await axios.get('/api/export/submissions-zip', {
    params: { classId, taskId },
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
  triggerDownload(res.data, `班级${classId}-任务${taskId}-作业附件.zip`)
}
