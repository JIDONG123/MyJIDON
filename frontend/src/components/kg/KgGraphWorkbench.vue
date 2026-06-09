<template>
  <div class="kg-workbench" :class="`kg-workbench--${role}`">
    <!-- 统计卡片 -->
    <div v-if="statCards.length && !isFullscreen" class="kg-stats">
      <div
        v-for="card in statCards"
        :key="card.key"
        class="kg-stat-card"
        :class="{ 'kg-stat-card--warn': card.warn }"
      >
        <span v-if="card.icon" class="kg-stat-card__icon">{{ card.icon }}</span>
        <div class="kg-stat-card__body">
          <span class="kg-stat-card__label">{{ card.label }}</span>
          <span class="kg-stat-card__value">{{ card.value ?? '—' }}</span>
        </div>
      </div>
    </div>

    <!-- 质量提醒 / 建议卡片 -->
    <div v-if="qualityAlerts.length && role === 'admin' && !isFullscreen" class="kg-alerts">
      <el-alert
        v-for="(a, i) in qualityAlerts"
        :key="i"
        :title="a.text"
        :type="a.type"
        show-icon
        :closable="false"
        class="kg-alert-item"
      />
    </div>

    <div class="kg-body" :class="{ 'kg-body--fullscreen': isFullscreen }">
      <!-- 左侧筛选（全屏时可唤出浮层） -->
      <aside
        v-show="!isFullscreen || fsSidebarOpen"
        class="kg-sidebar"
        :class="{
          'kg-sidebar--collapsed': sidebarCollapsed && !isFullscreen,
          'kg-sidebar--fs-overlay': isFullscreen && fsSidebarOpen,
        }"
      >
        <div class="kg-sidebar__head">
          <span>筛选</span>
          <el-button link size="small" @click="sidebarCollapsed = !sidebarCollapsed">
            {{ sidebarCollapsed ? '展开' : '收起' }}
          </el-button>
        </div>
        <div v-show="!sidebarCollapsed || isFullscreen" class="kg-sidebar__body">
          <slot name="filters" />

          <!-- 管理端：课程资源总览筛选（不含学生个人节点） -->
          <template v-if="role === 'admin'">
            <div v-if="adminClassOptions.length" class="kg-filter-group">
              <label class="kg-filter-label">行政班</label>
              <el-select
                v-model="contextFocusId"
                filterable
                clearable
                placeholder="全部行政班"
                size="small"
                style="width: 100%"
                @change="onContextFocusChange"
              >
                <el-option v-for="o in adminClassOptions" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
            </div>
            <div v-if="adminTeachingClassOptions.length" class="kg-filter-group">
              <label class="kg-filter-label">教学班</label>
              <el-select
                v-model="contextFocusId"
                filterable
                clearable
                placeholder="全部教学班"
                size="small"
                style="width: 100%"
                @change="onContextFocusChange"
              >
                <el-option v-for="o in adminTeachingClassOptions" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
            </div>
            <div v-if="adminTeacherOptions.length" class="kg-filter-group">
              <label class="kg-filter-label">教师</label>
              <el-select
                v-model="contextFocusId"
                filterable
                clearable
                placeholder="全部教师"
                size="small"
                style="width: 100%"
                @change="onContextFocusChange"
              >
                <el-option v-for="o in adminTeacherOptions" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
            </div>
            <div v-if="adminCourseOptions.length" class="kg-filter-group">
              <label class="kg-filter-label">课程/章节</label>
              <el-select
                v-model="contextFocusId"
                filterable
                clearable
                placeholder="全部课程/章节"
                size="small"
                style="width: 100%"
                @change="onContextFocusChange"
              >
                <el-option v-for="o in adminCourseOptions" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
            </div>
            <div v-if="adminTaskOptions.length" class="kg-filter-group">
              <label class="kg-filter-label">任务</label>
              <el-select
                v-model="contextFocusId"
                filterable
                clearable
                placeholder="全部任务"
                size="small"
                style="width: 100%"
                @change="onContextFocusChange"
              >
                <el-option v-for="o in adminTaskOptions" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
            </div>
          </template>

          <!-- 教师端：学生筛选 -->
          <div v-if="role === 'teacher' && teacherStudentOptions.length" class="kg-filter-group">
            <label class="kg-filter-label">学生</label>
            <el-select
              v-model="contextFocusId"
              filterable
              clearable
              placeholder="全部学生"
              size="small"
              style="width: 100%"
              @change="onContextFocusChange"
            >
              <el-option v-for="o in teacherStudentOptions" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
          </div>

          <div class="kg-filter-group">
            <label class="kg-filter-label">节点类型</label>
            <el-checkbox-group v-model="filterNodeTypes" size="small">
              <el-checkbox v-for="t in nodeTypeOptions" :key="t.value" :value="t.value">
                {{ t.label }}
              </el-checkbox>
            </el-checkbox-group>
          </div>

          <div class="kg-filter-group">
            <label class="kg-filter-label">关系类型</label>
            <el-select
              v-model="filterRelationTypes"
              multiple
              collapse-tags
              clearable
              placeholder="全部关系"
              size="small"
              style="width: 100%"
            >
              <el-option v-for="r in relationOptions" :key="r.value" :label="r.label" :value="r.value" />
            </el-select>
          </div>

          <div class="kg-filter-group kg-filter-switches">
            <el-checkbox v-if="role === 'admin'" v-model="filterIsolatedOnly" size="small">只看孤立节点</el-checkbox>
            <el-checkbox v-if="role === 'admin'" v-model="filterUnlinkedKpOnly" size="small">只看未关联任务知识点</el-checkbox>
            <el-checkbox v-if="role !== 'student'" v-model="filterWeakOnly" size="small">只看薄弱点</el-checkbox>
            <el-checkbox v-if="role === 'teacher'" v-model="filterErrorOnly" size="small">只看高频错误</el-checkbox>
            <el-checkbox v-if="role !== 'admin'" v-model="filterRecentOnly" size="small">只看最近任务</el-checkbox>
          </div>

          <div v-if="role === 'teacher'" class="kg-filter-group">
            <label class="kg-filter-label">视图</label>
            <el-radio-group v-model="teacherView" size="small">
              <el-radio-button value="default">综合</el-radio-button>
              <el-radio-button value="knowledge">知识点</el-radio-button>
              <el-radio-button value="task">任务</el-radio-button>
              <el-radio-button value="weak">薄弱点</el-radio-button>
              <el-radio-button value="student">学生</el-radio-button>
            </el-radio-group>
          </div>

          <div class="kg-filter-group">
            <label class="kg-filter-label">搜索节点</label>
            <el-input
              v-model="searchQuery"
              placeholder="搜索任务、知识点或节点名称"
              size="small"
              clearable
              @keyup.enter="onSearchSelect(searchResults[0])"
            />
            <ul v-if="searchResults.length" class="kg-search-list">
              <li
                v-for="item in searchResults"
                :key="item.id"
                class="kg-search-item"
                @click="onSearchSelect(item)"
              >
                <span class="kg-search-name">{{ item.name }}</span>
                <span class="kg-search-type">{{ nodeTypeLabel(item.type) }}</span>
              </li>
            </ul>
          </div>
        </div>
      </aside>

      <!-- 画布 + 详情：全屏时 Teleport 到 body，避免被布局壳层限制 -->
      <Teleport to="body" :disabled="!isFullscreen">
      <div
        class="kg-center"
        :class="{
          'kg-center--fs': isFullscreen,
          'kg-center--fs-no-detail': isFullscreen && detailCollapsed,
          'kg-center--single': detailCollapsed && !isFullscreen,
        }"
      >
      <!-- 中间画布 -->
      <main class="kg-canvas-wrap" :class="{ 'kg-canvas-wrap--fs': isFullscreen, 'kg-canvas-wrap--graph-only': isFullscreen && !fsToolbarVisible }">
        <!-- 全屏纯净模式：仅保留图谱，右上角浮动操作 -->
        <div v-if="isFullscreen && !fsToolbarVisible" class="kg-fs-float">
          <el-button size="small" round @click="fsSidebarOpen = !fsSidebarOpen">筛选</el-button>
          <el-button size="small" round @click="fsToolbarVisible = true">工具栏</el-button>
          <el-button size="small" round @click="onFit">适配画布</el-button>
          <el-button size="small" round type="primary" @click="exitFullscreen">退出全屏</el-button>
        </div>
        <div v-if="isFullscreen && contextBanner" class="kg-fs-context">{{ contextBanner }}</div>

        <div v-show="!isFullscreen || fsToolbarVisible" class="kg-canvas-toolbar">
          <div class="kg-canvas-toolbar__left">
            <el-button
              v-if="showReconcile"
              type="primary"
              plain
              size="small"
              :loading="reconciling"
              @click="emitReconcile"
            >
              校验并同步图谱
            </el-button>
            <el-button
              v-if="showBuild"
              type="primary"
              size="small"
              :loading="building"
              :disabled="building"
              @click="onBuild"
            >
              构建/更新图谱
            </el-button>
            <el-button size="small" :loading="refreshing" @click="load()">刷新</el-button>
            <el-button size="small" @click="layoutMode = 'force'; onLayoutChange()">智能布局</el-button>
            <el-select v-model="layoutMode" size="small" style="width: 120px" @change="onLayoutChange">
              <el-option v-for="opt in layoutOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
            </el-select>
            <el-button size="small" :type="layoutLocked ? 'primary' : 'default'" @click="toggleLock">
              {{ layoutLocked ? '已锁定' : '锁定布局' }}
            </el-button>
          </div>
          <div class="kg-canvas-toolbar__right">
            <el-button-group size="small">
              <el-button @click="onZoomIn">放大</el-button>
              <el-button @click="onZoomOut">缩小</el-button>
              <el-button @click="onFit">适配画布</el-button>
              <el-button @click="onReset">重置视图</el-button>
            </el-button-group>
            <el-button size="small" @click="onExpandLayer">展开一层</el-button>
            <el-button size="small" @click="onCollapse">收起外围</el-button>
            <el-button v-if="isFullscreen" size="small" @click="fsToolbarVisible = false">收起工具栏</el-button>
            <el-button size="small" @click="toggleFullscreen">{{ isFullscreen ? '退出全屏' : '全屏查看' }}</el-button>
          </div>
        </div>

        <el-alert
          v-if="layoutCrowdedHint && (!isFullscreen || fsToolbarVisible)"
          :title="layoutCrowdedHint"
          type="warning"
          show-icon
          :closable="false"
          class="kg-status"
        />

        <div
          v-if="statusMessage && !initialLoading && !empty && !isFullscreen"
          class="kg-status-bar"
          :class="`kg-status-bar--${statusType}`"
        >
          {{ statusMessage }}
        </div>

        <div v-if="isFullscreen && statusMessage && !initialLoading && !empty && fsToolbarVisible" class="kg-fs-hint">
          {{ statusMessage }}
        </div>

        <div
          class="kg-canvas-inner"
          v-loading="refreshing"
          element-loading-text="更新图谱…"
          element-loading-background="rgba(255, 255, 255, 0.45)"
        >
          <div v-if="initialLoading && !rawGraph" class="kg-loading">加载图谱数据…</div>
          <el-empty v-else-if="!rawGraph && empty" :description="emptyText" />
          <div v-show="rawGraph && !empty" ref="chartRef" class="kg-chart" />
        </div>

        <!-- 图例：全屏纯净模式下隐藏，展开工具栏后显示 -->
        <div v-if="rawGraph && !empty && (!isFullscreen || fsToolbarVisible)" class="kg-legend">
          <button
            v-for="item in legendItems"
            :key="item.key"
            type="button"
            class="kg-legend-item"
            :class="{ 'kg-legend-item--active': activeLegend === item.key, 'kg-legend-item--muted': (activeLegend && activeLegend !== item.key) || item.absent }"
            @click="toggleLegend(item.key)"
          >
            <span class="kg-legend-dot" :style="{ background: item.color }" />
            {{ item.label }}
          </button>
        </div>
      </main>

      <!-- 右侧详情：收起时不占位（避免挤在图谱下方） -->
      <aside
        v-if="!detailCollapsed"
        class="kg-detail"
        :class="{ 'kg-detail--fs': isFullscreen }"
      >
        <div class="kg-detail__head">
          <span>节点详情</span>
          <el-button link size="small" @click="detailCollapsed = true">收起</el-button>
        </div>
        <div class="kg-detail__body">
          <template v-if="selectedDetail">
            <h4 class="kg-detail-title">{{ selectedDetail.name }}</h4>
            <el-tag size="small" type="info">{{ selectedDetail.type }}</el-tag>
            <dl class="kg-detail-metrics">
              <template v-for="m in selectedDetail.metrics" :key="m.label">
                <dt>{{ m.label }}</dt>
                <dd>{{ m.value }}</dd>
              </template>
            </dl>
            <p v-if="selectedDetail.suggestion" class="kg-detail-suggestion">
              {{ selectedDetail.suggestion }}
            </p>
            <div class="kg-detail-actions">
              <el-button size="small" @click="onExpandLayer">定位关联节点</el-button>
              <el-button size="small" @click="onExpandLayer">展开一层关系</el-button>
              <el-button size="small" @click="onFocusPath">仅查看相关路径</el-button>
              <el-button size="small" @click="onReset">重置视图</el-button>
            </div>
            <div v-if="selectedDetail.neighbors?.length" class="kg-neighbors">
              <h5>关联节点</h5>
              <ul>
                <li
                  v-for="nb in selectedDetail.neighbors"
                  :key="nb.id"
                  @click="selectNodeById(nb.id)"
                >
                  {{ nb.name }}
                  <span class="muted">{{ nb.relation }}</span>
                </li>
              </ul>
            </div>
          </template>
          <el-empty v-else description="点击图谱节点查看详情" :image-size="64" />

          <!-- 教学/学习建议 -->
          <div v-if="role === 'teacher' && teachingAdvice" class="kg-advice-card">
            <h5>教学建议</h5>
            <p v-if="teachingAdvice.reviewKps?.length">
              <strong>建议复讲：</strong>{{ teachingAdvice.reviewKps.join('、') }}
            </p>
            <p v-if="teachingAdvice.extraPractice?.length">
              <strong>补充练习：</strong>{{ teachingAdvice.extraPractice.join('、') }}
            </p>
            <p v-if="teachingAdvice.mistakeSummary?.length">
              <strong>高频错误：</strong>{{ teachingAdvice.mistakeSummary.join('、') }}
            </p>
            <p class="muted">{{ teachingAdvice.tierHint }}</p>
          </div>
          <div v-if="role === 'student' && learningAdvice" class="kg-advice-card">
            <h5>学习建议</h5>
            <p v-if="learningAdvice.priorityReview?.length">
              <strong>优先复习：</strong>{{ learningAdvice.priorityReview.join('、') }}
            </p>
            <p v-if="learningAdvice.recommendedPractice?.length">
              <strong>推荐练习：</strong>{{ learningAdvice.recommendedPractice.join('、') }}
            </p>
            <p v-if="learningAdvice.recentWeak?.length">
              <strong>最近薄弱点：</strong>{{ learningAdvice.recentWeak.join('、') }}
            </p>
            <p v-if="learningAdvice.mastered?.length">
              <strong>已掌握：</strong>{{ learningAdvice.mastered.join('、') }}
            </p>
          </div>

          <slot name="detail-extra" />
        </div>
      </aside>
      </div>
      </Teleport>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, onActivated, onDeactivated, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import {
  buildKgGraphOption,
  resizeGraph,
  hideGraphTip,
  fitGraphView,
  zoomGraph,
} from '../../utils/echartsGraph'
import { ensureChartInstance, disposeChartInstance, createChartRenderScheduler } from '../../utils/echartsInstance'
import {
  applyRoleDefaultView,
  filterGraph,
  searchNodes,
  computeRoleStats,
  getNodeDetail,
  highlightSelection,
  highlightLegend,
  cloneGraph,
  dedupeNodesForSearch,
} from '../../utils/kgGraphUtils'
import { legendItemsForRole, visibleNodeTypesForRole } from '../../utils/kgTheme'
import { LAYOUT_OPTIONS, relationOptionsFromGraph, nodeTypeLabel } from '../../utils/kgRelationLabels'
import { postKgBuild, getKgBuildJob } from '../../api/kg'
import { subscribeRt } from '../../socket/rtBus'

