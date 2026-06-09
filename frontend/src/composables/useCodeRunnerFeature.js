import axios from 'axios'
import { getToken } from '../utils/authStorage'

let cached = null
let pending = null

/** 探测后端 CODE_RUNNER_ENABLED（503=关闭，200=开启；须已登录） */
export async function probeCodeRunnerEnabled() {
  if (cached !== null) return cached
  if (pending) return pending

  const token = getToken()
  if (!token) return false

  pending = (async () => {
    try {
      const r = await axios.get('/api/online-practice/templates', {
        validateStatus: () => true,
        timeout: 8000,
        headers: { Authorization: `Bearer ${token}` },
      })
      cached = r.status !== 503
    } catch {
      cached = false
    }
    pending = null
    return cached
  })()
  return pending
}

export function resetCodeRunnerProbe() {
  cached = null
  pending = null
}
