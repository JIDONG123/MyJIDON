import * as echarts from 'echarts'
import { KG_COLORS, truncateLabel } from './kgTheme'
import { nodeTypeLabel, relationLabel } from './kgRelationLabels'
import {
  applyNodeTheme,
  markCoreLabels,
  assignCircularLayout,
  assignLayeredLayout,
  centerNodeCoordinates,
  graphBoundsFromNodes,
} from './kgGraphUtils'
import { ensureChartInstance } from './echartsInstance'

function baseTooltip() {
  return {
    trigger: 'item',
    confine: true,
    appendTo: typeof document !== 'undefined' ? document.body : undefined,
    enterable: false,
    transitionDuration: 0,
    formatter: (p) => {
      if (p.dataType === 'edge') {
        const rel = relationLabel(p.data.relationLabel || p.data.value || '')
        const style = p.data.lineStyle?.type === 'dashed' ? '（聚合）' : ''
        return `${rel}${style}`
      }
      const name = p.data.fullName || p.data.name
      const rate = p.data.masteryRate
      const extra =
        rate != null && Number.isFinite(rate)
          ? `<br/>掌握率 ${(rate * 100).toFixed(0)}%`
          : p.data.degree != null
            ? `<br/>关联度 ${p.data.degree}`
            : ''
      const type = nodeTypeLabel(p.data.typeLabel || p.data.value || p.data.type || '')
      return `<strong>${name}</strong><br/><span style="opacity:.65">${type}</span>${extra}`
    },
  }
}

function repulsionForCount(n) {
  if (n > 150) return 920
  if (n > 100) return 720
  if (n > 60) return 520
  if (n > 30) return 380
  return 300
}

function prepareGraph(graph, role, displayOpts = {}) {
  const layoutMode = displayOpts.layoutMode || 'force'
  const zoomLevel = displayOpts.zoomLevel ?? 1
  let nodes = applyNodeTheme([...(graph?.nodes || [])], role)
  const links = [...(graph?.links || [])]
  const categories = graph?.categories || []

  markCoreLabels(nodes, links, role, zoomLevel)

  // smart 与 force 均使用力导向；仅 layer / circular 预置坐标
  if (layoutMode === 'circular') {
    const centerId =
      nodes.find((n) =>
        ['administrative_class', 'teaching_class', 'course', 'student'].includes(n.value || n.type)
      )?.id || nodes[0]?.id
    nodes = centerNodeCoordinates(assignCircularLayout(nodes, centerId))
  } else if (layoutMode === 'layer') {
    nodes = centerNodeCoordinates(assignLayeredLayout(nodes, links))
  }

  return { nodes, links, categories, layoutMode }
}

function buildSeries(graph, role, displayOpts) {
  const { nodes, links, categories, layoutMode } = prepareGraph(graph, role, displayOpts)
  const n = nodes.length
  const useForce = layoutMode === 'force' || layoutMode === 'smart'
  const selectedId = displayOpts.selectedId

  const styledLinks = links.map((e) => {
    const isSelected = selectedId && (e.source === selectedId || e.target === selectedId)
    const isWeak = e.value === 'WEAK_IN' || e.value === 'MISTAKE_ON'
    return {
      ...e,
      lineStyle: {
        color: isWeak ? KG_COLORS.high_risk : KG_COLORS.edge,
        curveness: 0.12,
        opacity: isSelected ? 0.85 : 0.35,
        width: isSelected ? 2.2 : 1,
        ...(e.lineStyle || {}),
      },
    }
  })

  const styledNodes = nodes.map((nd) => {
    const isSelected = selectedId === nd.id
    const isNeighbor =
      selectedId &&
      links.some(
        (e) =>
          (e.source === selectedId && e.target === nd.id) ||
          (e.target === selectedId && e.source === nd.id)
      )
    const dimmed = selectedId && !isSelected && !isNeighbor && !nd.isAggregate
    return {
      ...nd,
      label: {
        ...(nd.label || {}),
        show: nd.label?.show !== false && (nd.label?.show || isSelected || isNeighbor),
        formatter: truncateLabel(nd.fullName || nd.name),
        fontSize: isSelected ? 12 : 10,
        color: '#334155',
      },
      itemStyle: {
        ...(nd.itemStyle || {}),
        opacity: dimmed ? 0.28 : 1,
        borderWidth: isSelected ? 3 : nd.itemStyle?.borderWidth || 0,
        borderColor: isSelected ? KG_COLORS.edgeHighlight : nd.itemStyle?.borderColor,
      },
    }
  })

  return {
    type: 'graph',
    layout: useForce ? 'force' : 'none',
    roam: 'move',
    scaleLimit: { min: 0.08, max: 12 },
    draggable: !displayOpts.layoutLocked,
    data: styledNodes,
    links: styledLinks,
    categories,
    emphasis: {
      focus: 'adjacency',
      label: { show: true, formatter: (p) => truncateLabel(p.data.fullName || p.data.name, 20) },
      lineStyle: { width: 3, color: KG_COLORS.edgeHighlight },
    },
    force: useForce
      ? {
          repulsion: repulsionForCount(n),
          edgeLength: n > 80 ? [60, 140] : [80, 180],
          gravity: 0.12,
          friction: 0.58,
          layoutAnimation: !displayOpts.layoutLocked,
        }
      : undefined,
    edgeSymbol: ['none', 'arrow'],
    edgeSymbolSize: 6,
    lineStyle: {
      color: KG_COLORS.edge,
      curveness: 0.1,
      opacity: 0.4,
    },
  }
}