const props = defineProps({
  role: { type: String, default: 'admin' },
  graphMode: { type: String, default: 'course' },
  loadGraph: { type: Function, required: true },
  buildPayload: { type: Object, default: null },
  showBuild: { type: Boolean, default: true },
  showReconcile: { type: Boolean, default: false },
  reconciling: { type: Boolean, default: false },
  selfStudentId: { type: String, default: '' },
  contextBanner: { type: String, default: '' },
  enabled: { type: Boolean, default: true },
})

const emit = defineEmits(['reconcile'])

const chartRef = ref(null)
const initialLoading = ref(false)
const refreshing = ref(false)
const building = ref(false)
const empty = ref(false)
const buildFailed = ref(false)
const rawGraph = ref(null)
const apiStats = ref(null)
const expandedNodeIds = ref(new Set())

const layoutMode = ref('force')
const isFullscreen = ref(false)
const fsToolbarVisible = ref(false)
const fsSidebarOpen = ref(false)
const contextFocusId = ref('')
const layoutLocked = ref(false)
const zoomLevel = ref(1)
const selectedNodeId = ref(null)
const selectedDetail = ref(null)

const sidebarCollapsed = ref(false)
const detailCollapsed = ref(true)

const filterNodeTypes = ref([])
const filterRelationTypes = ref([])
const filterWeakOnly = ref(false)
const filterIsolatedOnly = ref(false)
const filterErrorOnly = ref(false)
const filterUnlinkedKpOnly = ref(false)
const filterRecentOnly = ref(false)
const focusPathOnly = ref(false)
const searchQuery = ref('')
const activeLegend = ref(null)
const teacherView = ref('default')

