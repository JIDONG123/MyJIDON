<template>
  <div class="practice-workbench">
    <!-- 顶部标题区 -->
    <header class="workbench-head">
      <div class="workbench-head__main">
        <h1 class="workbench-title">练习测评</h1>
        <p class="workbench-subtitle">
          面向行政班或教学班发布课堂练习，支持题库选题、自动评分、主观题批改与成绩统计
        </p>
      </div>
      <div class="workbench-head__actions">
        <el-button type="primary" size="large" :disabled="!audienceId" @click="openCreate">
          <el-icon><Plus /></el-icon>
          新建练习
        </el-button>
      </div>
    </header>

    <!-- 概览统计 -->
    <section class="metric-grid">
      <div v-for="card in metricCards" :key="card.key" class="metric-card">
        <div class="metric-card__icon" :class="`metric-card__icon--${card.tone}`">
          <el-icon><component :is="card.icon" /></el-icon>
        </div>
        <div class="metric-card__body">
          <span class="metric-card__value">{{ card.value }}</span>
          <span class="metric-card__label">{{ card.label }}</span>
          <span v-if="card.hint" class="metric-card__hint">{{ card.hint }}</span>
        </div>
      </div>
    </section>

    <!-- 列表区 -->
    <div class="panel">
      <div class="panel__header">
        <div>
          <h2 class="panel__title">练习列表</h2>
          <span class="panel__meta">共 {{ displayedRows.length }} 项 · 当前班级筛选范围内</span>
        </div>
      </div>

      <div class="filter-bar">
        <div class="filter-bar__scope">
          <span class="filter-label">发布对象</span>
          <el-radio-group v-model="audienceScope" class="audience-scope" @change="onAudienceScopeChange">
            <el-radio-button value="legacy">行政班</el-radio-button>
            <el-radio-button value="teaching">教学班</el-radio-button>
          </el-radio-group>
        </div>
        <el-select
          v-model="audienceId"
          class="filter-select filter-select--class"
          :placeholder="audienceScope === 'teaching' ? '选择教学班' : '选择行政班'"
          filterable
          clearable
          @change="load"
        >
          <el-option v-for="o in audienceOptions" :key="o.id" :label="o.label" :value="o.id" />
        </el-select>
        <el-input v-model="keywordSearch" clearable placeholder="搜索练习名称" class="filter-input">
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <el-select v-model="filterStatus" clearable placeholder="练习状态" class="filter-select">
          <el-option label="全部状态" value="" />
          <el-option label="未发布" value="draft" />
          <el-option label="进行中" value="active" />
          <el-option label="即将截止" value="soon" />
          <el-option label="已截止" value="closed" />
          <el-option label="已完成" value="done" />
        </el-select>
        <el-select v-model="sortBy" placeholder="排序" class="filter-select filter-select--sort">
          <el-option label="截止时间 ↓" value="deadline_desc" />
          <el-option label="截止时间 ↑" value="deadline_asc" />
          <el-option label="创建顺序 ↓" value="id_desc" />
          <el-option label="创建顺序 ↑" value="id_asc" />
        </el-select>
      </div>

      <el-table
        v-loading="loading || metaLoading"
        :data="displayedRows"
        class="practice-table"
        border
        stripe
      >
        <template #empty>
          <div class="empty-state">
            <div class="empty-state__icon">
              <el-icon :size="48"><Document /></el-icon>
            </div>
            <h3 class="empty-state__title">暂无练习测评</h3>
            <p class="empty-state__desc">
              当前班级还没有发布练习。你可以从题库中选择题目，快速创建课堂练习或课后测评。
            </p>
            <el-button type="primary" :disabled="!audienceId" @click="openCreate">
              <el-icon><Plus /></el-icon>
              新建练习
            </el-button>
          </div>
        </template>

        <el-table-column label="练习名称" min-width="200">
          <template #default="{ row }">
            <div class="name-cell">
              <span class="name-cell__title">{{ row.title }}</span>
              <span v-if="row.description" class="name-cell__sub">{{ clipDesc(row.description) }}</span>
              <span v-else class="name-cell__sub muted">练习 #{{ row.id }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="发布范围" width="160">
          <template #default>
            <div class="scope-cell">
              <el-tag size="small" :class="audienceScope === 'teaching' ? 'tag-scope-tc' : 'tag-scope-legacy'" effect="plain">
                {{ audienceScope === 'teaching' ? '教学班' : '行政班' }}
              </el-tag>
              <span class="scope-name">{{ currentAudienceLabel }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="截止时间" width="168">
          <template #default="{ row }">
            <span :class="{ 'text-warn': isDeadlineSoon(row) }">
              {{ row.deadline_at ? formatDateTime(row.deadline_at) : '不限' }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="题目结构" width="140">
          <template #default="{ row }">
            <div class="structure-cell">
              <span class="structure-main">{{ rowMeta(row).questionTotal || row.question_count || 0 }} 题</span>
              <span v-if="rowMeta(row).objectiveCount || rowMeta(row).subjectiveCount" class="structure-sub">
                客观 {{ rowMeta(row).objectiveCount }} · 主观 {{ rowMeta(row).subjectiveCount }}
              </span>
              <span v-else-if="!metaLoading" class="structure-sub muted">—</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="参与进度" min-width="160">
          <template #default="{ row }">
            <div class="progress-cell">
              <el-progress
                :percentage="participationPercent(row)"
                :stroke-width="8"
                :show-text="false"
                :color="progressColor(row)"
              />
              <span class="progress-text">{{ participationLabel(row) }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="评分方式" width="108" align="center">
          <template #default="{ row }">
            <el-tag size="small" :class="gradingModeClass(row)" effect="plain">
              {{ gradingModeLabel(row) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag size="small" :class="practicePhaseTagClass(row)" effect="plain">
              {{ practicePhaseLabel(row) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="200" align="right" fixed="right">
          <template #default="{ row }">
            <div class="table-actions">
              <el-button type="primary" size="small" link @click="viewAttempts(row)">
                <el-icon><View /></el-icon> 查看提交
              </el-button>
              <el-dropdown trigger="click" @command="(cmd) => handleRowMore(cmd, row)">
                <el-button size="small" link type="info">
                  更多 <el-icon class="el-icon--right"><ArrowDown /></el-icon>
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="edit">
                      <el-icon><Edit /></el-icon> 编辑
                    </el-dropdown-item>
                    <el-dropdown-item command="configure">
                      <el-icon><Setting /></el-icon> 配置题目
                    </el-dropdown-item>
                    <el-dropdown-item v-if="rowMeta(row).pendingGrade > 0" command="grade">
                      <el-icon><EditPen /></el-icon> 批改（{{ rowMeta(row).pendingGrade }}）
                    </el-dropdown-item>
                    <el-dropdown-item command="delete" divided>
                      <span class="text-danger"><el-icon><Delete /></el-icon> 删除</span>
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 新建/编辑练习 -->
    <el-dialog
      v-model="dlg"
      :title="currentId ? '编辑练习' : '新建练习'"
      width="600px"
      destroy-on-close
      class="practice-form-dlg"
    >
      <div class="form-flow-hint">
        <span class="flow-step">题库选题</span>
        <el-icon><ArrowRight /></el-icon>
        <span class="flow-step">配置练习</span>
        <el-icon><ArrowRight /></el-icon>
        <span class="flow-step">发布班级</span>
        <el-icon><ArrowRight /></el-icon>
        <span class="flow-step">学生作答</span>
        <el-icon><ArrowRight /></el-icon>
        <span class="flow-step">自动评分 / 教师批改</span>
      </div>

      <el-divider content-position="left">基础信息</el-divider>
      <el-form label-width="112px">
        <el-form-item label="练习名称"><el-input v-model="form.title" placeholder="例如：第三章课后练习" /></el-form-item>
        <el-form-item label="说明"><el-input v-model="form.description" type="textarea" :rows="2" placeholder="可选，面向学生的练习说明" /></el-form-item>
      </el-form>

      <el-divider content-position="left">发布设置</el-divider>
      <el-form label-width="112px">
        <el-form-item label="发布对象">
          <el-tag effect="plain">{{ audienceScope === 'teaching' ? '教学班' : '行政班' }}</el-tag>
          <span class="form-inline-text">{{ currentAudienceLabel || '请先选择班级' }}</span>
        </el-form-item>
        <el-form-item label="截止时间">
          <el-date-picker v-model="form.deadline_at" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" style="width: 100%" clearable placeholder="留空表示不限时" />
        </el-form-item>
        <el-form-item label="成绩公布">
          <el-date-picker v-model="form.publish_scores_at" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" style="width: 100%" clearable />
          <div class="tip">留空则学生提交后即可见分；设置未来时间则到点公布，公布前成绩 AES 密封存储。</div>
        </el-form-item>
      </el-form>

      <el-divider content-position="left">评分设置</el-divider>
      <el-form label-width="112px">
        <el-form-item label="打乱选项"><el-switch v-model="form.shuffle_options" /></el-form-item>
        <el-alert type="info" show-icon :closable="false" class="form-alert">
          客观题提交后自动判分；含简答/编程题时需教师批改或采纳 AI 建议赋分。
        </el-alert>
      </el-form>

      <template #footer>
        <el-button @click="dlg = false">取消</el-button>
        <el-button type="primary" @click="savePractice">保存并发布</el-button>
      </template>
    </el-dialog>

    <!-- 配置题目（保留穿梭框逻辑） -->
    <el-dialog v-model="qDlg" class="qb-config-dialog" title="配置练习题目" width="960px" destroy-on-close align-center>
      <div class="qb-config-hero">
        <p class="qb-config-lead">
          从个人题库勾选本题练习要发布的试题；保存后将<strong>覆盖</strong>原有选题。右侧列表自上而下为出题顺序。
        </p>
      </div>
      <div class="qb-transfer-toolbar">
        <el-select v-model="transferFilterType" clearable placeholder="题型筛选" style="width: 140px">
          <el-option label="全部题型" value="" />
          <el-option v-for="t in transferTypeOpts" :key="t.v" :label="t.l" :value="t.v" />
        </el-select>
        <span class="qb-transfer-stat muted">共 {{ allQuestions.length }} 题 · 已选 {{ pickedQ.length }} 题</span>
      </div>
      <el-transfer
        v-model="pickedQ"
        class="qb-transfer pro-transfer"
        filterable
        :filter-method="transferFilterMethod"
        filter-placeholder="搜索题干、题库ID 或题型…"
        :titles="['题库候选', '本场练习已选']"
        :button-texts="['移除', '加入']"
        :data="transferData"
        :props="{ key: 'key', label: 'label' }"
      >
        <template #default="{ option }">
          <div class="qb-transfer-item">
            <div class="qb-transfer-stem" :title="String(option.stem)">{{ clipStem(option.stem) }}</div>
            <div class="qb-transfer-meta">
              <el-tag size="small" type="primary" effect="plain">{{ qbTypeLabel(option.type) }}</el-tag>
              <el-tag size="small" :type="qbDifficultyTagType(option.difficulty)" effect="light">{{ qbDifficultyLabel(option.difficulty) }}</el-tag>
              <span class="qb-transfer-id">题库ID {{ option.key }}</span>
              <span v-if="option.score != null && option.score !== ''" class="qb-transfer-score">{{ option.score }} 分</span>
            </div>
          </div>
        </template>
        <template #left-empty>
          <div class="transfer-empty">暂无候选题目，请先录入题库或调整题型筛选</div>
        </template>
        <template #right-empty>
          <div class="transfer-empty">尚未选题，请勾选左侧题目后加入</div>
        </template>
      </el-transfer>
      <template #footer>
        <el-button @click="qDlg = false">取消</el-button>
        <el-button type="primary" @click="saveQuestions">保存题目</el-button>
      </template>
    </el-dialog>

    <!-- 学生作答 -->
    <el-dialog v-model="aDlg" title="学生作答 / 提交详情" width="960px" destroy-on-close align-center>
      <el-alert
        v-if="!gradingSubjective.length"
        type="info"
        show-icon
        :closable="false"
        title="本场练习仅包含客观题，提交后由系统自动判分，无需教师主观批改。"
        class="mb12"
      />
      <el-table :data="attempts" size="small" border stripe>
        <el-table-column prop="real_name" label="姓名" width="100" />
        <el-table-column prop="username" label="用户名" width="120" />
        <el-table-column prop="objective_score" label="客观分" width="88" align="right">
          <template #default="{ row }">{{ fmtScore(row.objective_score) }}</template>
        </el-table-column>
        <el-table-column prop="subjective_score" label="主观分" width="88" align="right">
          <template #default="{ row }">{{ fmtScore(row.subjective_score) }}</template>
        </el-table-column>
        <el-table-column prop="total_score" label="总分" width="88" align="right">
          <template #default="{ row }">{{ fmtScore(row.total_score) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="qbAttemptStatusTagType(row.status)">{{ qbAttemptStatusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="AI 建议" width="100" align="center">
          <template #default="{ row }">
            <el-popover v-if="row.ai_suggestion?.items?.length" placement="left" :width="360" trigger="click">
              <template #reference>
                <el-button link type="primary" size="small">查看</el-button>
              </template>
              <div class="ai-pop">
                <div v-for="(it, idx) in row.ai_suggestion.items" :key="idx" class="ai-pop-item">
                  <div class="ai-pop-title">第 {{ idx + 1 }} 题 · 建议 {{ it.suggested_score }} 分</div>
                  <p class="ai-pop-body">{{ it.rationale || '—' }}</p>
                </div>
              </div>
            </el-popover>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" align="right" fixed="right">
          <template #default="{ row }">
            <el-button v-if="gradingSubjective.length" link type="primary" size="small" @click="openGradePractice(row)">
              批改主观题
            </el-button>
            <el-button
              v-if="gradingSubjective.length && row.ai_suggestion?.items?.length"
              link
              type="warning"
              size="small"
              @click="adoptPracticeAi(row)"
            >
              采纳 AI
            </el-button>
            <span v-if="!gradingSubjective.length" class="muted">—</span>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>

    <el-drawer v-model="gDlg" :title="gradeDrawerTitle" size="520px" destroy-on-close @closed="onGradeDrawerClosed">
      <div v-if="gAttempt" class="grade-drawer-body">
        <el-descriptions :column="1" border size="small" class="mb16">
          <el-descriptions-item label="学生">{{ gAttempt.real_name }}（{{ gAttempt.username }}）</el-descriptions-item>
          <el-descriptions-item label="答卷状态">
            <el-tag size="small" :type="qbAttemptStatusTagType(gAttempt.status)">{{ qbAttemptStatusLabel(gAttempt.status) }}</el-tag>
          </el-descriptions-item>
        </el-descriptions>
        <p class="grade-hint">请为下列简答/编程题评定得分（0～满分）。仅修改的分数会写回系统。</p>
        <div v-for="(it, idx) in gradingSubjective" :key="it.pq_id" class="grade-card">
          <div class="grade-card-head">
            <el-tag size="small" type="primary" effect="plain">{{ qbTypeLabel(it.type) }}</el-tag>
            <span class="grade-max">第 {{ idx + 1 }} 题 · 满分 {{ it.max_score }} 分</span>
          </div>
          <div class="grade-stem">{{ it.stem }}</div>
          <div class="grade-label">学生作答</div>
          <pre class="grade-ans">{{ studentAnswerText(gAttempt, it.pq_id) }}</pre>
          <div v-if="aiHintForPq(gAttempt, it.pq_id)" class="grade-ai">
            <span class="grade-ai-t">AI 参考</span>
            {{ aiHintForPq(gAttempt, it.pq_id) }}
          </div>
          <div class="grade-row">
            <span class="grade-label-inline">评定得分</span>
            <el-input-number
              v-model="gScores[String(it.pq_id)]"
              :min="0"
              :max="it.max_score"
              :step="0.5"
              :precision="1"
              controls-position="right"
              style="width: 160px"
            />
          </div>
        </div>
        <div class="grade-drawer-actions">
          <el-button @click="gDlg = false">取消</el-button>
          <el-button type="primary" :loading="gradeSaving" @click="saveGradePractice">保存批改</el-button>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, reactive } from 'vue'
import { useRtOnDomains } from '../../composables/useRtOnDomains'
import { getMyTeachingOverview } from '../../api/class'
import { listMyTeachingClasses } from '../../api/teachingClass'
import {
  listTeacherPractices,
  createPractice,
  updatePractice,
  deletePractice,
  getPracticeTeacher,
  setPracticeQuestions,
  listPracticeAttempts,
  gradePracticeAttempt,
  adoptPracticeAiScores,
  listQuestions,
} from '../../api/qb'
import {
  qbDifficultyLabel,
  qbDifficultyTagType,
  qbTypeLabel,
  qbAttemptStatusLabel,
  qbAttemptStatusTagType,
  parseJsonLoose,
} from '../../utils/qbLabels'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Edit,
  Setting,
  Delete,
  Plus,
  Search,
  ArrowDown,
  ArrowRight,
  View,
  EditPen,
  Document,
  CircleCheck,
  Timer,
  Finished,
} from '@element-plus/icons-vue'
import { formatDateTime, formatDateTimePicker } from '../../utils/format'

const legacyClasses = ref([])
const teachingClasses = ref([])
const audienceScope = ref('legacy')
const audienceId = ref(null)
const keywordSearch = ref('')
const filterStatus = ref('')
const sortBy = ref('deadline_desc')
const rowMetaById = reactive({})
const metaLoading = ref(false)
const pendingGradeTotal = ref(0)

const audienceOptions = computed(() => {
  if (audienceScope.value === 'teaching') {
    return teachingClasses.value.map((tc) => ({
      id: tc.id,
      label: [tc.class_name, tc.course_name].filter(Boolean).join(' · '),
      studentCount: Number(tc.student_count) || 0,
    }))
  }
  return legacyClasses.value.map((c) => ({
    id: c.id,
    label: c.class_name,
    studentCount: Number(c.student_count) || 0,
  }))
})

const currentAudienceLabel = computed(() => {
  const o = audienceOptions.value.find((x) => Number(x.id) === Number(audienceId.value))
  return o?.label || '—'
})

const currentStudentCount = computed(() => {
  const o = audienceOptions.value.find((x) => Number(x.id) === Number(audienceId.value))
  return Number(o?.studentCount) || 0
})

function audienceListParams() {
  if (audienceScope.value === 'teaching') {
    return { teachingClassId: audienceId.value }
  }
  return { classId: audienceId.value }
}

function audienceCreatePayload() {
  if (audienceScope.value === 'teaching') {
    return { teachingClassId: audienceId.value }
  }
  return { classId: audienceId.value }
}

function onAudienceScopeChange() {
  const opts = audienceOptions.value
  audienceId.value = opts.length ? opts[0].id : null
  load()
}

function rowMeta(row) {
  return rowMetaById[row.id] || {}
}

function practicePhase(row) {
  if (row.status !== 'published') return 'draft'
  const meta = rowMeta(row)
  const dl = row.deadline_at ? new Date(row.deadline_at).getTime() : null
  const now = Date.now()
  if (dl != null && !Number.isNaN(dl)) {
    if (now > dl) {
      if (meta.pendingGrade === 0 && meta.submitted > 0) return 'done'
      return 'closed'
    }
    if (dl - now < 48 * 3600000) return 'soon'
  }
  if (meta.pendingGrade > 0) return 'pending_grade'
  return 'active'
}

function practicePhaseLabel(row) {
  const map = {
    draft: '未发布',
    active: '进行中',
    soon: '即将截止',
    closed: '已截止',
    done: '已完成',
    pending_grade: '待批改',
  }
  return map[practicePhase(row)] || '进行中'
}

function practicePhaseTagClass(row) {
  const phase = practicePhase(row)
  return {
    'tag-phase-active': phase === 'active',
    'tag-phase-done': phase === 'done',
    'tag-phase-soon': phase === 'soon' || phase === 'pending_grade',
    'tag-phase-closed': phase === 'closed',
    'tag-phase-draft': phase === 'draft',
  }
}

function gradingModeLabel(row) {
  const m = rowMeta(row)
  const subj = m.subjectiveCount || 0
  const obj = m.objectiveCount || 0
  if (!obj && !subj) return '—'
  if (subj && obj) return '混合评分'
  if (subj) return '教师批改'
  return '自动评分'
}

function gradingModeClass(row) {
  const label = gradingModeLabel(row)
  return {
    'tag-grade-auto': label === '自动评分',
    'tag-grade-mix': label === '混合评分',
    'tag-grade-manual': label === '教师批改',
  }
}

function participationPercent(row) {
  const meta = rowMeta(row)
  const total = currentStudentCount.value
  if (total > 0) return Math.min(100, Math.round((meta.submitted / total) * 100))
  if (meta.submitted > 0) return 100
  return 0
}

function participationLabel(row) {
  const meta = rowMeta(row)
  const total = currentStudentCount.value
  if (total > 0) return `${meta.submitted || 0}/${total} 已提交`
  if (meta.submitted > 0) return `${meta.submitted} 人已提交`
  return '暂无提交'
}

function progressColor(row) {
  const phase = practicePhase(row)
  if (phase === 'done') return '#059669'
  if (phase === 'pending_grade' || phase === 'soon') return '#ea580c'
  return '#2563eb'
}

function isDeadlineSoon(row) {
  return practicePhase(row) === 'soon'
}

function clipDesc(s) {
  const t = String(s || '').replace(/\s+/g, ' ').trim()
  if (t.length <= 48) return t
  return `${t.slice(0, 48)}…`
}

const metricCards = computed(() => {
  const list = rows.value
  const published = list.filter((r) => r.status === 'published').length
  const active = list.filter((r) => ['active', 'soon'].includes(practicePhase(r))).length
  const done = list.filter((r) => practicePhase(r) === 'done').length
  return [
    { key: 'total', label: '练习总数', value: list.length, icon: Document, tone: 'blue', hint: '当前班级' },
    { key: 'published', label: '已发布', value: published, icon: CircleCheck, tone: 'slate', hint: '' },
    { key: 'active', label: '进行中', value: active, icon: Timer, tone: 'green', hint: '' },
    { key: 'done', label: '已完成', value: done, icon: Finished, tone: 'gray', hint: '' },
    {
      key: 'pending',
      label: '待批改',
      value: pendingGradeTotal.value,
      icon: EditPen,
      tone: 'orange',
      hint: pendingGradeTotal.value ? '待阅答卷' : '含主观题待批',
    },
  ]
})

const displayedRows = computed(() => {
  let list = [...rows.value]
  const kw = keywordSearch.value.trim().toLowerCase()
  if (kw) list = list.filter((r) => String(r.title || '').toLowerCase().includes(kw))
  if (filterStatus.value) {
    list = list.filter((r) => practicePhase(r) === filterStatus.value)
  }
  const sort = sortBy.value
  list.sort((a, b) => {
    if (sort === 'deadline_asc' || sort === 'deadline_desc') {
      const ta = a.deadline_at ? new Date(a.deadline_at).getTime() : Infinity
      const tb = b.deadline_at ? new Date(b.deadline_at).getTime() : Infinity
      return sort === 'deadline_asc' ? ta - tb : tb - ta
    }
    const ia = Number(a.id) || 0
    const ib = Number(b.id) || 0
    return sort === 'id_asc' ? ia - ib : ib - ia
  })
  return list
})

function handleRowMore(cmd, row) {
  if (cmd === 'edit') openEdit(row)
  else if (cmd === 'configure') configure(row)
  else if (cmd === 'grade') viewAttempts(row)
  else if (cmd === 'delete') remove(row)
}

const rows = ref([])
const loading = ref(false)
const dlg = ref(false)
const qDlg = ref(false)
const aDlg = ref(false)
const currentId = ref(null)
const attempts = ref([])
const gradingSubjective = ref([])
const gDlg = ref(false)
const gAttempt = ref(null)
const gScores = reactive({})
const gradeSaving = ref(false)

const gradeDrawerTitle = computed(() => {
  if (!gAttempt.value) return '主观题批改'
  return `主观题批改 · ${gAttempt.value.real_name || ''}`
})

const fmtScore = (v) => {
  if (v == null || v === '') return '—'
  const n = Number(v)
  return Number.isFinite(n) ? n.toFixed(2) : '—'
}

function studentAnswerText(attempt, pqId) {
  const ans = parseJsonLoose(attempt?.answers_json) || {}
  const t = ans[String(pqId)]
  return t != null && t !== '' ? String(t) : '（未作答）'
}

function aiHintForPq(attempt, pqId) {
  const per =
    attempt?.per_question_scores && typeof attempt.per_question_scores === 'object'
      ? attempt.per_question_scores
      : parseJsonLoose(attempt?.per_question_scores) || {}
  const cur = per[String(pqId)]
  if (!cur) return ''
  const parts = []
  if (Number.isFinite(Number(cur.ai_suggested_score))) parts.push(`建议 ${cur.ai_suggested_score} 分`)
  if (cur.ai_rationale) parts.push(String(cur.ai_rationale))
  return parts.join(' · ') || ''
}

const allQuestions = ref([])
const pickedQ = ref([])
const transferFilterType = ref('')
const transferTypeOpts = [
  { v: 'single', l: '单选题' },
  { v: 'multi', l: '多选题' },
  { v: 'judge', l: '判断题' },
  { v: 'fill', l: '填空题' },
  { v: 'short', l: '简答题' },
  { v: 'code', l: '编程题' },
]

function clipStem(s) {
  const t = String(s || '').replace(/\s+/g, ' ').trim()
  if (t.length <= 72) return t || '（无题干）'
  return `${t.slice(0, 72)}…`
}

function transferFilterMethod(query, item) {
  if (transferFilterType.value && item.type !== transferFilterType.value) return false
  const q = String(query || '').trim().toLowerCase()
  if (!q) return true
  return (
    String(item.stem || '').toLowerCase().includes(q) ||
    String(item.key || '').includes(q) ||
    qbTypeLabel(item.type).toLowerCase().includes(q)
  )
}

const transferData = computed(() =>
  allQuestions.value.map((q) => ({
    key: String(q.id),
    label: `[${qbTypeLabel(q.type)}] ${String(q.stem).slice(0, 40)}`,
    stem: q.stem,
    type: q.type,
    difficulty: q.difficulty,
    score: q.default_score,
  }))
)

const form = ref({
  title: '',
  deadline_at: '',
  publish_scores_at: '',
  description: '',
  shuffle_options: false,
})

async function enrichPracticeMeta(practiceList) {
  if (!practiceList.length) {
    pendingGradeTotal.value = 0
    return
  }
  metaLoading.value = true
  let pendingSum = 0
  try {
    await Promise.all(
      practiceList.map(async (p) => {
        try {
          const [attRes, detRes] = await Promise.all([
            listPracticeAttempts(p.id),
            getPracticeTeacher(p.id),
          ])
          const attemptsList = attRes?.success ? attRes.data || [] : []
          const qs = detRes?.success ? detRes.data?.questions || [] : []
          const subjective = qs.filter((q) => q.type === 'short' || q.type === 'code').length
          const pending = attemptsList.filter((a) => a.status === 'submitted').length
          pendingSum += pending
          rowMetaById[p.id] = {
            submitted: attemptsList.filter((a) => a.submitted_at).length,
            graded: attemptsList.filter((a) => a.status === 'graded').length,
            pendingGrade: pending,
            objectiveCount: qs.length - subjective,
            subjectiveCount: subjective,
            questionTotal: qs.length || Number(p.question_count) || 0,
          }
        } catch {
          rowMetaById[p.id] = {
            submitted: 0,
            graded: 0,
            pendingGrade: 0,
            objectiveCount: 0,
            subjectiveCount: 0,
            questionTotal: Number(p.question_count) || 0,
          }
        }
      })
    )
    pendingGradeTotal.value = pendingSum
  } finally {
    metaLoading.value = false
  }
}

const loadClasses = async () => {
  const [legacyRes, tcRes] = await Promise.all([getMyTeachingOverview(), listMyTeachingClasses()])
  if (legacyRes.success) legacyClasses.value = legacyRes.data || []
  if (tcRes.success) teachingClasses.value = tcRes.data || []
  if (!audienceId.value) {
    const opts = audienceOptions.value
    if (opts.length) audienceId.value = opts[0].id
  }
}

const load = async () => {
  if (!audienceId.value) {
    rows.value = []
    pendingGradeTotal.value = 0
    Object.keys(rowMetaById).forEach((k) => delete rowMetaById[k])
    return
  }
  loading.value = true
  try {
    const res = await listTeacherPractices(audienceListParams())
    if (res.success) {
      rows.value = res.data || []
      Object.keys(rowMetaById).forEach((k) => delete rowMetaById[k])
      void enrichPracticeMeta(rows.value)
    }
  } finally {
    loading.value = false
  }
}

const openCreate = () => {
  currentId.value = null
  form.value = { title: '', deadline_at: '', publish_scores_at: '', description: '', shuffle_options: false }
  dlg.value = true
}

const openEdit = async (row) => {
  currentId.value = row.id
  try {
    const det = await getPracticeTeacher(row.id)
    if (!det.success) return
    const pr = det.data.practice
    form.value = {
      title: pr.title,
      deadline_at: pr.deadline_at ? formatDateTimePicker(pr.deadline_at) : '',
      publish_scores_at: pr.publish_scores_at ? formatDateTimePicker(pr.publish_scores_at) : '',
      description: pr.description || '',
      shuffle_options: !!pr.shuffle_options,
    }
    dlg.value = true
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '加载失败')
  }
}

const savePractice = async () => {
  if (!audienceId.value) return
  const payload = {
    ...audienceCreatePayload(),
    ...form.value,
    publish_scores_at: form.value.publish_scores_at || null,
    deadline_at: form.value.deadline_at || null,
    status: 'published',
  }
  try {
    if (currentId.value) {
      await updatePractice(currentId.value, payload)
    } else {
      await createPractice(payload)
    }
    ElMessage.success('已保存')
    dlg.value = false
    load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '失败')
  }
}

const configure = async (row) => {
  currentId.value = row.id
  transferFilterType.value = ''
  const res = await listQuestions({ page: 1, pageSize: 500 })
  if (res.success) allQuestions.value = res.data || []
  const det = await getPracticeTeacher(row.id)
  if (det.success) {
    pickedQ.value = (det.data.questions || []).map((q) => String(q.question_id))
  }
  qDlg.value = true
}

const saveQuestions = async () => {
  try {
    await setPracticeQuestions(currentId.value, pickedQ.value.map((x) => Number(x)))
    ElMessage.success('题目已更新')
    qDlg.value = false
    load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '失败')
  }
}

const viewAttempts = async (row) => {
  currentId.value = row.id
  try {
    const [res, det] = await Promise.all([listPracticeAttempts(row.id), getPracticeTeacher(row.id)])
    if (!res.success) return
    attempts.value = res.data || []
    const qs = det.success ? det.data?.questions || [] : []
    const subjective = qs.filter((q) => q.type === 'short' || q.type === 'code').length
    rowMetaById[row.id] = {
      ...(rowMetaById[row.id] || {}),
      submitted: attempts.value.filter((a) => a.submitted_at).length,
      pendingGrade: attempts.value.filter((a) => a.status === 'submitted').length,
      graded: attempts.value.filter((a) => a.status === 'graded').length,
      objectiveCount: qs.length - subjective,
      subjectiveCount: subjective,
      questionTotal: qs.length || Number(row.question_count) || 0,
    }
    pendingGradeTotal.value = Object.values(rowMetaById).reduce(
      (s, m) => s + (Number(m.pendingGrade) || 0),
      0
    )
    gradingSubjective.value = qs
      .filter((q) => q.type === 'short' || q.type === 'code')
      .map((q) => ({
        pq_id: q.pq_id,
        type: q.type,
        stem: q.stem,
        max_score: Number(q.score_override) || Number(q.default_score) || 0,
      }))
    gDlg.value = false
    gAttempt.value = null
    aDlg.value = true
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '加载失败')
  }
}

const openGradePractice = (row) => {
  gAttempt.value = row
  Object.keys(gScores).forEach((k) => delete gScores[k])
  const per =
    row.per_question_scores && typeof row.per_question_scores === 'object'
      ? row.per_question_scores
      : parseJsonLoose(row.per_question_scores) || {}
  for (const it of gradingSubjective.value) {
    const k = String(it.pq_id)
    const cur = per[k]
    gScores[k] = Number.isFinite(Number(cur?.earned)) ? Number(cur.earned) : null
  }
  gDlg.value = true
}

const onGradeDrawerClosed = () => {
  gAttempt.value = null
  Object.keys(gScores).forEach((k) => delete gScores[k])
}

const saveGradePractice = async () => {
  if (!gAttempt.value) return
  const subjectiveScores = {}
  for (let i = 0; i < gradingSubjective.value.length; i++) {
    const it = gradingSubjective.value[i]
    const k = String(it.pq_id)
    const v = gScores[k]
    if (!Number.isFinite(v)) {
      ElMessage.warning(`请为第 ${i + 1} 道主观题填写得分`)
      return
    }
    if (v < 0 || v > it.max_score) {
      ElMessage.warning(`第 ${i + 1} 题得分须在 0～${it.max_score} 之间`)
      return
    }
    subjectiveScores[k] = v
  }
  gradeSaving.value = true
  try {
    await gradePracticeAttempt(currentId.value, gAttempt.value.id, subjectiveScores)
    ElMessage.success('批改已保存')
    gDlg.value = false
    await viewAttempts({ id: currentId.value })
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '保存失败')
  } finally {
    gradeSaving.value = false
  }
}

