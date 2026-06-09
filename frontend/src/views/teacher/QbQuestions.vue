<template>
  <div class="tw-page teacher-qb-page">
    <header class="tw-head">
      <div class="tw-head__left">
        <div>
          <h1 class="tw-title">题库管理</h1>
          <p class="tw-subtitle">
            建设课程题库，支持单题录入、Excel 批量导入、题型筛选与组卷调用。
          </p>
          <p class="tw-sub">教师在此维护自己的题库，用于习题练习、在线考试和组卷配置。</p>
        </div>
      </div>
    </header>

    <el-skeleton v-if="initialLoading" animated :rows="12" />

    <template v-else>
      <section class="tw-metric-grid">
        <div v-for="card in overviewCards" :key="card.key" class="tw-metric-card">
          <div class="tw-metric-card__icon" :class="`tw-metric-card__icon--${card.tone}`">
            <el-icon><component :is="card.icon" /></el-icon>
          </div>
          <div class="tw-metric-card__body">
            <span class="tw-metric-card__label">{{ card.label }}</span>
            <span class="tw-metric-card__value">{{ card.value }}</span>
          </div>
        </div>
      </section>

      <section class="tw-panel tw-filter-bar">
        <div class="filter-toolbar">
          <div class="filter-toolbar__filters">
            <el-input
              v-model="keyword"
              placeholder="搜索题干 / 课程"
              clearable
              class="filter-toolbar__search"
              @keyup.enter="applySearch"
            >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
            </el-input>
            <el-select v-model="filterType" clearable placeholder="题型" class="filter-toolbar__select">
              <el-option v-for="t in typeOpts" :key="t.v" :label="t.l" :value="t.v" />
            </el-select>
            <el-select v-model="filterDifficulty" clearable placeholder="难度" class="filter-toolbar__select">
              <el-option label="易" value="easy" />
              <el-option label="中" value="medium" />
              <el-option label="难" value="hard" />
            </el-select>
            <el-select v-model="filterCourse" clearable filterable placeholder="课程标签" class="filter-toolbar__select">
              <el-option v-for="c in courseOptions" :key="c" :label="c" :value="c" />
            </el-select>
            <el-button type="primary" plain @click="applySearch">查询</el-button>
            <el-button v-if="hasActiveFilters" plain @click="resetFilters">重置</el-button>
          </div>
          <div class="filter-toolbar__actions">
            <el-button type="primary" @click="openCreate">
              <el-icon><Plus /></el-icon>
              新增题目
            </el-button>
            <el-button plain @click="downloadTpl">下载 Excel 模板</el-button>
            <el-upload :show-file-list="false" accept=".xlsx" :before-upload="handleImport">
              <el-button plain :loading="importing">批量导入</el-button>
            </el-upload>
          </div>
        </div>
      </section>

      <section class="tw-panel">
        <div class="tw-panel__header">
          <h2 class="tw-panel__title">我的题目</h2>
          <span class="tw-panel__meta">共 {{ displayTotal }} 题</span>
        </div>

        <div v-if="!loading && displayTotal === 0" class="tw-panel__body tw-empty-panel">
          <el-empty description="暂无题目，可新增或批量导入" :image-size="96">
            <el-button type="primary" @click="openCreate">新增题目</el-button>
          </el-empty>
        </div>

        <div v-else class="tw-panel__body tw-panel__body--flush">
          <el-skeleton v-if="loading" animated :rows="8" />
          <template v-else>
            <el-table :data="pagedRows" class="qb-table" style="width: 100%">
              <el-table-column label="题目信息" min-width="220" show-overflow-tooltip>
                <template #default="{ row }">
                  <div class="info-cell">
                    <span class="info-cell__title">{{ qbStemSummary(row.stem) }}</span>
                    <span class="info-cell__sub">#{{ row.id }} · {{ formatDateTime(row.created_at) }}</span>
                  </div>
                </template>
              </el-table-column>

              <el-table-column label="题型" width="100">
                <template #default="{ row }">
                  <el-tag size="small" effect="light" type="primary">{{ qbTypeLabel(row.type) }}</el-tag>
                </template>
              </el-table-column>

              <el-table-column label="分值 / 难度" width="120">
                <template #default="{ row }">
                  <div class="score-diff">
                    <span>{{ row.default_score ?? '—' }} 分</span>
                    <el-tag size="small" effect="light" :type="qbDifficultyTagType(row.difficulty)">
                      {{ qbDifficultyLabel(row.difficulty) }}
                    </el-tag>
                  </div>
                </template>
              </el-table-column>

              <el-table-column prop="course_label" label="课程标签" min-width="120" show-overflow-tooltip />

              <el-table-column label="答案完整性" width="120">
                <template #default="{ row }">
                  <el-tag size="small" effect="light" :type="qbAnswerCompletenessMeta(row).type">
                    {{ qbAnswerCompletenessMeta(row).text }}
                  </el-tag>
                </template>
              </el-table-column>

              <el-table-column label="引用次数" width="96" align="center">
                <template #default="{ row }">
                  {{ Number(row.usage_count) || 0 }}
                </template>
              </el-table-column>

              <el-table-column label="操作" min-width="300" align="right" fixed="right">
                <template #default="{ row }">
                  <div class="table-row-actions">
                    <el-button type="primary" size="small" plain :icon="Edit" @click="openEdit(row)">编辑</el-button>
                    <el-button size="small" plain :icon="View" @click="openPreview(row)">预览</el-button>
                    <el-button size="small" plain :icon="List" @click="openUsage(row)">使用记录</el-button>
                    <el-dropdown trigger="click" @command="(cmd) => handleMore(cmd, row)">
                      <el-button size="small">
                        更多
                        <el-icon class="el-icon--right"><ArrowDown /></el-icon>
                      </el-button>
                      <template #dropdown>
                        <el-dropdown-menu>
                          <el-dropdown-item command="copy">复制题目</el-dropdown-item>
                          <el-dropdown-item command="delete" divided>
                            <span class="danger-text">删除</span>
                          </el-dropdown-item>
                        </el-dropdown-menu>
                      </template>
                    </el-dropdown>
                  </div>
                </template>
              </el-table-column>
            </el-table>

            <div class="pager-wrap">
              <el-pagination
                v-model:current-page="page"
                :page-size="pageSize"
                :total="displayTotal"
                layout="total, prev, pager, next"
                background
                @current-change="onPageChange"
              />
            </div>
          </template>
        </div>
      </section>
    </template>

    <!-- 新增 / 编辑 -->
    <el-dialog
      v-model="dlg"
      :title="editId ? '编辑题目' : '新增题目'"
      width="760px"
      destroy-on-close
      class="qb-form-dialog"
      @closed="resetForm"
    >
      <el-form label-width="108px" class="qb-form">
        <div class="form-section">
          <h3 class="form-section__title">基本信息</h3>
          <el-form-item label="题型">
            <el-select v-model="form.type" style="width: 100%" @change="onTypeChange">
              <el-option v-for="t in typeOpts" :key="t.v" :label="t.l" :value="t.v" />
            </el-select>
          </el-form-item>
          <el-form-item label="课程标签">
            <el-input v-model="form.course_label" placeholder="如课程名或模块" />
          </el-form-item>
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="分值">
                <el-input-number v-model="form.default_score" :min="0.5" :max="100" :step="0.5" style="width: 100%" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="难度">
                <el-select v-model="form.difficulty" style="width: 100%">
                  <el-option label="易" value="easy" />
                  <el-option label="中" value="medium" />
                  <el-option label="难" value="hard" />
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>
          <el-form-item label="知识点">
            <el-input v-model="form.knowledgeText" placeholder="逗号分隔多个标签" />
          </el-form-item>
        </div>

        <div class="form-section">
          <h3 class="form-section__title">题目内容</h3>
          <el-form-item label="题干">
            <el-input v-model="form.stem" type="textarea" :rows="4" placeholder="请输入题目描述" />
          </el-form-item>

          <template v-if="form.type === 'single' || form.type === 'multi'">
            <el-form-item label="选项">
              <div class="opt-list">
                <div v-for="(row, idx) in ui.mcOptions" :key="idx" class="opt-row">
                  <el-input v-model="row.key" maxlength="4" class="opt-key" placeholder="键" />
                  <el-input v-model="row.label" class="opt-label" placeholder="选项文字" />
                  <el-button v-if="ui.mcOptions.length > 2" link type="danger" @click="removeMcOption(idx)">删除</el-button>
                </div>
                <el-button size="small" @click="addMcOption">添加选项</el-button>
              </div>
            </el-form-item>
            <el-form-item v-if="form.type === 'single'" label="正确答案">
              <el-radio-group v-model="ui.singleKey">
                <el-radio v-for="r in validMcKeys" :key="r" :value="r">{{ r }}</el-radio>
              </el-radio-group>
            </el-form-item>
            <el-form-item v-else label="正确答案">
              <el-checkbox-group v-model="ui.multiKeys">
                <el-checkbox v-for="r in validMcKeys" :key="r" :value="r">{{ r }}</el-checkbox>
              </el-checkbox-group>
              <p class="form-hint">须勾选与标准答案数量一致的选项（顺序不限）。</p>
            </el-form-item>
          </template>

          <template v-else-if="form.type === 'judge'">
            <el-form-item label="正确答案">
              <el-radio-group v-model="ui.judgeOk">
                <el-radio :value="true">对 / 正确</el-radio>
                <el-radio :value="false">错 / 错误</el-radio>
              </el-radio-group>
            </el-form-item>
          </template>

          <template v-else-if="form.type === 'fill'">
            <el-form-item label="标准答案">
              <el-input v-model="ui.fillPrimary" placeholder="主答案（必填）" />
            </el-form-item>
            <el-form-item label="其它可接受">
              <div class="opt-list">
                <div v-for="(a, idx) in ui.fillAlts" :key="idx" class="opt-row">
                  <el-input v-model="ui.fillAlts[idx]" placeholder="等价表述（选填）" />
                  <el-button link type="danger" @click="removeFillAlt(idx)">删除</el-button>
                </div>
                <el-button size="small" @click="ui.fillAlts.push('')">添加等价答案</el-button>
              </div>
            </el-form-item>
            <el-form-item label="匹配规则">
              <el-checkbox v-model="ui.fillIgnoreCase">忽略英文字母大小写</el-checkbox>
            </el-form-item>
          </template>
        </div>

        <div class="form-section">
          <h3 class="form-section__title">答案与解析</h3>
          <template v-if="form.type === 'short'">
            <el-form-item label="参考答案">
              <el-input v-model="form.reference_answer" type="textarea" :rows="6" placeholder="评分时可对照的要点、关键词或范文片段" />
            </el-form-item>
          </template>
          <template v-else-if="form.type === 'code'">
            <el-form-item label="参考代码">
              <el-input v-model="form.reference_answer" type="textarea" :rows="8" placeholder="思路说明、关键代码片段或评分要点" />
            </el-form-item>
          </template>
          <template v-else>
            <el-form-item label="解析说明">
              <el-input v-model="form.reference_answer" type="textarea" :rows="3" placeholder="可选：解析或评分要点说明" />
            </el-form-item>
          </template>
        </div>

        <div v-if="form.type === 'code'" class="form-section">
          <h3 class="form-section__title">编程题配置</h3>
          <el-form-item label="语言 / 说明">
            <el-input v-model="ui.codeHint" type="textarea" :rows="2" placeholder="输入输出格式、语言版本等说明" />
          </el-form-item>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="dlg = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <!-- 预览 -->
    <el-dialog v-model="previewDlg" title="题目预览" width="720px" destroy-on-close>
      <QbQuestionPreview v-if="previewQuestion" :question="previewQuestion" />
    </el-dialog>

    <!-- 使用记录 -->
    <el-dialog v-model="usageDlg" title="题目使用记录" width="560px" destroy-on-close>
      <el-table :data="usageRows" size="small" border>
        <el-table-column label="类型" width="100">
          <template #default="{ row }">{{ refTypeLabel(row.ref_type) }}</template>
        </el-table-column>
        <el-table-column prop="ref_title" label="标题" min-width="160" show-overflow-tooltip />
        <el-table-column label="时间" width="168">
          <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import {
  listQuestions,
  getQuestion,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  getQuestionUsage,
  downloadQuestionTemplate,
  importQuestions,
} from '../../api/qb'
import { qbDifficultyLabel, qbDifficultyTagType, qbTypeLabel } from '../../utils/qbLabels'
import {
  qbStemSummary,
  qbAnswerCompletenessMeta,
  isThisMonth,
} from '../../utils/qbQuestionQuality'
import { formatDateTime } from '../../utils/format'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Edit, List, View, Search, Plus, ArrowDown } from '@element-plus/icons-vue'
import QbQuestionPreview from '../../components/qb/QbQuestionPreview.vue'