let chart = null
let pollTimer = null
let unsub = null
let reflowTimer = null
let autoFitPending = true
let prevSidebarCollapsed = false
let prevDetailCollapsed = false

const BODY_FS_CLASS = 'kg-graph-fullscreen'

function syncBodyFullscreen(on) {
  document.body.classList.toggle(BODY_FS_CLASS, on)
  document.documentElement.style.overflow = on ? 'hidden' : ''
}

function reflowChart(delay = 120) {
  if (reflowTimer) clearTimeout(reflowTimer)
  reflowTimer = window.setTimeout(() => {
    reflowTimer = null
    if (!chart || chart.isDisposed() || !chartRef.value) return
    resizeGraph(chart)
    const { clientWidth, clientHeight } = chartRef.value
    if (clientWidth < 2 || clientHeight < 2) return
    const z = fitGraphView(chart)
    if (z != null) zoomLevel.value = z
  }, delay)
}

function scheduleFullscreenReflow() {
  ;[0, 120, 320, 640].forEach((d) => reflowChart(d))
}

const legendItems = computed(() => {
  const types = new Set((rawGraph.value?.nodes || []).map((n) => n.value || n.type).filter(Boolean))
  return legendItemsForRole(props.role).map((item) => ({
    ...item,
    absent: !item.types.some((t) => types.has(t)),
  }))
})

