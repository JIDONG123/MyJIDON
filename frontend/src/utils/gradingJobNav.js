/**
 * 批改任务详情页导航：携带 from 来源，返回时回到原页面（如任务管理）。
 */
export function gradingJobDetailLocation(basePath, jobId, fromRoute) {
  const fromPath =
    typeof fromRoute === 'string'
      ? fromRoute
      : fromRoute?.fullPath || fromRoute?.path || ''

  const query = {}
  if (
    fromPath &&
    fromPath.startsWith(basePath) &&
    !fromPath.includes('/grading-jobs/')
  ) {
    query.from = fromPath
  }

  return {
    path: `${basePath}/grading-jobs/${jobId}`,
    query: Object.keys(query).length ? query : undefined,
  }
}

export function resolveGradingJobBackTarget(basePath, fromQuery) {
  if (
    typeof fromQuery === 'string' &&
    fromQuery.startsWith(basePath) &&
    !fromQuery.includes('/grading-jobs/')
  ) {
    return fromQuery
  }
  return `${basePath}/grading-jobs`
}

export function gradingJobBackLabel(basePath, fromQuery) {
  const target = resolveGradingJobBackTarget(basePath, fromQuery)
  if (target.includes('/tasks')) return '返回任务管理'
  if (target.includes('/submissions')) return '返回成果列表'
  if (target.includes('/grading-queue')) return '返回成果批改'
  if (target.includes('/grading-jobs')) return '返回批改任务列表'
  return '返回上一页'
}