const adoptPracticeAi = async (row) => {
  try {
    await adoptPracticeAiScores(currentId.value, row.id, {})
    ElMessage.success('已按 AI 建议写入得分，可再打开「批改主观题」微调')
    await viewAttempts({ id: currentId.value })
    if (gDlg.value && gAttempt.value && gAttempt.value.id === row.id) {
      const fresh = attempts.value.find((a) => a.id === row.id)
      if (fresh) openGradePractice(fresh)
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '采纳失败')
  }
}

const remove = async (row) => {
  try {
    await ElMessageBox.confirm('确定删除该练习？', '确认', { type: 'warning' })
    await deletePractice(row.id)
    ElMessage.success('已删除')
    load()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('删除失败')
  }
}

useRtOnDomains(['qb_practices', 'qb_questions', 'scores'], () => load())

onMounted(async () => {
  await loadClasses()
  await load()
})
</script>

<style scoped>
.practice-workbench {
  max-width: 1360px;
  margin: 0 auto;
  padding-bottom: 32px;
}

.workbench-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}
.workbench-title {
  margin: 0 0 8px;
  font-size: 24px;
  font-weight: 700;
  color: #0f172a;
  letter-spacing: -0.02em;
}
.workbench-subtitle {
  margin: 0;
  max-width: 680px;
  font-size: 14px;
  line-height: 1.65;
  color: #64748b;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 18px;
}
@media (max-width: 1100px) {
  .metric-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (max-width: 640px) {
  .metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
.metric-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px 18px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}
.metric-card__icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
}
.metric-card__icon--blue {
  background: #eff6ff;
  color: #2563eb;
}
.metric-card__icon--slate {
  background: #f1f5f9;
  color: #475569;
}
.metric-card__icon--green {
  background: #ecfdf5;
  color: #059669;
}
.metric-card__icon--gray {
  background: #f8fafc;
  color: #64748b;
}
.metric-card__icon--orange {
  background: #fff7ed;
  color: #ea580c;
}
.metric-card__value {
  display: block;
  font-size: 26px;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.2;
}
.metric-card__label {
  display: block;
  font-size: 13px;
  color: #64748b;
  margin-top: 2px;
}
.metric-card__hint {
  display: block;
  font-size: 11px;
  color: #94a3b8;
  margin-top: 4px;
}