function nodeSelectOptions(...types) {
  return dedupeNodesForSearch(rawGraph.value?.nodes || [])
    .filter((n) => types.includes(n.value || n.type))
    .filter((n) => {
      const label = String(n.displayName || n.name || '').trim()
      return label && !/#NaN/i.test(label)
    })
    .map((n) => {
      const name = n.displayName || n.name
      const sid = n.source_id || (String(n.id).match(/^task_(\d+)$/) || [])[1]
      return {
        value: n.id,
        label: (n.value || n.type) === 'task' && sid ? `${name} (#${sid})` : name,
      }
    })
    .sort((a, b) => String(a.label).localeCompare(String(b.label), 'zh-CN'))
}

const adminClassOptions = computed(() => nodeSelectOptions('administrative_class'))
const adminTeachingClassOptions = computed(() => nodeSelectOptions('teaching_class'))
const adminTeacherOptions = computed(() => nodeSelectOptions('teacher'))
const adminTaskOptions = computed(() => nodeSelectOptions('task'))
const adminCourseOptions = computed(() => nodeSelectOptions('course', 'chapter'))
const teacherStudentOptions = computed(() => nodeSelectOptions('student'))

const layoutOptions = LAYOUT_OPTIONS

const relationOptions = computed(() => relationOptionsFromGraph(rawGraph.value || { links: [] }))

const layoutCrowdedHint = computed(() => {
  const n = rawGraph.value?.nodes?.length || 0
  if (n <= 100) return ''
  if (layoutMode.value === 'layer' || layoutMode.value === 'circular') {
    return '当前节点较多，环形/层级布局可能较拥挤，建议使用智能布局或收起外围节点。'
  }
  return ''
})

const nodeTypeOptions = computed(() => {
  const types = new Set((rawGraph.value?.nodes || []).map((n) => n.value || n.type).filter(Boolean))
  const allowed = new Set(visibleNodeTypesForRole(props.role))
  return [...types]
    .filter((t) => allowed.has(t))
    .map((t) => ({
      value: t,
      label: nodeTypeLabel(t),
    }))
})

const roleKey = computed(() => {
  if (props.role === 'student') return 'student'
  if (props.role === 'teacher') return 'teacher'
  return 'admin'
})