function buildOption(graph, role, displayOpts = {}) {
  const series = buildSeries(graph, role, displayOpts)
  return {
    backgroundColor: 'transparent',
    color: Object.values(KG_COLORS),
    tooltip: baseTooltip(),
    legend: { show: false },
    animation: true,
    animationDuration: 450,
    series: [series],
  }
}

export function buildStudentGraphOption(graph, displayOpts) {
  return buildOption(graph, 'student', displayOpts)
}

export function buildClassGraphOption(graph, displayOpts) {
  return buildOption(graph, 'teacher', displayOpts)
}

export function buildCourseHierarchicalGraphOption(graph, displayOpts) {
  return buildOption(
    { ...graph, layoutStyle: 'hierarchical' },
    'admin',
    { ...displayOpts, layoutMode: displayOpts?.layoutMode || 'layer' }
  )
}

export function buildCourseForceGraphOption(graph, displayOpts) {
  return buildOption(graph, 'admin', displayOpts)
}

export function buildCourseGraphOption(graph, displayOpts) {
  if (graph?.layoutStyle === 'force' || graph?.viewMode === 'course-force') {
    return buildCourseForceGraphOption(graph, displayOpts)
  }
  return buildCourseHierarchicalGraphOption(graph, displayOpts)
}

/**
 * 按 viewMode / graphMode 选择渲染配置
 */
export function buildKgGraphOption(graph, graphMode, displayOpts = {}) {
  const mode = graph?.viewMode || graphMode || 'default'
  if (mode === 'student') return buildStudentGraphOption(graph, displayOpts)
  if (mode === 'class') return buildClassGraphOption(graph, displayOpts)
  if (mode === 'course' || mode === 'course-force') return buildCourseGraphOption(graph, displayOpts)
  return buildClassGraphOption(graph, displayOpts)
}

/** 兼容旧调用 */
export function buildForceGraphOption(graph, displayOpts) {
  const g = graph?.viewMode ? graph : { ...graph, viewMode: 'class' }
  if (graph?.viewMode === 'course' || graph?.viewMode === 'course-force') {
    return buildCourseGraphOption(graph, displayOpts)
  }
  return buildClassGraphOption(g, displayOpts)
}

export function initForceGraph(dom, graph, displayOpts) {
  if (!dom) return null
  const chart = ensureChartInstance(dom, null)
  chart.setOption(buildKgGraphOption(graph, undefined, displayOpts), true)
  return chart
}

const VIEW_ZOOM_MIN = 0.08
const VIEW_ZOOM_MAX = 12

function clampViewZoom(zoom) {
  return Math.min(VIEW_ZOOM_MAX, Math.max(VIEW_ZOOM_MIN, zoom))
}

function readGraphSeries(chart) {
  const series = chart.getOption()?.series?.[0] || {}
  return {
    zoom: typeof series.zoom === 'number' ? series.zoom : 1,
    center: Array.isArray(series.center) ? series.center : null,
    nodes: series.data || [],
  }
}

function graphBounds(nodes) {
  return graphBoundsFromNodes(nodes)
}

function viewportCenter(chart) {
  const dom = chart.getDom?.()
  if (!dom) return ['50%', '50%']
  return [dom.clientWidth / 2, dom.clientHeight / 2]
}

function applyGraphView(chart, zoom, center) {
  chart.setOption({
    series: [{ zoom, center: center ?? viewportCenter(chart) }],
  })
}

export function hideGraphTip(chart) {
  if (!chart || chart.isDisposed()) return
  try {
    chart.dispatchAction({ type: 'hideTip' })
  } catch {
    /* ignore during layout transitions */
  }
}

export function resizeGraph(chart) {
  if (!chart || chart.isDisposed()) return
  hideGraphTip(chart)
  const dom = chart.getDom?.()
  if (dom && (dom.clientWidth < 2 || dom.clientHeight < 2)) return
  try {
    chart.resize()
  } catch {
    /* ignore stale tooltip DOM during resize */
  }
}

export function disposeGraph(chart) {
  if (chart && !chart.isDisposed()) {
    hideGraphTip(chart)
    chart.dispose()
  }
}

export function fitGraphView(chart) {
  if (!chart || chart.isDisposed()) return null
  hideGraphTip(chart)
  const dom = chart.getDom?.()
  if (!dom || dom.clientWidth < 2 || dom.clientHeight < 2) return null

  const series = chart.getOption()?.series?.[0] || {}
  const { nodes } = readGraphSeries(chart)
  const bounds = graphBounds(nodes)
  const viewCenter = viewportCenter(chart)

  if (!bounds) {
    applyGraphView(chart, 1, viewCenter)
    return 1
  }

  const graphW = Math.max(bounds.maxX - bounds.minX, 80)
  const graphH = Math.max(bounds.maxY - bounds.minY, 80)
  const margin = 56
  const fitZoom = clampViewZoom(
    Math.min((dom.clientWidth - margin) / graphW, (dom.clientHeight - margin) / graphH)
  )

  // 力导向：只缩放并将视口中心复位，避免错误 center 把图挤到角落
  if (series.layout === 'force') {
    applyGraphView(chart, fitZoom, viewCenter)
    return fitZoom
  }

  const cx = (bounds.minX + bounds.maxX) / 2
  const cy = (bounds.minY + bounds.maxY) / 2
  applyGraphView(chart, fitZoom, [cx, cy])
  return fitZoom
}

export function zoomGraph(chart, factor) {
  if (!chart || chart.isDisposed()) return null
  hideGraphTip(chart)
  const { zoom, center } = readGraphSeries(chart)
  const nextZoom = clampViewZoom(zoom * factor)
  applyGraphView(chart, nextZoom, center || viewportCenter(chart))
  return nextZoom
}