.panel {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
  padding: 18px 20px 20px;
}
.panel__header {
  margin-bottom: 14px;
}
.panel__title {
  margin: 0 0 4px;
  font-size: 16px;
  font-weight: 600;
  color: #0f172a;
}
.panel__meta {
  font-size: 13px;
  color: #64748b;
}

.filter-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  margin-bottom: 16px;
  background: #f8fafc;
  border: 1px solid #eef2f7;
  border-radius: 10px;
}
.filter-bar__scope {
  display: flex;
  align-items: center;
  gap: 8px;
}
.filter-label {
  font-size: 13px;
  color: #64748b;
  white-space: nowrap;
}
.audience-scope :deep(.el-radio-button__inner) {
  padding: 8px 16px;
}
.filter-input {
  width: 200px;
}
.filter-select {
  width: 130px;
}
.filter-select--class {
  width: 240px;
}
.filter-select--sort {
  width: 148px;
}

.practice-table :deep(.el-table__header th) {
  background: #f8fafc !important;
  color: #475569;
  font-weight: 600;
}
.practice-table :deep(.el-table__cell) {
  vertical-align: middle;
}

.empty-state {
  padding: 48px 24px;
  text-align: center;
}
.empty-state__icon {
  color: #cbd5e1;
  margin-bottom: 16px;
}
.empty-state__title {
  margin: 0 0 10px;
  font-size: 18px;
  font-weight: 600;
  color: #334155;
}
.empty-state__desc {
  margin: 0 auto 20px;
  max-width: 420px;
  font-size: 14px;
  line-height: 1.65;
  color: #64748b;
}