const processedGraph = computed(() => {
  if (!rawGraph.value) return null
  let g = cloneGraph(rawGraph.value)
  const { graph } = applyRoleDefaultView(g, roleKey.value, {
    forceIncludeIds: expandedNodeIds.value,
    centerId: props.selfStudentId || undefined,
  })
  g = graph

  const filters = {
    nodeTypes: filterNodeTypes.value.length ? filterNodeTypes.value : undefined,
    relationTypes: filterRelationTypes.value.length ? filterRelationTypes.value : undefined,
    weakOnly: filterWeakOnly.value,
    errorOnly: filterErrorOnly.value,
    isolatedOnly: filterIsolatedOnly.value,
    unlinkedKpOnly: filterUnlinkedKpOnly.value,
    recentTasksOnly: filterRecentOnly.value,
    search: searchQuery.value,
    hideStudents: props.role === 'student',
    selfStudentId: props.selfStudentId,
    focusPathId:
      focusPathOnly.value && selectedNodeId.value
        ? selectedNodeId.value
        : contextFocusId.value || null,
  }

  if (props.role === 'teacher' && teacherView.value !== 'default') {
    const map = {
      knowledge: ['knowledge_point'],
      task: ['task'],
      weak: ['weakness', 'error'],
      student: ['student'],
    }
    filters.nodeTypes = map[teacherView.value]
  }

  g = filterGraph(g, filters)

  if (activeLegend.value) {
    g = highlightLegend(g, activeLegend.value)
  }

  if (selectedNodeId.value) {
    g = highlightSelection(g, selectedNodeId.value)
  }

  return g
})

const statCards = computed(() => computeRoleStats(rawGraph.value, apiStats.value, roleKey.value).cards || [])
const qualityAlerts = computed(() => computeRoleStats(rawGraph.value, apiStats.value, roleKey.value).qualityAlerts || [])
const teachingAdvice = computed(() => computeRoleStats(rawGraph.value, apiStats.value, 'teacher').teachingAdvice)
const learningAdvice = computed(() => computeRoleStats(rawGraph.value, apiStats.value, 'student').learningAdvice)

const searchResults = computed(() =>
  searchNodes(rawGraph.value || { nodes: [] }, searchQuery.value, roleKey.value, props.selfStudentId)
)

const statusMessage = computed(() => {
  if (building.value) return '图谱正在构建，请稍候……'
  if (buildFailed.value) return '图谱构建失败，请检查知识图谱配置或稍后重试。'
  if (empty.value) {
    return '暂无可展示的知识图谱数据。完成任务提交与批改后，系统将自动生成知识点关联图谱。'
  }
  if (apiStats.value?.nodeCount != null) {
    return `图谱已构建完成：共 ${apiStats.value.nodeCount} 个节点、${apiStats.value.edgeCount ?? 0} 条关系。可拖拽、缩放并点击节点查看详情。`
  }
  return ''
})

const statusType = computed(() => {
  if (building.value) return 'info'
  if (buildFailed.value) return 'error'
  if (empty.value) return 'warning'
  return 'success'
})

const emptyText = computed(() =>
  buildFailed.value
    ? '图谱构建失败'
    : '暂无图谱数据，请先点击「构建/更新图谱」或完成任务提交与批改'
)

const displayOpts = computed(() => ({
  layoutMode: layoutMode.value,
  zoomLevel: zoomLevel.value,
  selectedId: selectedNodeId.value,
  layoutLocked: layoutLocked.value,
}))

function scheduleRenderChart() {
  scheduleRenderChartImpl()
}

const scheduleRenderChartImpl = createChartRenderScheduler(() => {
  void renderChart()
})

async function renderChart() {
  const graph = processedGraph.value
  const hasNodes = graph?.nodes?.length > 0
  empty.value = !hasNodes
  if (!hasNodes) {
    chart = disposeChartInstance(chart)
    autoFitPending = true
    return
  }
  await nextTick()
  if (!chartRef.value) return

  chart = ensureChartInstance(chartRef.value, chart)
  if (!chart) return

  hideGraphTip(chart)
  chart.setOption(buildKgGraphOption(graph, props.graphMode, displayOpts.value), {
    notMerge: false,
    replaceMerge: ['series'],
    lazyUpdate: true,
  })
  resizeGraph(chart)

  if (!chart.__kgBound) {
    chart.on('click', (params) => {
      if (params.dataType === 'node' && params.data?.id) {
        onNodeClick(params.data)
      }
    })
    chart.on('graphRoam', () => {
      const seriesZoom = chart.getOption()?.series?.[0]?.zoom
      if (typeof seriesZoom === 'number') zoomLevel.value = seriesZoom
    })
    chart.__kgBound = true
  }

  if (autoFitPending) {
    autoFitPending = false
    window.setTimeout(() => {
      if (!chart || chart.isDisposed()) return
      resizeGraph(chart)
      const z = fitGraphView(chart)
      if (z != null) zoomLevel.value = z
    }, 400)
  }
}

function refreshChart() {
  scheduleRenderChart()
}

async function load({ background = false } = {}) {
  if (!props.enabled) return
  const hasGraph = !!rawGraph.value
  if (hasGraph || background) {
    refreshing.value = true
  } else {
    initialLoading.value = true
  }
  buildFailed.value = false
  try {
    const res = await props.loadGraph()
    if (res.success) {
      rawGraph.value = res.data?.graph || res.data
      apiStats.value = res.data?.stats || null
      if (!background) {
        expandedNodeIds.value = new Set()
        selectedNodeId.value = null
        selectedDetail.value = null
        contextFocusId.value = ''
      }
    } else {
      ElMessage.error(res.message || '加载图谱失败')
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || e.message || '加载图谱失败')
  } finally {
    initialLoading.value = false
    refreshing.value = false
  }
  scheduleRenderChart()
}

