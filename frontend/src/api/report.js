import axios from 'axios'

function authHeaders() {
  const token = localStorage.getItem('token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function filenameFromResponse(res, fallback) {
  const cd = res.headers['content-disposition'] || res.headers['Content-Disposition']
  if (!cd) return fallback
  const star = cd.match(/filename\*=UTF-8''([^;\s]+)/i)
  if (star) {
    try {
      return decodeURIComponent(star[1])
    } catch {
      return fallback
    }
  }
  const quoted = cd.match(/filename="([^"]+)"/i)
  if (quoted) return quoted[1]
  const plain = cd.match(/filename=([^;\s]+)/i)
  if (plain) return plain[1].replace(/^"|"$/g, '')
  return fallback
}

export async function downloadPersonalPdf(submissionId) {
  const res = await axios.get(`/api/reports/personal/${submissionId}/pdf`, {
    responseType: 'blob',
    headers: authHeaders(),
    validateStatus: () => true,
  })
  if (res.status >= 400) {
    const text = await res.data.text()
    let msg = '导出失败'
    try {
      const j = JSON.parse(text)
      msg = j.message || msg
    } catch {
      if (text) msg = text.slice(0, 200)
    }
    throw new Error(msg)
  }
  const blob = res.data
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filenameFromResponse(res, `实训评价报告_${submissionId}.pdf`)
  a.click()
  window.URL.revokeObjectURL(url)
}

export async function downloadClassPdf(classId) {
  const res = await axios.get(`/api/reports/class/${classId}/pdf`, {
    responseType: 'blob',
    headers: authHeaders(),
    validateStatus: () => true,
  })
  if (res.status >= 400) {
    const text = await res.data.text()
    let msg = '导出失败'
    try {
      const j = JSON.parse(text)
      msg = j.message || msg
    } catch {
      if (text) msg = text.slice(0, 200)
    }
    throw new Error(msg)
  }
  const blob = res.data
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filenameFromResponse(res, `班级实训统计_${classId}.pdf`)
  a.click()
  window.URL.revokeObjectURL(url)
}
