<template>
  <div class="page-qb">
    <header class="page-head">
      <h1 class="page-title">题库管理</h1>
      <p class="page-desc">按题型可视化出题：客观题用表单配置选项与标准答案；简答/编程题填写参考答案要点。</p>
    </header>

    <el-card shadow="never" class="panel-card">
      <div class="toolbar-row">
        <el-input v-model="keyword" placeholder="搜索题干或课程" clearable class="search-inp" @keyup.enter="load" />
        <el-select v-model="filterType" placeholder="题型" clearable style="width: 140px" @change="load">
          <el-option label="单选" value="single" />
          <el-option label="多选" value="multi" />
          <el-option label="判断" value="judge" />
          <el-option label="填空" value="fill" />
          <el-option label="简答" value="short" />
          <el-option label="编程" value="code" />
        </el-select>
        <el-button type="primary" @click="load">查询</el-button>
        <el-button @click="openCreate">新增题目</el-button>
        <el-button @click="downloadTpl">下载 Excel 模板</el-button>
        <el-upload :show-file-list="false" accept=".xlsx" :before-upload="handleImport">
          <el-button :loading="importing">批量导入</el-button>
        </el-upload>
      </div>

      <el-table v-loading="loading" :data="rows" border stripe class="data-table qb-table" style="width: 100%; margin-top: 16px">
        <el-table-column label="序号" width="64" align="center">
          <template #default="{ $index }">{{ (page - 1) * pageSize + $index + 1 }}</template>
        </el-table-column>
        <el-table-column label="题库ID" width="88" align="center">
          <template #default="{ row }">
            <el-tooltip content="数据库主键，删除或导入后不会从 1 重排" placement="top">
              <span class="col-id">{{ row.id }}</span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column label="题型" width="100" align="center">
          <template #default="{ row }">
            <el-tag size="small" type="primary" effect="plain">{{ qbTypeLabel(row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="stem" label="题干" min-width="200" show-overflow-tooltip />
        <el-table-column prop="default_score" label="分值" width="72" align="right" />
        <el-table-column label="难度" width="88" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="qbDifficultyTagType(row.difficulty)" effect="light">{{ qbDifficultyLabel(row.difficulty) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="course_label" label="课程" min-width="100" show-overflow-tooltip />
        <el-table-column prop="usage_count" label="引用" width="72" align="center" />
        <el-table-column label="操作" width="220" align="right" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button link type="primary" @click="openUsage(row)">使用记录</el-button>
            <el-button link type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pager-wrap">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          layout="total, prev, pager, next"
          background
          @current-change="load"
        />
      </div>
    </el-card>

    <el-dialog v-model="dlg" :title="editId ? '编辑题目' : '新增题目'" width="720px" destroy-on-close @closed="resetForm">
      <el-form label-width="100px">
        <el-form-item label="题型">
          <el-select v-model="form.type" style="width: 100%" @change="onTypeChange">
            <el-option v-for="t in typeOpts" :key="t.v" :label="t.l" :value="t.v" />
          </el-select>
        </el-form-item>
        <el-form-item label="题干">
          <el-input v-model="form.stem" type="textarea" :rows="3" placeholder="请输入题目描述" />
        </el-form-item>

        <!-- 单选 / 多选 -->
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

        <!-- 判断 -->
        <template v-else-if="form.type === 'judge'">
          <el-form-item label="正确答案">
            <el-radio-group v-model="ui.judgeOk">
              <el-radio :value="true">对 / 正确</el-radio>
              <el-radio :value="false">错 / 错误</el-radio>
            </el-radio-group>
          </el-form-item>
        </template>

        <!-- 填空 -->
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

        <!-- 简答 -->
        <template v-else-if="form.type === 'short'">
          <el-form-item label="参考答案">
            <el-input v-model="form.reference_answer" type="textarea" :rows="6" placeholder="评分时可对照的要点、关键词或范文片段" />
          </el-form-item>
        </template>

        <!-- 编程 -->
        <template v-else-if="form.type === 'code'">
          <el-form-item label="参考答案">
            <el-input v-model="form.reference_answer" type="textarea" :rows="8" placeholder="思路说明、关键代码片段或评分要点" />
          </el-form-item>
          <el-form-item label="评分提示">
            <el-input v-model="ui.codeHint" type="textarea" :rows="2" placeholder="可选：输入输出格式、语言版本等说明（写入答案 JSON 备注字段）" />
          </el-form-item>
        </template>

        <el-form-item v-if="form.type !== 'short' && form.type !== 'code'" label="参考答案">
          <el-input v-model="form.reference_answer" type="textarea" :rows="2" placeholder="可选：解析或扩展说明" />
        </el-form-item>

        <el-form-item label="分值">
          <el-input-number v-model="form.default_score" :min="0.5" :max="100" :step="0.5" />
        </el-form-item>
        <el-form-item label="难度">
          <el-select v-model="form.difficulty" style="width: 160px">
            <el-option label="易" value="easy" />
            <el-option label="中" value="medium" />
            <el-option label="难" value="hard" />
          </el-select>
        </el-form-item>
        <el-form-item label="课程">
          <el-input v-model="form.course_label" placeholder="如课程名或模块" />
        </el-form-item>
        <el-form-item label="知识点">
          <el-input v-model="form.knowledgeText" placeholder="逗号分隔多个标签" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="usageDlg" title="题目使用记录" width="520px">
      <el-table :data="usageRows" size="small" border>
        <el-table-column prop="ref_type" label="类型" width="100" />
        <el-table-column prop="ref_id" label="关联ID" width="88" />
        <el-table-column prop="ref_title" label="标题" show-overflow-tooltip />
        <el-table-column label="时间" width="178">
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
import { formatDateTime } from '../../utils/format'

const loading = ref(false)
const importing = ref(false)
const rows = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const keyword = ref('')
const filterType = ref('')
const dlg = ref(false)
const saving = ref(false)
const editId = ref(null)
const usageDlg = ref(false)
const usageRows = ref([])

const typeOpts = [
  { v: 'single', l: '单选' },
  { v: 'multi', l: '多选' },
  { v: 'judge', l: '判断' },
  { v: 'fill', l: '填空' },
  { v: 'short', l: '简答' },
  { v: 'code', l: '编程' },
]

const form = ref({
  type: 'single',
  stem: '',
  reference_answer: '',
  default_score: 5,
  difficulty: 'medium',
  course_label: '',
  knowledgeText: '',
})

/** 题型专用 UI 状态（保存时转换为 JSON） */
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

/** 从后端题目填充 UI */
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

const load = async () => {
  loading.value = true
  try {
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
  } finally {
    loading.value = false
  }
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

const openEdit = async (row) => {
  try {
    const res = await getQuestion(row.id)
    if (!res.success) return
    const d = res.data
    editId.value = d.id
    form.value = {
      type: d.type,
      stem: d.stem,
      reference_answer: d.reference_answer || '',
      default_score: Number(d.default_score) || 5,
      difficulty: d.difficulty || 'medium',
      course_label: d.course_label || '',
      knowledgeText: parseKnowledgeTags(d),
    }
    Object.assign(ui.value, defaultUiForType(d.type))
    hydrateUiFromQuestion(d)
    dlg.value = true
  } catch {
    ElMessage.error('加载题目失败')
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
    await ElMessageBox.confirm('确定删除该题目？（软删除，已引用题目删除后不影响历史试卷结构）', '确认', { type: 'warning' })
    await deleteQuestion(row.id)
    ElMessage.success('已删除')
    load()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e?.response?.data?.message || '删除失败')
  }
}

onMounted(load)
</script>

<style scoped>
.page-qb {
  max-width: 1400px;
}
.page-head {
  margin-bottom: 16px;
}
.page-title {
  margin: 0 0 6px;
  font-size: 22px;
  font-weight: 600;
  color: var(--sg-text);
}
.page-desc {
  margin: 0;
  font-size: 14px;
  color: var(--sg-text-secondary);
}
.panel-card {
  border-radius: var(--sg-radius-lg);
  border: 1px solid var(--sg-border);
}
.toolbar-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}
.search-inp {
  width: 220px;
}
.pager-wrap {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
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
  color: var(--sg-text-secondary);
}
.data-table :deep(.col-id) {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--sg-text-secondary);
}
</style>