function pollJob(jobId) {
  clearInterval(pollTimer)
  pollTimer = setInterval(async () => {
    try {
      const res = await getKgBuildJob(jobId)
      if (!res.success) return
      const j = res.data
      if (j.status === 'done') {
        clearInterval(pollTimer)
        building.value = false
        buildFailed.value = false
        await load()
      } else if (j.status === 'failed') {
        clearInterval(pollTimer)
        building.value = false
        buildFailed.value = true
        ElMessage.error(j.error_message || '构建失败')
      }
    } catch {
      /* ignore */
    }
  }, 2000)
}

async function onBuild() {
  if (!props.buildPayload) {
    ElMessage.warning('缺少构建参数')
    return
  }
  building.value = true
  buildFailed.value = false
  try {
    const res = await postKgBuild(props.buildPayload)
    if (res.success && res.data?.jobId) {
      pollJob(res.data.jobId)
    } else {
      building.value = false
      ElMessage.error(res.message || '创建任务失败')
    }
  } catch (e) {
    building.value = false
    buildFailed.value = true
    ElMessage.error(e?.response?.data?.message || e.message || '创建任务失败')
  }
}

function onNodeClick(node) {
  if (node.isAggregate && node.hiddenIds?.length) {
    expandedNodeIds.value = new Set([...expandedNodeIds.value, ...node.hiddenIds])
    scheduleRenderChart()
    return
  }
  selectNodeById(node.id)
}

function selectNodeById(id) {
  selectedNodeId.value = id
  contextFocusId.value = id
  const node = (rawGraph.value?.nodes || []).find((n) => n.id === id)
  selectedDetail.value = getNodeDetail(node, rawGraph.value, roleKey.value)
  if (selectedDetail.value) {
    detailCollapsed.value = false
  }
  scheduleRenderChart()
}

function onSearchSelect(item) {
  if (!item) return
  selectNodeById(item.id)
}

function toggleLegend(key) {
  activeLegend.value = activeLegend.value === key ? null : key
  scheduleRenderChart()
}

function onLayoutChange() {
  refreshChart()
}

function onContextFocusChange(id) {
  if (id) selectNodeById(id)
  else {
    selectedNodeId.value = null
    selectedDetail.value = null
    scheduleRenderChart()
  }
}

function toggleFullscreen() {
  const entering = !isFullscreen.value
  if (entering) {
    prevSidebarCollapsed = sidebarCollapsed.value
    prevDetailCollapsed = detailCollapsed.value
    detailCollapsed.value = true
    fsToolbarVisible.value = false
    fsSidebarOpen.value = false
  } else {
    sidebarCollapsed.value = prevSidebarCollapsed
    detailCollapsed.value = prevDetailCollapsed
    fsToolbarVisible.value = false
  }
  isFullscreen.value = entering
  syncBodyFullscreen(entering)
  hideGraphTip(chart)
  nextTick(() => {
    if (entering) scheduleFullscreenReflow()
    else reflowChart(200)
  })
}

function exitFullscreen() {
  if (!isFullscreen.value) return
  isFullscreen.value = false
  fsToolbarVisible.value = false
  fsSidebarOpen.value = false
  syncBodyFullscreen(false)
  sidebarCollapsed.value = prevSidebarCollapsed
  detailCollapsed.value = prevDetailCollapsed
  hideGraphTip(chart)
  nextTick(() => reflowChart(200))
}

watch(isFullscreen, (fs) => {
  if (fs) nextTick(() => scheduleFullscreenReflow())
})

watch(fsToolbarVisible, () => {
  if (isFullscreen.value) reflowChart(80)
})

function onEscKey(e) {
  if (e.key === 'Escape' && isFullscreen.value) {
    if (fsToolbarVisible.value) {
      fsToolbarVisible.value = false
      return
    }
    exitFullscreen()
  }
}

function toggleLock() {
  layoutLocked.value = !layoutLocked.value
  refreshChart()
}

function onZoomIn() {
  if (!chart) return
  const z = zoomGraph(chart, 1.25)
  if (z != null) zoomLevel.value = z
}

function onZoomOut() {
  if (!chart) return
  const z = zoomGraph(chart, 0.8)
  if (z != null) zoomLevel.value = z
}

function onFit() {
  if (!chart) return
  const z = fitGraphView(chart)
  if (z != null) zoomLevel.value = z
}

function onReset() {
  expandedNodeIds.value = new Set()
  selectedNodeId.value = null
  autoFitPending = true
  selectedDetail.value = null
  activeLegend.value = null
  focusPathOnly.value = false
  contextFocusId.value = ''
  filterWeakOnly.value = false
  filterErrorOnly.value = false
  filterIsolatedOnly.value = false
  filterUnlinkedKpOnly.value = false
  filterRecentOnly.value = false
  searchQuery.value = ''
  layoutMode.value = 'force'
  zoomLevel.value = 1
  scheduleRenderChart()
  window.requestAnimationFrame(() => {
    const z = fitGraphView(chart)
    if (z != null) zoomLevel.value = z
  })
}

function emitReconcile() {
  emit('reconcile')
}

function onFocusPath() {
  if (!selectedNodeId.value) {
    ElMessage.info('请先选中一个节点')
    return
  }
  focusPathOnly.value = !focusPathOnly.value
  scheduleRenderChart()
}

