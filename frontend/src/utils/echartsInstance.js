import * as echarts from 'echarts'

/**
 * 复用 DOM 上已有实例，避免重复 echarts.init。
 * @returns {import('echarts').ECharts | null}
 */
export function ensureChartInstance(dom, currentChart, initOpts) {
  if (!dom) return currentChart ?? null

  if (currentChart && !currentChart.isDisposed()) {
    const boundDom = currentChart.getDom?.()
    if (boundDom === dom) return currentChart
    disposeChartInstance(currentChart)
  }

  const existing = echarts.getInstanceByDom(dom)
  if (existing && !existing.isDisposed()) return existing

  return echarts.init(dom, undefined, initOpts)
}

/** @returns {null} */
export function disposeChartInstance(chart) {
  if (chart && !chart.isDisposed()) {
    try {
      chart.dispatchAction({ type: 'hideTip' })
    } catch {
      /* ignore during teardown */
    }
    chart.dispose()
  }
  return null
}

/**
 * 合并连续 setOption / resize 请求（双 RAF，与图谱 render 节奏一致）
 */
export function createChartRenderScheduler(run) {
  let raf = null
  return function schedule() {
    if (raf) cancelAnimationFrame(raf)
    raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        raf = null
        run()
      })
    })
  }
}