.name-cell__title {
  display: block;
  font-weight: 500;
  color: #0f172a;
}
.name-cell__sub {
  display: block;
  font-size: 12px;
  margin-top: 4px;
  color: #94a3b8;
}
.scope-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.scope-name {
  font-size: 12px;
  color: #64748b;
  line-height: 1.4;
}
.tag-scope-legacy {
  --el-tag-bg-color: #eff6ff;
  --el-tag-border-color: #bfdbfe;
  --el-tag-text-color: #1d4ed8;
}
.tag-scope-tc {
  --el-tag-bg-color: #f0fdf4;
  --el-tag-border-color: #bbf7d0;
  --el-tag-text-color: #15803d;
}

.structure-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.structure-main {
  font-weight: 500;
  color: #0f172a;
}
.structure-sub {
  font-size: 11px;
  color: #64748b;
}

.progress-cell {
  min-width: 120px;
}
.progress-text {
  display: block;
  font-size: 11px;
  color: #64748b;
  margin-top: 4px;
}

.tag-grade-auto {
  --el-tag-bg-color: #ecfdf5;
  --el-tag-border-color: #a7f3d0;
  --el-tag-text-color: #047857;
}
.tag-grade-mix {
  --el-tag-bg-color: #eff6ff;
  --el-tag-border-color: #bfdbfe;
  --el-tag-text-color: #1d4ed8;
}
.tag-grade-manual {
  --el-tag-bg-color: #fff7ed;
  --el-tag-border-color: #fed7aa;
  --el-tag-text-color: #c2410c;
}