function onExpandLayer() {
  if (!selectedNodeId.value) {
    ElMessage.info('请先选中一个节点')
    return
  }
  const related = new Set([selectedNodeId.value])
  for (const e of rawGraph.value?.links || []) {
    if (e.source === selectedNodeId.value) related.add(e.target)
    if (e.target === selectedNodeId.value) related.add(e.source)
  }
  expandedNodeIds.value = new Set([...expandedNodeIds.value, ...related])
  focusPathOnly.value = false
  scheduleRenderChart()
}

function onCollapse() {
  expandedNodeIds.value = new Set()
  onReset()
}

function onRt(payload) {
  if (!payload || payload.domain !== 'kg') return
  if (payload.action === 'kg_build_done') {
    building.value = false
    void load()
  }
}

function onResize() {
  reflowChart(0)
}

watch(processedGraph, () => {
  if (rawGraph.value) scheduleRenderChart()
})

watch(
  () => [props.loadGraph, props.graphMode, props.enabled],
  () => {
    if (props.enabled) void load({ background: !!rawGraph.value })
  }
)

onMounted(() => {
  if (props.enabled) void load()
  unsub = subscribeRt(onRt)
  window.addEventListener('resize', onResize, { passive: true })
  window.addEventListener('keydown', onEscKey)
})

onActivated(() => {
  if (chart && !chart.isDisposed()) {
    reflowChart(0)
  } else if (rawGraph.value?.nodes?.length) {
    scheduleRenderChart()
  }
})

onDeactivated(() => {
  hideGraphTip(chart)
})

onBeforeUnmount(() => {
  clearInterval(pollTimer)
  if (reflowTimer) clearTimeout(reflowTimer)
  if (unsub) unsub()
  syncBodyFullscreen(false)
  window.removeEventListener('resize', onResize)
  window.removeEventListener('keydown', onEscKey)
  chart = disposeChartInstance(chart)
})

defineExpose({ load, refreshChart })
</script>