const typeOpts = [
  { v: 'single', l: '单选' },
  { v: 'multi', l: '多选' },
  { v: 'judge', l: '判断' },
  { v: 'fill', l: '填空' },
  { v: 'short', l: '简答' },
  { v: 'code', l: '编程' },
]

const loading = ref(false)
const initialLoading = ref(true)
const importing = ref(false)
const rows = ref([])
const statRows = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const keyword = ref('')
const filterType = ref('')
const filterDifficulty = ref('')
const filterCourse = ref('')
const dlg = ref(false)
const saving = ref(false)
const editId = ref(null)
const usageDlg = ref(false)
const usageRows = ref([])
const previewDlg = ref(false)
const previewQuestion = ref(null)

const form = ref({
  type: 'single',
  stem: '',
  reference_answer: '',
  default_score: 5,
  difficulty: 'medium',
  course_label: '',
  knowledgeText: '',
})

const ui = ref({
  mcOptions: defaultMcOptions(),
  singleKey: 'A',
  multiKeys: [],
  judgeOk: true,
  fillPrimary: '',
  fillAlts: [],
  fillIgnoreCase: true,
  codeHint: '',
})

function defaultMcOptions() {
  return 'ABCD'.split('').map((k) => ({ key: k, label: '' }))
}

function defaultUiForType(type) {
  const base = {
    mcOptions: defaultMcOptions(),
    singleKey: 'A',
    multiKeys: ['A'],
    judgeOk: true,
    fillPrimary: '',
    fillAlts: [],
    fillIgnoreCase: true,
    codeHint: '',
  }
  if (type === 'multi') base.multiKeys = ['A', 'B']
  return base
}

