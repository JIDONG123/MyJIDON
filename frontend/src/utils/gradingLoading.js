import { ElLoading } from 'element-plus'
import { subscribeRt } from '../socket/rtBus'

/**
 * @deprecated 异步批改已改为后台任务，请使用 applyGradingJobResponse；保留供极少数同步场景参考。
 */
 * @param {boolean} isBatch
 * @param {() => Promise<any>} fn
 * @param {boolean | { trackLangchainSteps?: boolean; onLangchainStep?: (payload: object, loading: { setText?: (t: string) => void }) => void }} [third]
 *        传 true 等价于 { trackLangchainSteps: true }，在 Loading 文案中合并展示 LangChain 链步骤（依赖 Socket rt 推送 lc_step）。
 */
export async function withGradingLoading(isBatch, fn, third) {
  const opts =
    third === true
      ? { trackLangchainSteps: true }
      : third && typeof third === 'object'
        ? third
        : {}

  let sec = 0
  let lastLcHint = ''
  const loading = ElLoading.service({
    lock: true,
    text: isBatch
      ? '批量 AI 批改进行中…'
      : 'AI 批改中，正在调用大模型…\n请勿关闭页面',
    background: 'rgba(0, 0, 0, 0.35)',
  })

  let offRt = null
  const wantLc = opts.trackLangchainSteps || typeof opts.onLangchainStep === 'function'
  if (wantLc) {
    offRt = subscribeRt((payload) => {
      if (!payload || payload.domain !== 'grading' || payload.action !== 'lc_step') return
      if (typeof opts.onLangchainStep === 'function') {
        try {
          opts.onLangchainStep(payload, loading)
        } catch {
          /* ignore */
        }
      }
      if (opts.trackLangchainSteps) {
        const a = payload.lcStep != null ? String(payload.lcStep) : '?'
        const b = payload.lcStepTotal != null ? String(payload.lcStepTotal) : '4'
        const lab = payload.lcStepLabel ? String(payload.lcStepLabel) : ''
        lastLcHint = `LangChain 深度解析 ${a}/${b}${lab ? `：${lab}` : ''}`
      }
    })
  }

  const tick = () => {
    sec += 1
    const head = isBatch ? '批量 AI 批改进行中' : 'AI 批改进行中'
    const waitHint = `\n大模型推理较慢，请耐心等待（单份常需 1～5 分钟；多步链可能更长）`
    const lc = lastLcHint ? `\n${lastLcHint}` : ''
    const text = `${head}，已等待 ${sec} 秒…${waitHint}${lc}`
    if (typeof loading.setText === 'function') loading.setText(text)
  }
  const timer = setInterval(tick, 1000)
  try {
    return await fn()
  } finally {
    clearInterval(timer)
    if (typeof offRt === 'function') offRt()
    loading.close()
  }
}