<style scoped>
.kg-workbench {
  --kg-bg: #eef2f7;
  --kg-card: #fff;
  --kg-border: #e2e8f0;
  background: var(--kg-bg);
  border-radius: 12px;
  padding: 16px;
}
.kg-center {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 12px;
  min-width: 0;
  min-height: 520px;
}
.kg-center--single {
  grid-template-columns: minmax(0, 1fr);
}
.kg-center--fs {
  display: grid;
  position: fixed;
  inset: 0;
  z-index: 9999;
  width: 100vw;
  height: 100vh;
  max-width: 100vw;
  max-height: 100vh;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 0;
  padding: 0;
  background: #f3f6fa;
  box-sizing: border-box;
  min-height: 0;
}
.kg-center--fs-no-detail {
  grid-template-columns: 1fr;
}
.kg-center--fs .kg-canvas-wrap {
  border-radius: 0;
  border: none;
  min-height: 0;
  height: 100%;
}
.kg-center--fs .kg-canvas-wrap--graph-only .kg-chart {
  border-radius: 0;
}
.kg-fs-float {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 12;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 6px 8px;
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid var(--kg-border);
  border-radius: 999px;
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.1);
  backdrop-filter: blur(8px);
}
.kg-fs-context {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 11;
  max-width: min(420px, calc(100% - 280px));
  padding: 6px 12px;
  font-size: 12px;
  color: #475569;
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid var(--kg-border);
  border-radius: 999px;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
}
.kg-sidebar--fs-overlay {
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  width: 260px;
  z-index: 10001;
  box-shadow: 4px 0 24px rgba(15, 23, 42, 0.12);
}
.kg-sidebar--fs-overlay .kg-sidebar__body {
  max-height: calc(100vh - 44px);
}
.kg-canvas-wrap--graph-only {
  background: #fff;
}
.kg-center--fs .kg-canvas-wrap--fs {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1 1 auto;
}
.kg-center--fs .kg-canvas-inner {
  flex: 1 1 auto;
  min-height: 0;
}
.kg-center--fs .kg-chart {
  flex: 1 1 auto;
  min-height: 0 !important;
  height: auto !important;
  max-height: none !important;
}
.kg-center--fs .kg-detail--fs {
  border-radius: 0;
  border: none;
  border-left: 1px solid var(--kg-border);
  max-height: 100vh;
}
.kg-center--fs .kg-detail__body {
  max-height: calc(100vh - 44px);
}
.kg-fs-hint {
  flex-shrink: 0;
  padding: 4px 12px;
  font-size: 12px;
  color: #047857;
  background: #ecfdf5;
  border-bottom: 1px solid #a7f3d0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.kg-body--fullscreen {
  display: block;
  min-height: 0;
}
.kg-stats {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}
.kg-stat-card {
  background: var(--kg-card);
  border: 1px solid var(--kg-border);
  border-radius: 12px;
  padding: 12px 14px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
}
.kg-stat-card__icon {
  font-size: 18px;
  line-height: 1;
  opacity: 0.85;
  margin-top: 2px;
}
.kg-stat-card__body {
  min-width: 0;
}
.kg-stat-card--warn .kg-stat-card__value {
  color: #dc6b6b;
}
.kg-stat-card__label {
  display: block;
  font-size: 12px;
  color: #64748b;
  margin-bottom: 4px;
}
.kg-stat-card__value {
  font-size: 22px;
  font-weight: 700;
  color: #1e293b;
}
.kg-alerts {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}
.kg-alert-item {
  border-radius: 10px;
}
.kg-body {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 12px;
  min-height: 520px;
  align-items: stretch;
}
@media (max-width: 1200px) {
  .kg-body {
    grid-template-columns: 220px minmax(0, 1fr);
  }
}
.kg-detail {
  min-width: 0;
  max-height: 100%;
}
.kg-sidebar,
.kg-detail {
  background: var(--kg-card);
  border: 1px solid var(--kg-border);
  border-radius: 12px;
  overflow: hidden;
}
.kg-sidebar--collapsed .kg-sidebar__body {
  display: none;
}
.kg-sidebar__head,
.kg-detail__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  font-weight: 600;
  font-size: 13px;
  border-bottom: 1px solid var(--kg-border);
  color: #334155;
}
.kg-sidebar__body,
.kg-detail__body {
  padding: 12px;
  max-height: calc(72vh - 80px);
  overflow-y: auto;
}
.kg-filter-group {
  margin-bottom: 14px;
}
.kg-filter-label {
  display: block;
  font-size: 12px;
  color: #64748b;
  margin-bottom: 6px;
}
.kg-filter-switches {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.kg-search-list {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  max-height: 160px;
  overflow-y: auto;
}
.kg-search-item {
  padding: 6px 8px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 12px;
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.kg-search-item:hover {
  background: #f1f5f9;
}
.kg-search-type {
  color: #94a3b8;
  font-size: 11px;
}
.kg-canvas-wrap {
  background: var(--kg-card);
  border: 1px solid var(--kg-border);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  position: relative;
  min-height: 520px;
  height: 100%;
  min-width: 0;
}
.kg-canvas-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--kg-border);
}
.kg-canvas-toolbar__left,
.kg-canvas-toolbar__right {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.kg-status {
  margin: 8px 12px 0;
  border-radius: 10px;
}
.kg-status-bar {
  margin: 8px 12px 0;
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.5;
}
.kg-status-bar--success {
  background: #ecfdf5;
  color: #047857;
  border: 1px solid #a7f3d0;
}
.kg-status-bar--info {
  background: #eff6ff;
  color: #1d4ed8;
  border: 1px solid #bfdbfe;
}
.kg-status-bar--warning {
  background: #fffbeb;
  color: #b45309;
  border: 1px solid #fde68a;
}
.kg-status-bar--error {
  background: #fef2f2;
  color: #b91c1c;
  border: 1px solid #fecaca;
}
.kg-canvas-inner {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 360px;
  position: relative;
}
.kg-loading {
  padding: 48px;
  text-align: center;
  color: #64748b;
}
.kg-chart {
  flex: 1 1 auto;
  width: 100%;
  min-height: 360px;
  height: auto;
  touch-action: none;
  overscroll-behavior: contain;
}
.kg-legend {
  position: absolute;
  left: 12px;
  bottom: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-width: calc(100% - 24px);
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid var(--kg-border);
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
}
.kg-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 8px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  font-size: 11px;
  color: #475569;
  cursor: pointer;
}
.kg-legend-item--active {
  border-color: #4f7fd4;
  background: #eff6ff;
}
.kg-legend-item--muted {
  opacity: 0.45;
}
.kg-legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
.kg-detail-title {
  margin: 0 0 8px;
  font-size: 16px;
  font-weight: 600;
  color: #1e293b;
  word-break: break-all;
}
.kg-detail-metrics {
  margin: 12px 0;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 6px 12px;
  font-size: 13px;
}
.kg-detail-metrics dt {
  color: #64748b;
  margin: 0;
}
.kg-detail-metrics dd {
  margin: 0;
  font-weight: 600;
  color: #334155;
}
.kg-detail-suggestion {
  font-size: 13px;
  color: #0f766e;
  background: #f0fdfa;
  padding: 8px 10px;
  border-radius: 8px;
}
.kg-detail-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 12px 0;
}
.kg-neighbors h5 {
  margin: 0 0 4px;
  font-size: 13px;
  color: #334155;
}
.kg-neighbors ul {
  list-style: none;
  padding: 0;
  margin: 8px 0 0;
}
.kg-neighbors li {
  padding: 6px 0;
  font-size: 12px;
  cursor: pointer;
  border-bottom: 1px solid #f1f5f9;
}
.kg-neighbors li:hover {
  color: #4f7fd4;
}
.kg-advice-card {
  margin-top: 16px;
  padding: 12px;
  background: #f8fafc;
  border-radius: 10px;
  border: 1px solid var(--kg-border);
  font-size: 12px;
  line-height: 1.6;
}
.kg-advice-card h5 {
  margin: 0 0 8px;
  font-size: 13px;
  color: #334155;
}
.muted {
  color: #94a3b8;
  font-size: 11px;
}
</style>

<style>
/* 图谱画布全屏：隐藏系统侧栏、顶栏与页面标题，让画布占满视口 */
body.kg-graph-fullscreen {
  overflow: hidden !important;
}
body.kg-graph-fullscreen .app-sidebar,
body.kg-graph-fullscreen .app-topbar {
  display: none !important;
}
body.kg-graph-fullscreen .app-main-scroll {
  padding: 0 !important;
  overflow: hidden !important;
}
body.kg-graph-fullscreen .kg-page-header {
  display: none !important;
}
body.kg-graph-fullscreen .kg-toolbar {
  display: none !important;
}
body.kg-graph-fullscreen .kg-alert {
  display: none !important;
}
body.kg-graph-fullscreen .kg-page {
  padding: 0 !important;
  min-height: 0 !important;
}
body.kg-graph-fullscreen .kg-workbench {
  padding: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
}
</style>