const validMcKeys = computed(() => {
  const keys = ui.value.mcOptions.map((r) => String(r.key || '').trim()).filter(Boolean)
  return [...new Set(keys)]
})

const courseOptions = computed(() => {
  const set = new Set(statRows.value.map((r) => r.course_label).filter(Boolean))
  return [...set].sort()
})

const needsClientFilter = computed(() => !!filterDifficulty.value || !!filterCourse.value)

const filteredRows = computed(() => {
  let list = needsClientFilter.value ? [...(statRows.value || [])] : [...(rows.value || [])]
  if (filterDifficulty.value) list = list.filter((r) => r.difficulty === filterDifficulty.value)
  if (filterCourse.value) list = list.filter((r) => r.course_label === filterCourse.value)
  return list
})

const displayTotal = computed(() => (needsClientFilter.value ? filteredRows.value.length : total.value))

const pagedRows = computed(() => {
  if (needsClientFilter.value) {
    const start = (page.value - 1) * pageSize.value
    return filteredRows.value.slice(start, start + pageSize.value)
  }
  return filteredRows.value
})

const hasActiveFilters = computed(
  () => !!keyword.value.trim() || !!filterType.value || !!filterDifficulty.value || !!filterCourse.value
)

const overviewCards = computed(() => {
  const snap = statRows.value.length ? statRows.value : rows.value
  const objective = snap.filter((r) => ['single', 'multi', 'judge', 'fill'].includes(r.type)).length
  const code = snap.filter((r) => r.type === 'code').length
  const referenced = snap.filter((r) => (Number(r.usage_count) || 0) > 0).length
  const monthNew = snap.filter((r) => isThisMonth(r.created_at)).length
  return [
    { key: 'all', label: '我的题目', value: total.value || snap.length, icon: List, tone: 'slate' },
    { key: 'code', label: '编程题', value: code, icon: Edit, tone: 'teal' },
    { key: 'obj', label: '客观题', value: objective, icon: View, tone: 'blue' },
    { key: 'ref', label: '已被组卷引用', value: referenced, icon: List, tone: 'violet' },
    { key: 'month', label: '本月新增', value: monthNew, icon: Plus, tone: 'orange' },
  ]
})