.tag-phase-active {
  --el-tag-bg-color: #eff6ff;
  --el-tag-border-color: #bfdbfe;
  --el-tag-text-color: #1d4ed8;
}
.tag-phase-done {
  --el-tag-bg-color: #ecfdf5;
  --el-tag-border-color: #a7f3d0;
  --el-tag-text-color: #047857;
}
.tag-phase-soon {
  --el-tag-bg-color: #fff7ed;
  --el-tag-border-color: #fed7aa;
  --el-tag-text-color: #c2410c;
}
.tag-phase-closed {
  --el-tag-bg-color: #fef2f2;
  --el-tag-border-color: #fecaca;
  --el-tag-text-color: #b91c1c;
}
.tag-phase-draft {
  --el-tag-bg-color: #f1f5f9;
  --el-tag-border-color: #e2e8f0;
  --el-tag-text-color: #64748b;
}

.table-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
}
.text-danger {
  color: var(--el-color-danger);
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.text-warn {
  color: #ea580c;
}
.muted {
  color: #64748b;
  font-size: 12px;
}

.form-flow-hint {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 12px 14px;
  margin-bottom: 8px;
  background: #f8fafc;
  border-radius: 8px;
  border: 1px solid #eef2f7;
  font-size: 12px;
  color: #64748b;
}
.flow-step {
  color: #475569;
  font-weight: 500;
}
.form-inline-text {
  margin-left: 10px;
  font-size: 13px;
  color: #64748b;
}
.form-alert {
  margin-top: 0;
}
.tip {
  font-size: 12px;
  color: #64748b;
  line-height: 1.4;
  margin-top: 4px;
}

.qb-config-dialog :deep(.el-dialog__body) {
  padding-top: 12px;
}
.qb-config-hero {
  margin-bottom: 14px;
}
.qb-config-lead {
  margin: 0;
  font-size: 13px;
  line-height: 1.65;
  color: #64748b;
}
.qb-transfer-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.pro-transfer {
  --transfer-panel-w: 380px;
  --el-transfer-item-height: auto;
}
.pro-transfer :deep(.el-transfer-panel) {
  width: var(--transfer-panel-w);
}
.pro-transfer :deep(.el-transfer-panel__body) {
  height: 420px;
}
.pro-transfer :deep(.el-transfer__buttons) {
  padding: 0 12px;
}
.pro-transfer :deep(.el-transfer-panel__item.el-checkbox) {
  height: auto !important;
  min-height: 48px;
  margin-right: 0;
  padding: 10px 12px 10px 15px;
  align-items: flex-start;
  box-sizing: border-box;
  line-height: 1.45;
}
.pro-transfer :deep(.el-transfer-panel__item .el-checkbox__input) {
  top: 12px;
}
.pro-transfer :deep(.el-transfer-panel__item.el-checkbox .el-checkbox__label) {
  white-space: normal !important;
  line-height: 1.45 !important;
  height: auto !important;
  overflow: visible !important;
  text-overflow: unset !important;
  display: block;
  width: 100%;
  padding-left: 24px;
  box-sizing: border-box;
}
.qb-transfer-item {
  width: 100%;
  padding: 4px 0;
}
.qb-transfer-stem {
  font-size: 13px;
  line-height: 1.45;
  word-break: break-word;
}
.qb-transfer-meta {
  margin-top: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.qb-transfer-id,
.qb-transfer-score {
  font-size: 12px;
  color: #64748b;
}
.transfer-empty {
  padding: 24px 12px;
  font-size: 13px;
  color: #64748b;
  text-align: center;
  line-height: 1.6;
}

.mb12 {
  margin-bottom: 12px;
}
.mb16 {
  margin-bottom: 16px;
}
.ai-pop {
  max-height: 360px;
  overflow: auto;
}
.ai-pop-item + .ai-pop-item {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #e2e8f0;
}
.ai-pop-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 6px;
}
.ai-pop-body {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: #64748b;
}

.grade-drawer-body {
  padding-bottom: 24px;
}
.grade-hint {
  margin: 0 0 14px;
  font-size: 13px;
  color: #64748b;
  line-height: 1.5;
}
.grade-card {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 12px 14px;
  margin-bottom: 14px;
  background: #f8fafc;
}
.grade-card-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.grade-max {
  font-size: 12px;
  color: #64748b;
}
.grade-stem {
  font-size: 14px;
  line-height: 1.55;
  margin-bottom: 10px;
  word-break: break-word;
}
.grade-label {
  font-size: 12px;
  color: #64748b;
  margin-bottom: 4px;
}
.grade-label-inline {
  font-size: 13px;
  margin-right: 10px;
}
.grade-ans {
  margin: 0 0 10px;
  padding: 10px;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  background: #f1f5f9;
  border-radius: 6px;
  max-height: 220px;
  overflow: auto;
}
.grade-ai {
  font-size: 12px;
  color: #64748b;
  margin-bottom: 10px;
  line-height: 1.5;
}
.grade-ai-t {
  font-weight: 600;
  color: #0f172a;
  margin-right: 6px;
}
.grade-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.grade-drawer-actions {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