function refTypeLabel(t) {
  if (t === 'practice') return '习题练习'
  if (t === 'exam') return '在线考试'
  return t || '—'
}

function addMcOption() {
  const used = new Set(ui.value.mcOptions.map((r) => String(r.key || '').trim().toUpperCase()))
  let ch = 'A'
  while (used.has(ch) && ch.charCodeAt(0) < 90) ch = String.fromCharCode(ch.charCodeAt(0) + 1)
  if (used.has(ch)) ch = `O${ui.value.mcOptions.length + 1}`
  ui.value.mcOptions.push({ key: ch, label: '' })
}

function removeMcOption(idx) {
  if (ui.value.mcOptions.length <= 2) return
  const removed = ui.value.mcOptions[idx]
  ui.value.mcOptions.splice(idx, 1)
  if (form.value.type === 'single' && ui.value.singleKey === removed.key) {
    ui.value.singleKey = ui.value.mcOptions[0]?.key || 'A'
  }
  if (form.value.type === 'multi') {
    ui.value.multiKeys = ui.value.multiKeys.filter((k) => k !== removed.key)
  }
}

function removeFillAlt(idx) {
  ui.value.fillAlts.splice(idx, 1)
}

function onTypeChange() {
  Object.assign(ui.value, defaultUiForType(form.value.type))
}

function parseKnowledgeTags(d) {
  if (Array.isArray(d.knowledge_tags)) return d.knowledge_tags.join(',')
  if (typeof d.knowledge_tags === 'string') {
    try {
      const j = JSON.parse(d.knowledge_tags)
      return Array.isArray(j) ? j.join(',') : ''
    } catch {
      return ''
    }
  }
  return ''
}

function hydrateUiFromQuestion(d) {
  const opts = d.options_json
  const ans = typeof d.answer_json === 'object' && d.answer_json ? d.answer_json : {}

  if (d.type === 'single' || d.type === 'multi') {
    if (Array.isArray(opts) && opts.length) {
      ui.value.mcOptions = opts.map((x) => ({
        key: String(x.key ?? '').trim() || '?',
        label: String(x.label ?? ''),
      }))
    } else {
      ui.value.mcOptions = defaultMcOptions()
    }
    if (d.type === 'single') {
      ui.value.singleKey = String(ans.correct || ui.value.mcOptions[0]?.key || 'A').toUpperCase()
    } else {
      const raw = ans.correct
      ui.value.multiKeys = Array.isArray(raw)
        ? raw.map((x) => String(x).trim().toUpperCase())
        : normStr(raw)
          ? String(raw)
              .split(/[,;，；\s]+/)
              .map((x) => x.trim().toUpperCase())
              .filter(Boolean)
          : []
    }
  } else if (d.type === 'judge') {
    ui.value.judgeOk = ans.correct === false ? false : true
  } else if (d.type === 'fill') {
    ui.value.fillPrimary = ans.correct != null ? String(ans.correct) : ''
    ui.value.fillIgnoreCase = ans.ignoreCase !== false
    const alts = Array.isArray(ans.alternatives) ? [...ans.alternatives] : []
    if (!ui.value.fillPrimary && alts.length) {
      ui.value.fillPrimary = String(alts.shift())
    }
    ui.value.fillAlts = alts.map(String).filter(Boolean)
  } else if (d.type === 'code') {
    ui.value.codeHint = ans.hint != null ? String(ans.hint) : ans.note != null ? String(ans.note) : ''
  }
}

function normStr(s) {
  return String(s || '').trim()
}

function buildPayloadJson() {
  const t = form.value.type
  if (t === 'single') {
    const options_json = ui.value.mcOptions
      .filter((r) => normStr(r.key) && normStr(r.label))
      .map((r) => ({ key: String(r.key).trim().toUpperCase(), label: normStr(r.label) }))
    if (options_json.length < 2) throw new Error('请至少填写两个有效选项（键+文字）')
    const k = String(ui.value.singleKey || '').trim().toUpperCase()
    const keys = new Set(options_json.map((o) => o.key))
    if (!keys.has(k)) throw new Error('请选择一个与选项键一致的正确答案')
    return { options_json, answer_json: { correct: k } }
  }
  if (t === 'multi') {
    const options_json = ui.value.mcOptions
      .filter((r) => normStr(r.key) && normStr(r.label))
      .map((r) => ({ key: String(r.key).trim().toUpperCase(), label: normStr(r.label) }))
    if (options_json.length < 2) throw new Error('请至少填写两个有效选项')
    const keySet = new Set(options_json.map((o) => o.key))
    const correct = [...new Set(ui.value.multiKeys.map((x) => String(x).trim().toUpperCase()))].filter((x) =>
      keySet.has(x)
    )
    if (!correct.length) throw new Error('请勾选至少一个正确答案')
    return { options_json, answer_json: { correct } }
  }
  if (t === 'judge') {
    return { options_json: null, answer_json: { correct: !!ui.value.judgeOk } }
  }
  if (t === 'fill') {
    const primary = normStr(ui.value.fillPrimary)
    if (!primary) throw new Error('请填写填空标准答案')
    const alternatives = ui.value.fillAlts.map(normStr).filter(Boolean)
    return {
      options_json: null,
      answer_json: {
        correct: primary,
        ignoreCase: !!ui.value.fillIgnoreCase,
        alternatives,
      },
    }
  }
  if (t === 'short') {
    return { options_json: null, answer_json: {} }
  }
  if (t === 'code') {
    const hint = normStr(ui.value.codeHint)
    return {
      options_json: null,
      answer_json: hint ? { hint } : {},
    }
  }
  throw new Error('未知题型')
}

async function loadStatSnapshot() {
  try {
    const params = {
      page: 1,
      pageSize: Math.min(Math.max(total.value, 20), 500),
      q: keyword.value.trim() || undefined,
      type: filterType.value || undefined,
    }
    const res = await listQuestions(params)
    if (res.success) statRows.value = res.data || []
  } catch {
    statRows.value = rows.value
  }
}

async function load() {
  loading.value = true
  try {
    if (needsClientFilter.value) {
      await loadStatSnapshot()
      rows.value = statRows.value
    } else {
      const res = await listQuestions({
        page: page.value,
        pageSize: pageSize.value,
        q: keyword.value.trim() || undefined,
        type: filterType.value || undefined,
      })
      if (res.success) {
        rows.value = res.data || []
        total.value = res.total ?? 0
      }
      await loadStatSnapshot()
    }
  } finally {
    loading.value = false
  }
}

function applySearch() {
  page.value = 1
  load()
}

function onPageChange(p) {
  page.value = p
  if (!needsClientFilter.value) load()
}

function resetFilters() {
  keyword.value = ''
  filterType.value = ''
  filterDifficulty.value = ''
  filterCourse.value = ''
  page.value = 1
  load()
}

const resetForm = () => {
  editId.value = null
  form.value = {
    type: 'single',
    stem: '',
    reference_answer: '',
    default_score: 5,
    difficulty: 'medium',
    course_label: '',
    knowledgeText: '',
  }
  Object.assign(ui.value, defaultUiForType('single'))
}

const openCreate = () => {
  resetForm()
  dlg.value = true
}

const fillFormFromQuestion = (d, asCopy = false) => {
  editId.value = asCopy ? null : d.id
  form.value = {
    type: d.type,
    stem: asCopy ? `${d.stem}（副本）` : d.stem,
    reference_answer: d.reference_answer || '',
    default_score: Number(d.default_score) || 5,
    difficulty: d.difficulty || 'medium',
    course_label: d.course_label || '',
    knowledgeText: parseKnowledgeTags(d),
  }
  Object.assign(ui.value, defaultUiForType(d.type))
  hydrateUiFromQuestion(d)
}

const openEdit = async (row) => {
  try {
    const res = await getQuestion(row.id)
    if (!res.success) return
    fillFormFromQuestion(res.data)
    dlg.value = true
  } catch {
    ElMessage.error('加载题目失败')
  }
}

const openPreview = async (row) => {
  try {
    const res = await getQuestion(row.id)
    if (res.success) {
      previewQuestion.value = res.data
      previewDlg.value = true
    }
  } catch {
    ElMessage.error('加载预览失败')
  }
}

const copyQuestion = async (row) => {
  try {
    const res = await getQuestion(row.id)
    if (!res.success) return
    fillFormFromQuestion(res.data, true)
    dlg.value = true
  } catch {
    ElMessage.error('复制失败')
  }
}

const triggerBlobDownload = (blob, filename) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const downloadTpl = async () => {
  try {
    const blob = await downloadQuestionTemplate()
    triggerBlobDownload(blob, '题库导入模板.xlsx')
  } catch (e) {
    try {
      const r = await fetch(`${window.location.origin}/qbank-import-template.xlsx`)
      if (!r.ok) throw new Error('no static')
      const blob = await r.blob()
      triggerBlobDownload(blob, '题库导入模板.xlsx')
      ElMessage.warning('接口模板暂不可用，已改为本地模板文件（列格式一致）')
    } catch {
      ElMessage.error(e?.response?.data?.message || '下载失败')
    }
  }
}

const handleImport = async (file) => {
  importing.value = true
  try {
    const res = await importQuestions(file)
    if (res.success) {
      ElMessage.success(`成功导入 ${res.inserted} 题`)
      load()
    } else {
      ElMessage.error(res.message || '导入失败')
    }
  } catch (e) {
    const msg = e?.response?.data?.message
    const errs = e?.response?.data?.errors
    if (errs?.length) {
      ElMessage.error(errs.map((x) => `第${x.row}行: ${x.message}`).slice(0, 5).join('；'))
    } else ElMessage.error(msg || '导入失败')
  } finally {
    importing.value = false
  }
  return false
}

const save = async () => {
  if (!normStr(form.value.stem)) {
    ElMessage.error('请填写题干')
    return
  }
  let options_json
  let answer_json
  try {
    const built = buildPayloadJson()
    options_json = built.options_json
    answer_json = built.answer_json
  } catch (e) {
    ElMessage.error(e.message || '请检查选项与答案')
    return
  }
  const knowledge_tags = form.value.knowledgeText
    .split(/[,，;；]/)
    .map((s) => s.trim())
    .filter(Boolean)
  saving.value = true
  try {
    const payload = {
      type: form.value.type,
      stem: form.value.stem.trim(),
      options_json,
      answer_json,
      reference_answer: form.value.reference_answer?.trim() || null,
      default_score: form.value.default_score,
      difficulty: form.value.difficulty,
      course_label: form.value.course_label?.trim() || null,
      knowledge_tags,
    }
    if (editId.value) {
      const res = await updateQuestion(editId.value, payload)
      if (res.success) ElMessage.success('已保存')
    } else {
      const res = await createQuestion(payload)
      if (res.success) ElMessage.success('已创建')
    }
    dlg.value = false
    load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

const openUsage = async (row) => {
  try {
    const res = await getQuestionUsage(row.id)
    if (res.success) {
      usageRows.value = res.data || []
      usageDlg.value = true
    }
  } catch {
    ElMessage.error('加载失败')
  }
}

const remove = async (row) => {
  try {
    await ElMessageBox.confirm(
      '确定删除该题目？（软删除，已引用题目删除后不影响历史试卷结构）',
      '确认删除',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
    await deleteQuestion(row.id)
    ElMessage.success('已删除')
    load()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e?.response?.data?.message || '删除失败')
  }
}

const handleMore = (cmd, row) => {
  if (cmd === 'copy') copyQuestion(row)
  else if (cmd === 'delete') remove(row)
}

onMounted(async () => {
  try {
    await load()
  } finally {
    initialLoading.value = false
  }
})
</script>

<style scoped>
.teacher-qb-page {
  max-width: 1400px;
}

.tw-filter-bar {
  padding: 16px 18px;
}

.filter-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  justify-content: space-between;
  align-items: flex-start;
}

.filter-toolbar__filters,
.filter-toolbar__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.filter-toolbar__search {
  width: 220px;
}

.filter-toolbar__select {
  width: 132px;
}

.info-cell__title {
  display: block;
  font-weight: 600;
  color: #0f172a;
}

.info-cell__sub {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: #94a3b8;
}

.score-diff {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
  font-size: 13px;
}

.pager-wrap {
  padding: 16px 18px;
  display: flex;
  justify-content: flex-end;
}

.form-section {
  margin-bottom: 20px;
  padding-bottom: 8px;
  border-bottom: 1px solid #eef2f7;
}

.form-section:last-child {
  border-bottom: none;
}

.form-section__title {
  margin: 0 0 14px;
  font-size: 14px;
  font-weight: 600;
  color: #334155;
}

.opt-list {
  width: 100%;
}

.opt-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}

.opt-key {
  width: 72px;
  flex-shrink: 0;
}

.opt-label {
  flex: 1;
  min-width: 0;
}

.form-hint {
  margin: 6px 0 0;
  font-size: 12px;
  color: #64748b;
}

.danger-text {
  color: #dc2626;
}
</style>
