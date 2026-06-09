<template>
  <div class="exam-workbench">
    <!-- 顶部标题区 -->
    <header class="workbench-head">
      <div class="workbench-head__main">
        <h1 class="workbench-title">在线考试</h1>
        <p class="workbench-subtitle">
          配置考试时间、时长、防作弊规则与组卷策略，支持考试发布、监考、阅卷和成绩导出
        </p>
      </div>
      <div class="workbench-head__actions">
        <el-button type="primary" size="large" :disabled="!audienceId" @click="openCreate">
          <el-icon><Plus /></el-icon>
          新建考试
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

    <!-- 筛选 + 列表 -->
    <div class="panel">
      <div class="panel__header">
        <div>
          <h2 class="panel__title">考试列表</h2>
          <span class="panel__meta">共 {{ displayedRows.length }} 场 · 当前班级筛选范围内</span>
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
        <el-input v-model="keywordSearch" clearable placeholder="搜索考试名称" class="filter-input">
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <el-select v-model="filterStatus" clearable placeholder="考试状态" class="filter-select">
          <el-option label="全部状态" value="" />
          <el-option label="未开始" value="upcoming" />
          <el-option label="进行中" value="active" />
          <el-option label="已结束" value="ended" />
          <el-option label="已发布" value="published" />
          <el-option label="草稿" value="draft" />
        </el-select>
        <el-select v-model="sortBy" placeholder="排序" class="filter-select filter-select--sort">
          <el-option label="开始时间 ↓" value="start_desc" />
          <el-option label="开始时间 ↑" value="start_asc" />
          <el-option label="创建顺序 ↓" value="id_desc" />
          <el-option label="创建顺序 ↑" value="id_asc" />
        </el-select>
      </div>

      <el-table
        v-loading="loading"
        :data="displayedRows"
        class="exam-table"
        border
        stripe
        empty-text="当前班级暂无考试，点击右上角「新建考试」开始配置"
      >
        <el-table-column prop="title" label="考试名称" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="exam-title-cell">{{ row.title }}</span>
          </template>
        </el-table-column>
        <el-table-column label="开始时间" width="172">
          <template #default="{ row }">{{ formatDateTime(row.start_at) }}</template>
        </el-table-column>
        <el-table-column label="结束时间" width="172">
          <template #default="{ row }">{{ formatDateTime(row.end_at) }}</template>
        </el-table-column>
        <el-table-column prop="duration_minutes" label="时长" width="80" align="center">
          <template #default="{ row }">{{ row.duration_minutes }} 分</template>
        </el-table-column>
        <el-table-column label="防作弊" width="100" align="center">
          <template #default="{ row }">
            <el-tag size="small" :class="row.anti_tab_switch ? 'tag-anti-on' : 'tag-anti-off'" effect="plain">
              {{ row.anti_tab_switch ? '防切屏' : '未开启' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="108" align="center">
          <template #default="{ row }">
            <el-tag size="small" :class="examPhaseTagClass(row)" effect="plain">
              {{ examPhaseLabel(row) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220" align="right" fixed="right">
          <template #default="{ row }">
            <div class="table-actions">
              <el-button type="primary" size="small" link @click="openEdit(row)">
                <el-icon><Edit /></el-icon> 编辑
              </el-button>
              <el-button type="primary" size="small" link @click="configure(row)">
                <el-icon><Setting /></el-icon> 组卷
              </el-button>
              <el-dropdown trigger="click" @command="(cmd) => handleRowMore(cmd, row)">
                <el-button size="small" link type="info">
                  更多 <el-icon class="el-icon--right"><ArrowDown /></el-icon>
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="preview">
                      <el-icon><View /></el-icon> 试卷预览
                    </el-dropdown-item>
                    <el-dropdown-item command="monitor">
                      <el-icon><Monitor /></el-icon> 监考
                    </el-dropdown-item>
                    <el-dropdown-item command="scores">
                      <el-icon><DataAnalysis /></el-icon> 成绩
                    </el-dropdown-item>
                    <el-dropdown-item command="export">
                      <el-icon><Download /></el-icon> 导出成绩
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

    <!-- 新建/编辑考试 -->
    <el-dialog v-model="dlg" :title="currentId ? '编辑考试' : '新建考试'" width="560px" destroy-on-close>
      <el-form label-width="120px">
        <el-form-item label="名称"><el-input v-model="form.title" /></el-form-item>
        <el-form-item label="说明"><el-input v-model="form.instructions" type="textarea" :rows="2" /></el-form-item>
        <el-form-item label="开始时间">
          <el-date-picker v-model="form.start_at" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" style="width: 100%" />
        </el-form-item>
        <el-form-item label="结束时间">
          <el-date-picker v-model="form.end_at" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" style="width: 100%" />
        </el-form-item>
        <el-form-item label="考试时长(分)"><el-input-number v-model="form.duration_minutes" :min="5" :max="600" /></el-form-item>
        <el-form-item label="提前交卷(分)">
          <el-input-number v-model="form.early_submit_minutes" :min="0" :max="120" />
          <span class="tip">结束前多少分钟内才允许交卷；0 表示不限制</span>
        </el-form-item>
        <el-form-item label="打乱题目"><el-switch v-model="form.shuffle_questions" /></el-form-item>
        <el-form-item label="打乱选项"><el-switch v-model="form.shuffle_options" /></el-form-item>
        <el-form-item label="防切屏"><el-switch v-model="form.anti_tab_switch" /></el-form-item>
        <el-form-item label="切屏上限"><el-input-number v-model="form.tab_switch_limit" :min="1" :max="20" /></el-form-item>
        <el-form-item label="成绩公布">
          <el-date-picker v-model="form.publish_scores_at" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" style="width: 100%" clearable />
        </el-form-item>
        <el-form-item label="IP 白名单">
          <el-input v-model="form.ip_allowlist" placeholder="可选，逗号分隔" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg = false">取消</el-button>
        <el-button type="primary" @click="saveExam">保存</el-button>
      </template>
    </el-dialog>

    <!-- 试卷配置工作台 -->
    <el-dialog
      v-model="qDlg"
      class="paper-config-dlg"
      width="1180px"
      destroy-on-close
      align-center
      :show-close="true"
    >
      <template #header>
        <div class="paper-dlg-head">
          <div>
            <h3 class="paper-dlg-title">试卷题目配置</h3>
            <p class="paper-dlg-desc">
              从题库中编辑本场试卷题目与顺序，右侧列表自上而下为实际出题顺序
            </p>
          </div>
          <div class="paper-dlg-stats">
            <span class="stat-chip">题库 <strong>{{ allQuestions.length }}</strong> 题</span>
            <span class="stat-chip stat-chip--primary">已选 <strong>{{ pickedQ.length }}</strong> 题</span>
            <span class="stat-chip">总分 <strong>{{ pickedTotalScore }}</strong> 分</span>
            <el-button size="small" type="primary" plain :icon="View" :disabled="!currentId" @click="openPaperPreviewByCurrent">
              预览试卷
            </el-button>
          </div>
        </div>
      </template>

      <el-tabs v-model="composeTab" class="compose-tabs">
        <el-tab-pane label="手动组卷" name="manual">
          <div class="paper-three-col">
            <!-- 左：候选题库 -->
            <div class="paper-col paper-col--pool">
              <div class="col-head">
                <span class="col-title">题库候选</span>
                <span class="col-meta">{{ candidateQuestions.length }} 题可选</span>
              </div>
              <div class="col-filters">
                <el-select v-model="transferFilterType" clearable placeholder="题型" size="small">
                  <el-option label="全部题型" value="" />
                  <el-option v-for="t in transferTypeOpts" :key="t.v" :label="t.l" :value="t.v" />
                </el-select>
                <el-select v-model="candidateDifficulty" clearable placeholder="难度" size="small">
                  <el-option label="易" value="easy" />
                  <el-option label="中" value="medium" />
                  <el-option label="难" value="hard" />
                </el-select>
                <el-input v-model="candidateTag" clearable placeholder="标签关键词" size="small" />
                <el-input v-model="candidateSearch" clearable placeholder="搜索题干 / ID" size="small">
                  <template #prefix><el-icon><Search /></el-icon></template>
                </el-input>
              </div>
              <div class="question-scroll">
                <div v-if="!candidateQuestions.length" class="col-empty">暂无候选题目，请调整筛选或先录入题库</div>
                <div v-for="q in candidateQuestions" :key="q.key" class="q-card q-card--pool">
                  <div class="q-card-stem" :title="String(q.stem)">{{ clipStemTwoLine(q.stem) }}</div>
                  <div class="q-card-meta">
                    <el-tag size="small" type="primary" effect="plain">{{ qbTypeLabel(q.type) }}</el-tag>
                    <el-tag size="small" :type="qbDifficultyTagType(q.difficulty)" effect="light">
                      {{ qbDifficultyLabel(q.difficulty) }}
                    </el-tag>
                    <span class="q-id">ID {{ q.key }}</span>
                    <span class="q-score">{{ q.score ?? '—' }} 分</span>
                  </div>
                  <el-button size="small" type="primary" plain class="q-add-btn" @click="addToPaper(q.key)">
                    加入
                  </el-button>
                </div>
              </div>
            </div>

            <!-- 中：操作区 -->
            <div class="paper-col paper-col--actions">
              <div class="action-stack">
                <el-button type="primary" :disabled="!candidateQuestions.length" @click="addAllVisible">
                  加入 &gt;
                </el-button>
                <el-button :disabled="!pickedQ.length" @click="removeAllPicked">&lt; 移除</el-button>
                <el-divider />
                <el-button :disabled="!canMoveUp" @click="movePickedUp(selectedPickedIdx)">上移</el-button>
                <el-button :disabled="!canMoveDown" @click="movePickedDown(selectedPickedIdx)">下移</el-button>
                <el-divider />
                <el-button type="danger" plain :disabled="!pickedQ.length" @click="clearPicked">清空已选</el-button>
              </div>
              <p class="action-hint">点击右侧题目可选中后调整顺序</p>
            </div>

            <!-- 右：已选结构 -->
            <div class="paper-col paper-col--picked">
              <div class="picked-overview">
                <div class="overview-row">
                  <span>已选 <strong>{{ pickedQ.length }}</strong> 题</span>
                  <span>总分 <strong>{{ pickedTotalScore }}</strong></span>
                </div>
                <div v-if="pickedTypeStats.length" class="type-chips">
                  <span v-for="t in pickedTypeStats" :key="t.v" class="type-chip">
                    {{ t.l }} {{ t.count }}
                  </span>
                </div>
                <div v-else class="type-chips muted">尚未选题</div>
              </div>
              <div class="col-head">
                <span class="col-title">本场试卷结构</span>
              </div>
              <div class="question-scroll">
                <div v-if="!pickedQuestionsDetailed.length" class="col-empty">
                  从左侧加入题目，或使用「随机组卷」标签页快速填充
                </div>
                <div
                  v-for="(q, idx) in pickedQuestionsDetailed"
                  :key="q.key"
                  class="q-card q-card--picked"
                  :class="{ 'q-card--selected': selectedPickedIdx === idx }"
                  @click="selectedPickedIdx = idx"
                >
                  <div class="q-picked-head">
                    <span class="q-index">{{ idx + 1 }}</span>
                    <el-tag size="small" type="primary" effect="plain">{{ qbTypeLabel(q.type) }}</el-tag>
                    <span class="q-score">{{ q.score ?? '—' }} 分</span>
                  </div>
                  <div class="q-card-stem" :title="String(q.stem)">{{ clipStemTwoLine(q.stem) }}</div>
                  <div class="q-picked-actions">
                    <el-button link size="small" :disabled="idx === 0" @click.stop="movePickedUp(idx)">上移</el-button>
                    <el-button link size="small" :disabled="idx === pickedQ.length - 1" @click.stop="movePickedDown(idx)">下移</el-button>
                    <el-button link size="small" type="danger" @click.stop="removeFromPaper(q.key)">删除</el-button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </el-tab-pane>

        <el-tab-pane label="随机组卷" name="random">
          <div class="random-panel">
            <p class="random-lead">
              按题型设定抽题数量（各 0～100），可限制难度与知识点标签。预览满意后写入试卷；直接随机写入将覆盖当前已选题目。
            </p>
            <div class="rand-counts-grid">
              <div v-for="t in transferTypeOpts" :key="t.v" class="rand-count-cell">
                <span class="rand-count-label">{{ t.l }}</span>
                <el-input-number v-model="randomCounts[t.v]" :min="0" :max="100" size="small" controls-position="right" />
              </div>
            </div>
            <div class="rand-row">
              <span class="rand-label">难度限制</span>
              <el-select v-model="randomDifficulty" clearable placeholder="不限" style="width: 120px">
                <el-option label="易" value="easy" />
                <el-option label="中" value="medium" />
                <el-option label="难" value="hard" />
              </el-select>
              <span class="rand-label">标签 / 知识点</span>
              <el-input v-model="randomTag" placeholder="关键词" clearable style="width: 280px" />
            </div>
            <div class="rand-actions">
              <el-button :disabled="!currentId" :loading="randomPreviewLoading" type="primary" plain @click="doRandomPreview">
                预览抽题结果
              </el-button>
              <el-button :disabled="!currentId" :loading="randomPickLoading" type="warning" plain @click="doRandomPickDirect">
                跳过预览直接随机写入
              </el-button>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>

      <template #footer>
        <div class="paper-dlg-footer">
          <div class="footer-summary">
            <template v-if="pickedQ.length">
              当前试卷：<strong>{{ pickedQ.length }}</strong> 题 · 总分 <strong>{{ pickedTotalScore }}</strong> 分
            </template>
            <span v-else class="footer-warn">尚未配置题目，保存后学生将无法开始考试</span>
          </div>
          <div class="footer-btns">
            <el-button @click="qDlg = false">取消</el-button>
            <el-button type="primary" @click="saveQuestions">保存</el-button>
            <el-button type="primary" plain :disabled="!pickedQ.length" @click="saveQuestionsAndPreview">保存并预览</el-button>
          </div>
        </div>
      </template>
    </el-dialog>

    <!-- 成绩 / 批改 -->
    <el-dialog v-model="aDlg" title="考试作答 / 批改" width="960px" destroy-on-close align-center>
      <el-alert
        v-if="!gradingSubjective.length"
        type="info"
        show-icon
        :closable="false"
        title="本场考试仅含客观题，交卷后由系统自动判分，无需教师主观批改。"
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
            <el-button v-if="gradingSubjective.length" link type="primary" size="small" @click="openGradeExam(row)">
              批改主观题
            </el-button>
            <el-button
              v-if="gradingSubjective.length && row.ai_suggestion?.items?.length"
              link
              type="warning"
              size="small"
              @click="adoptExamAi(row)"
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
        <p class="grade-hint">请为下列简答/编程题评定得分（0～满分）。</p>
        <div v-for="(it, idx) in gradingSubjective" :key="it.eq_id" class="grade-card">
          <div class="grade-card-head">
            <el-tag size="small" type="primary" effect="plain">{{ qbTypeLabel(it.type) }}</el-tag>
            <span class="grade-max">第 {{ idx + 1 }} 题 · 满分 {{ it.max_score }} 分</span>
          </div>
          <div class="grade-stem">{{ it.stem }}</div>
          <div class="grade-label">学生作答</div>
          <pre class="grade-ans">{{ studentExamAnswerText(gAttempt, it.eq_id) }}</pre>
          <div v-if="aiHintForEq(gAttempt, it.eq_id)" class="grade-ai">
            <span class="grade-ai-t">AI 参考</span>
            {{ aiHintForEq(gAttempt, it.eq_id) }}
          </div>
          <div class="grade-row">
            <span class="grade-label-inline">评定得分</span>
            <el-input-number
              v-model="gScores[String(it.eq_id)]"
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
          <el-button type="primary" :loading="gradeSaving" @click="saveGradeExam">保存批改</el-button>
        </div>
      </div>
    </el-drawer>

    <el-dialog v-model="paperDlg" title="试卷预览" width="920px" destroy-on-close align-center class="paper-preview-dlg">
      <el-skeleton v-if="paperLoading" :rows="8" animated />
      <template v-else>
        <p class="paper-preview-lead">{{ paperExamTitle }} · 共 <strong>{{ paperRows.length }}</strong> 题（顺序即学生作答顺序）</p>
        <el-table v-if="paperRows.length" :data="paperRows" size="small" border stripe max-height="520">
          <el-table-column type="index" label="#" width="52" align="center" />
          <el-table-column label="题型" width="100" align="center">
            <template #default="{ row }">
              <el-tag size="small" type="primary" effect="plain">{{ qbTypeLabel(row.type) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="难度" width="88" align="center">
            <template #default="{ row }">
              <el-tag size="small" :type="qbDifficultyTagType(row.difficulty)" effect="light">{{ qbDifficultyLabel(row.difficulty) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="分值" width="80" align="right">
            <template #default="{ row }">{{ row.max_score }}</template>
          </el-table-column>
          <el-table-column label="题干摘要" min-width="240" show-overflow-tooltip>
            <template #default="{ row }">{{ clipStem(row.stem) }}</template>
          </el-table-column>
        </el-table>
        <el-empty v-else description="本场尚未配置题目" />
      </template>
    </el-dialog>

    <el-dialog v-model="randomPreviewDlg" title="随机抽题预览" width="920px" destroy-on-close align-center>
      <p class="hint preview-hint">
        以下为按当前规则随机抽中的题目（每次预览结果可能不同）。确认后「写入试卷」将覆盖已选题目。
      </p>
      <el-table v-if="randomPreviewRows.length" :data="randomPreviewRows" size="small" border stripe max-height="440">
        <el-table-column type="index" label="#" width="52" align="center" />
        <el-table-column label="题型" width="100" align="center">
          <template #default="{ row }">
            <el-tag size="small" type="primary" effect="plain">{{ qbTypeLabel(row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="难度" width="88" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="qbDifficultyTagType(row.difficulty)" effect="light">{{ qbDifficultyLabel(row.difficulty) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="默认分" width="88" align="right">
          <template #default="{ row }">{{ row.default_score }}</template>
        </el-table-column>
        <el-table-column label="题干摘要" min-width="240" show-overflow-tooltip>
          <template #default="{ row }">{{ clipStem(row.stem) }}</template>
        </el-table-column>
      </el-table>
      <el-empty v-else description="当前条件下没有抽到题目，请增加数量或放宽难度/标签" />
      <template #footer>
        <el-button @click="randomPreviewDlg = false">关闭</el-button>
        <el-button type="primary" :loading="randomApplyLoading" :disabled="!lastPreviewQuestionIds.length" @click="applyRandomPreview">
          写入试卷
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, reactive } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  Edit,
  Setting,
  View,
  DataAnalysis,
  Download,
  Delete,
  Plus,
  Monitor,
  Search,
  ArrowDown,
  Document,
  CircleCheck,
  Timer,
  Finished,
  EditPen,
} from '@element-plus/icons-vue'
import { getMyTeachingOverview } from '../../api/class'
import { listMyTeachingClasses } from '../../api/teachingClass'
import {
  listTeacherExams,
  createExam,
  updateExam,
  deleteExam,
  getExamTeacher,
  setExamQuestions,
  listExamAttempts,
  gradeExamAttempt,
  listQuestions,
  exportExamScores,
  previewExamRandomPick,
  randomPickExamQuestions,
  adoptExamAiScores,
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
import { formatDateTime, formatDateTimePicker } from '../../utils/format'
import { useRtOnDomains } from '../../composables/useRtOnDomains'

const router = useRouter()
const route = useRoute()

const legacyClasses = ref([])
const teachingClasses = ref([])
const audienceScope = ref('legacy')
const audienceId = ref(null)
const keywordSearch = ref('')
const filterStatus = ref('')
const sortBy = ref('start_desc')
const pendingGradeByExamId = reactive({})

const audienceOptions = computed(() => {
  if (audienceScope.value === 'teaching') {
    return teachingClasses.value.map((tc) => ({
      id: tc.id,
      label: [tc.class_name, tc.course_name].filter(Boolean).join(' · '),
    }))
  }
  return legacyClasses.value.map((c) => ({
    id: c.id,
    label: c.class_name,
  }))
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

function examTimePhase(row) {
  if (row.status !== 'published') return 'draft'
  const now = Date.now()
  const start = new Date(row.start_at).getTime()
  const end = new Date(row.end_at).getTime()
  if (Number.isNaN(start) || Number.isNaN(end)) return 'published'
  if (now < start) return 'upcoming'
  if (now > end) return 'ended'
  return 'active'
}

function examPhaseLabel(row) {
  const phase = examTimePhase(row)
  const map = {
    upcoming: '未开始',
    active: '进行中',
    ended: '已结束',
    draft: '草稿',
    published: '已发布',
  }
  return map[phase] || '已发布'
}

function examPhaseTagClass(row) {
  const phase = examTimePhase(row)
  return {
    'tag-phase-upcoming': phase === 'upcoming',
    'tag-phase-active': phase === 'active',
    'tag-phase-ended': phase === 'ended' || phase === 'published',
    'tag-phase-draft': phase === 'draft',
  }
}

const metricCards = computed(() => {
  const list = rows.value
  const published = list.filter((r) => r.status === 'published').length
  const active = list.filter((r) => examTimePhase(r) === 'active').length
  const ended = list.filter((r) => examTimePhase(r) === 'ended').length
  const pending = Object.values(pendingGradeByExamId).reduce((s, n) => s + (Number(n) || 0), 0)
  return [
    { key: 'total', label: '考试总数', value: list.length, icon: Document, tone: 'blue', hint: '当前班级' },
    { key: 'published', label: '已发布', value: published, icon: CircleCheck, tone: 'slate', hint: '' },
    { key: 'active', label: '进行中', value: active, icon: Timer, tone: 'green', hint: '' },
    { key: 'ended', label: '已结束', value: ended, icon: Finished, tone: 'gray', hint: '' },
    {
      key: 'pending',
      label: '待批改',
      value: pending,
      icon: EditPen,
      tone: 'orange',
      hint: pending ? '待阅答卷' : '打开成绩页后统计',
    },
  ]
})

const displayedRows = computed(() => {
  let list = [...rows.value]
  const kw = keywordSearch.value.trim().toLowerCase()
  if (kw) {
    list = list.filter((r) => String(r.title || '').toLowerCase().includes(kw))
  }
  if (filterStatus.value) {
    if (filterStatus.value === 'draft') {
      list = list.filter((r) => r.status !== 'published')
    } else if (filterStatus.value === 'published') {
      list = list.filter((r) => r.status === 'published')
    } else {
      list = list.filter((r) => examTimePhase(r) === filterStatus.value)
    }
  }
  const sort = sortBy.value
  list.sort((a, b) => {
    if (sort === 'start_asc' || sort === 'start_desc') {
      const ta = new Date(a.start_at).getTime() || 0
      const tb = new Date(b.start_at).getTime() || 0
      return sort === 'start_asc' ? ta - tb : tb - ta
    }
    const ia = Number(a.id) || 0
    const ib = Number(b.id) || 0
    return sort === 'id_asc' ? ia - ib : ib - ia
  })
  return list
})

function handleRowMore(cmd, row) {
  if (cmd === 'preview') openPaperPreview(row)
  else if (cmd === 'monitor') openExamMonitor(row)
  else if (cmd === 'scores') viewAttempts(row)
  else if (cmd === 'export') exportX(row)
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
const allQuestions = ref([])
const pickedQ = ref([])
const composeTab = ref('manual')
const candidateSearch = ref('')
const candidateDifficulty = ref('')
const candidateTag = ref('')
const selectedPickedIdx = ref(0)
const transferFilterType = ref('')
const transferTypeOpts = [
  { v: 'single', l: '单选题' },
  { v: 'multi', l: '多选题' },
  { v: 'judge', l: '判断题' },
  { v: 'fill', l: '填空题' },
  { v: 'short', l: '简答题' },
  { v: 'code', l: '编程题' },
]

const questionById = computed(() => {
  const m = new Map()
  for (const q of allQuestions.value) {
    m.set(String(q.id), q)
  }
  return m
})

const transferData = computed(() =>
  allQuestions.value.map((q) => ({
    key: String(q.id),
    label: `[${qbTypeLabel(q.type)}] ${String(q.stem).slice(0, 36)}`,
    stem: q.stem,
    type: q.type,
    difficulty: q.difficulty,
    score: q.default_score,
    knowledge_tag: q.knowledge_tag,
    tags: q.tags,
  }))
)

const pickedSet = computed(() => new Set(pickedQ.value))

const candidateQuestions = computed(() =>
  transferData.value.filter((q) => {
    if (pickedSet.value.has(q.key)) return false
    if (transferFilterType.value && q.type !== transferFilterType.value) return false
    if (candidateDifficulty.value && q.difficulty !== candidateDifficulty.value) return false
    if (candidateTag.value) {
      const tag = candidateTag.value.trim().toLowerCase()
      const raw = questionById.value.get(q.key)
      const hay = [q.knowledge_tag, raw?.knowledge_tag, raw?.tags, q.tags]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!hay.includes(tag)) return false
    }
    if (candidateSearch.value) {
      const s = candidateSearch.value.trim().toLowerCase()
      if (!String(q.stem || '').toLowerCase().includes(s) && !String(q.key).includes(s)) return false
    }
    return true
  })
)

const pickedQuestionsDetailed = computed(() =>
  pickedQ.value.map((key) => transferData.value.find((q) => q.key === key)).filter(Boolean)
)

const pickedTotalScore = computed(() =>
  pickedQuestionsDetailed.value.reduce((sum, q) => sum + (Number(q.score) || 0), 0)
)

const pickedTypeStats = computed(() => {
  const counts = {}
  for (const q of pickedQuestionsDetailed.value) {
    counts[q.type] = (counts[q.type] || 0) + 1
  }
  return transferTypeOpts.filter((t) => counts[t.v]).map((t) => ({ ...t, count: counts[t.v] }))
})

const canMoveUp = computed(() => selectedPickedIdx.value > 0 && pickedQ.value.length > 0)
const canMoveDown = computed(
  () => selectedPickedIdx.value >= 0 && selectedPickedIdx.value < pickedQ.value.length - 1
)

function addToPaper(key) {
  if (!pickedSet.value.has(key)) pickedQ.value.push(key)
}

function removeFromPaper(key) {
  pickedQ.value = pickedQ.value.filter((k) => k !== key)
  if (selectedPickedIdx.value >= pickedQ.value.length) {
    selectedPickedIdx.value = Math.max(0, pickedQ.value.length - 1)
  }
}

function movePickedUp(idx) {
  const i = idx ?? selectedPickedIdx.value
  if (i <= 0) return
  const arr = [...pickedQ.value]
  ;[arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]
  pickedQ.value = arr
  selectedPickedIdx.value = i - 1
}

function movePickedDown(idx) {
  const i = idx ?? selectedPickedIdx.value
  if (i >= pickedQ.value.length - 1) return
  const arr = [...pickedQ.value]
  ;[arr[i], arr[i + 1]] = [arr[i + 1], arr[i]]
  pickedQ.value = arr
  selectedPickedIdx.value = i + 1
}

function addAllVisible() {
  for (const q of candidateQuestions.value) addToPaper(q.key)
}

async function clearPicked() {
  if (!pickedQ.value.length) return
  try {
    await ElMessageBox.confirm('确定清空本场已选全部题目？', '清空已选', { type: 'warning' })
    pickedQ.value = []
    selectedPickedIdx.value = 0
  } catch {
    /* cancel */
  }
}

async function removeAllPicked() {
  await clearPicked()
}

const openExamMonitor = (row) => {
  if (!audienceId.value) {
    ElMessage.warning('请先选择班级')
    return
  }
  const query =
    audienceScope.value === 'teaching'
      ? { teachingClassId: audienceId.value }
      : { classId: audienceId.value }
  router.push({ path: `/teacher/qbank/exams/${row.id}/monitor`, query })
}

function clipStem(s) {
  const t = String(s || '').replace(/\s+/g, ' ').trim()
  if (t.length <= 72) return t || '（无题干）'
  return `${t.slice(0, 72)}…`
}

function clipStemTwoLine(s) {
  const t = String(s || '').replace(/\s+/g, ' ').trim()
  if (t.length <= 96) return t || '（无题干）'
  return `${t.slice(0, 96)}…`
}

const form = ref({
  title: '',
  instructions: '',
  start_at: '',
  end_at: '',
  duration_minutes: 90,
  early_submit_minutes: 0,
  shuffle_questions: false,
  shuffle_options: false,
  anti_tab_switch: false,
  tab_switch_limit: 3,
  publish_scores_at: '',
  ip_allowlist: '',
})

const randomCounts = reactive({
  single: 0,
  multi: 0,
  judge: 0,
  fill: 0,
  short: 0,
  code: 0,
})
const randomDifficulty = ref('')
const randomTag = ref('')
const randomPreviewLoading = ref(false)
const randomPickLoading = ref(false)
const randomApplyLoading = ref(false)
const randomPreviewDlg = ref(false)
const randomPreviewRows = ref([])
const lastPreviewQuestionIds = ref([])
const paperDlg = ref(false)
const paperLoading = ref(false)
const paperRows = ref([])
const paperExamTitle = ref('')

const gradeDrawerTitle = computed(() => {
  if (!gAttempt.value) return '主观题批改'
  return `主观题批改 · ${gAttempt.value.real_name || ''}`
})

const fmtScore = (v) => {
  if (v == null || v === '') return '—'
  const n = Number(v)
  return Number.isFinite(n) ? n.toFixed(2) : '—'
}

function studentExamAnswerText(attempt, eqId) {
  const ans =
    attempt?.answers && typeof attempt.answers === 'object' ? attempt.answers : parseJsonLoose(attempt?.answers) || {}
  const t = ans[String(eqId)]
  return t != null && t !== '' ? String(t) : '（未作答）'
}

function aiHintForEq(attempt, eqId) {
  const per =
    attempt?.per_question_scores && typeof attempt.per_question_scores === 'object'
      ? attempt.per_question_scores
      : parseJsonLoose(attempt?.per_question_scores) || {}
  const cur = per[String(eqId)]
  if (!cur) return ''
  const parts = []
  if (Number.isFinite(Number(cur.ai_suggested_score))) parts.push(`建议 ${cur.ai_suggested_score} 分`)
  if (cur.ai_rationale) parts.push(String(cur.ai_rationale))
  return parts.join(' · ') || ''
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
  if (!audienceId.value) return
  loading.value = true
  try {
    const res = await listTeacherExams(audienceListParams())
    if (res.success) rows.value = res.data || []
  } finally {
    loading.value = false
  }
}

const openCreate = () => {
  currentId.value = null
  form.value = {
    title: '',
    instructions: '',
    start_at: '',
    end_at: '',
    duration_minutes: 90,
    early_submit_minutes: 0,
    shuffle_questions: false,
    shuffle_options: false,
    anti_tab_switch: false,
    tab_switch_limit: 3,
    publish_scores_at: '',
    ip_allowlist: '',
  }
  dlg.value = true
}

const openEdit = (row) => {
  currentId.value = row.id
  form.value = {
    title: row.title,
    instructions: row.instructions || '',
    start_at: formatDateTimePicker(row.start_at),
    end_at: formatDateTimePicker(row.end_at),
    duration_minutes: row.duration_minutes,
    early_submit_minutes: row.early_submit_minutes,
    shuffle_questions: !!row.shuffle_questions,
    shuffle_options: !!row.shuffle_options,
    anti_tab_switch: !!row.anti_tab_switch,
    tab_switch_limit: row.tab_switch_limit,
    publish_scores_at: row.publish_scores_at ? formatDateTimePicker(row.publish_scores_at) : '',
    ip_allowlist: row.ip_allowlist || '',
  }
  dlg.value = true
}

const saveExam = async () => {
  if (!audienceId.value) return
  const payload = {
    ...audienceCreatePayload(),
    ...form.value,
    status: 'published',
    publish_scores_at: form.value.publish_scores_at || null,
  }
  try {
    if (currentId.value) {
      await updateExam(currentId.value, payload)
    } else {
      await createExam(payload)
    }
    ElMessage.success('已保存')
    dlg.value = false
    load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '失败')
  }
}

function buildRandomRules() {
  return {
    counts_by_type: {
      single: randomCounts.single,
      multi: randomCounts.multi,
      judge: randomCounts.judge,
      fill: randomCounts.fill,
      short: randomCounts.short,
      code: randomCounts.code,
    },
    difficulty: randomDifficulty.value || undefined,
    knowledge_tag: randomTag.value?.trim() || undefined,
  }
}

function mapExamQuestionsToPaperRows(qs) {
  return (qs || []).map((q) => ({
    type: q.type,
    stem: q.stem,
    difficulty: q.difficulty,
    max_score: Number(q.score) || Number(q.default_score) || 0,
  }))
}

const openPaperPreview = async (row) => {
  paperLoading.value = true
  paperDlg.value = true
  paperRows.value = []
  try {
    const det = await getExamTeacher(row.id)
    if (det.success) {
      paperExamTitle.value = det.data?.exam?.title || row.title || '试卷预览'
      paperRows.value = mapExamQuestionsToPaperRows(det.data?.questions || [])
    }
  } catch {
    ElMessage.error('加载试卷失败')
  } finally {
    paperLoading.value = false
  }
}

const openPaperPreviewByCurrent = async () => {
  if (!currentId.value) return
  const row = rows.value.find((r) => r.id === currentId.value)
  await openPaperPreview({ id: currentId.value, title: row?.title || '本场考试' })
}

const configure = async (row) => {
  currentId.value = row.id
  composeTab.value = 'manual'
  candidateSearch.value = ''
  candidateDifficulty.value = ''
  candidateTag.value = ''
  selectedPickedIdx.value = 0
  transferTypeOpts.forEach((t) => {
    randomCounts[t.v] = 0
  })
  randomDifficulty.value = ''
  randomTag.value = ''
  lastPreviewQuestionIds.value = []
  randomPreviewRows.value = []
  transferFilterType.value = ''
  const res = await listQuestions({ page: 1, pageSize: 500 })
  if (res.success) allQuestions.value = res.data || []
  const det = await getExamTeacher(row.id)
  if (det.success) {
    pickedQ.value = (det.data.questions || []).map((q) => String(q.question_id))
  }
  qDlg.value = true
}

const doRandomPreview = async () => {
  if (!currentId.value) return
  randomPreviewLoading.value = true
  lastPreviewQuestionIds.value = []
  randomPreviewRows.value = []
  try {
    const res = await previewExamRandomPick(currentId.value, { rules: buildRandomRules() })
    if (!res.success) {
      ElMessage.error(res.message || '预览失败')
      return
    }
    randomPreviewRows.value = res.data?.questions || []
    lastPreviewQuestionIds.value = res.data?.question_ids || []
    randomPreviewDlg.value = true
    if (!randomPreviewRows.value.length) ElMessage.info('当前条件下未抽到题目，请放宽难度或标签')
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '预览失败')
  } finally {
    randomPreviewLoading.value = false
  }
}

const applyRandomPreview = async () => {
  if (!currentId.value || !lastPreviewQuestionIds.value.length) return
  randomApplyLoading.value = true
  try {
    await randomPickExamQuestions(currentId.value, { question_ids: lastPreviewQuestionIds.value })
    ElMessage.success('已按预览写入试卷')
    randomPreviewDlg.value = false
    composeTab.value = 'manual'
    const det = await getExamTeacher(currentId.value)
    if (det.success) {
      pickedQ.value = (det.data.questions || []).map((q) => String(q.question_id))
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '写入失败')
  } finally {
    randomApplyLoading.value = false
  }
}

const doRandomPickDirect = async () => {
  if (!currentId.value) return
  try {
    await ElMessageBox.confirm(
      '将按当前题型数量与筛选条件重新随机抽题，并覆盖本场全部题目（与预览结果可能不同）。是否继续？',
      '直接随机写入',
      { type: 'warning' }
    )
  } catch {
    return
  }
  randomPickLoading.value = true
  try {
    await randomPickExamQuestions(currentId.value, { rules: buildRandomRules() })
    ElMessage.success('已随机组卷')
    composeTab.value = 'manual'
    const det = await getExamTeacher(currentId.value)
    if (det.success) {
      pickedQ.value = (det.data.questions || []).map((q) => String(q.question_id))
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '随机组卷失败')
  } finally {
    randomPickLoading.value = false
  }
}

const saveQuestions = async () => {
  const items = pickedQ.value.map((id) => ({ questionId: Number(id), score: null }))
  try {
    await setExamQuestions(currentId.value, items)
    ElMessage.success('已保存')
    qDlg.value = false
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '失败')
  }
}

const saveQuestionsAndPreview = async () => {
  const items = pickedQ.value.map((id) => ({ questionId: Number(id), score: null }))
  try {
    await setExamQuestions(currentId.value, items)
    ElMessage.success('已保存')
    qDlg.value = false
    await openPaperPreviewByCurrent()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '失败')
  }
}

const viewAttempts = async (row) => {
  currentId.value = row.id
  try {
    const [res, det] = await Promise.all([listExamAttempts(row.id), getExamTeacher(row.id)])
    if (!res.success) return
    attempts.value = res.data || []
    pendingGradeByExamId[row.id] = (res.data || []).filter((a) => a.status === 'submitted').length
    const qs = det.success ? det.data?.questions || [] : []
    gradingSubjective.value = qs
      .filter((q) => q.type === 'short' || q.type === 'code')
      .map((q) => ({
        eq_id: q.id,
        type: q.type,
        stem: q.stem,
        max_score: Number(q.score) || Number(q.default_score) || 0,
      }))
    gDlg.value = false
    gAttempt.value = null
    aDlg.value = true
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '加载失败')
  }
}

const openGradeExam = (row) => {
  gAttempt.value = row
  Object.keys(gScores).forEach((k) => delete gScores[k])
  const per =
    row.per_question_scores && typeof row.per_question_scores === 'object'
      ? row.per_question_scores
      : parseJsonLoose(row.per_question_scores) || {}
  for (const it of gradingSubjective.value) {
    const k = String(it.eq_id)
    const cur = per[k]
    gScores[k] = Number.isFinite(Number(cur?.earned)) ? Number(cur.earned) : null
  }
  gDlg.value = true
}

const onGradeDrawerClosed = () => {
  gAttempt.value = null
  Object.keys(gScores).forEach((k) => delete gScores[k])
}

const saveGradeExam = async () => {
  if (!gAttempt.value) return
  const subjectiveScores = {}
  for (let i = 0; i < gradingSubjective.value.length; i++) {
    const it = gradingSubjective.value[i]
    const k = String(it.eq_id)
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
    await gradeExamAttempt(currentId.value, gAttempt.value.id, subjectiveScores)
    ElMessage.success('批改已保存')
    gDlg.value = false
    await viewAttempts({ id: currentId.value })
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '保存失败')
  } finally {
    gradeSaving.value = false
  }
}

const adoptExamAi = async (row) => {
  try {
    await adoptExamAiScores(currentId.value, row.id, {})
    ElMessage.success('已按 AI 建议写入得分，可再打开「批改主观题」微调')
    await viewAttempts({ id: currentId.value })
    if (gDlg.value && gAttempt.value && gAttempt.value.id === row.id) {
      const fresh = attempts.value.find((a) => a.id === row.id)
      if (fresh) openGradeExam(fresh)
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '采纳失败')
  }
}

const exportX = async (row) => {
  try {
    const blob = await exportExamScores(row.id)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `exam-${row.id}-scores.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    ElMessage.error('导出失败')
  }
}

const remove = async (row) => {
  try {
    await ElMessageBox.confirm('确定删除该考试？', '确认', { type: 'warning' })
    await deleteExam(row.id)
    ElMessage.success('已删除')
    load()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('删除失败')
  }
}

onMounted(async () => {
  await loadClasses()
  const qc = Number(route.query.classId)
  const qtc = Number(route.query.teachingClassId)
  if (Number.isFinite(qtc) && qtc > 0) {
    audienceScope.value = 'teaching'
    if (teachingClasses.value.some((t) => Number(t.id) === qtc)) audienceId.value = qtc
  } else if (Number.isFinite(qc) && qc > 0) {
    audienceScope.value = 'legacy'
    if (legacyClasses.value.some((c) => Number(c.id) === qc)) audienceId.value = qc
  }
  await load()
})

useRtOnDomains(['qb_exams', 'qb_questions', 'scores'], () => {
  void load()
})
</script>

<style scoped>
.exam-workbench {
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
  max-width: 640px;
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

.exam-table :deep(.el-table__header th) {
  background: #f8fafc !important;
  color: #475569;
  font-weight: 600;
}
.exam-table :deep(.el-table__cell) {
  vertical-align: middle;
}
.exam-title-cell {
  font-weight: 500;
  color: #0f172a;
}
.table-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  flex-wrap: nowrap;
}
.text-danger {
  color: var(--el-color-danger);
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.tag-anti-on {
  --el-tag-bg-color: #fff7ed;
  --el-tag-border-color: #fed7aa;
  --el-tag-text-color: #c2410c;
}
.tag-anti-off {
  --el-tag-bg-color: #f8fafc;
  --el-tag-border-color: #e2e8f0;
  --el-tag-text-color: #94a3b8;
}
.tag-phase-upcoming {
  --el-tag-bg-color: #eff6ff;
  --el-tag-border-color: #bfdbfe;
  --el-tag-text-color: #1d4ed8;
}
.tag-phase-active {
  --el-tag-bg-color: #ecfdf5;
  --el-tag-border-color: #a7f3d0;
  --el-tag-text-color: #047857;
}
.tag-phase-ended {
  --el-tag-bg-color: #f1f5f9;
  --el-tag-border-color: #e2e8f0;
  --el-tag-text-color: #64748b;
}
.tag-phase-draft {
  --el-tag-bg-color: #f8fafc;
  --el-tag-border-color: #cbd5e1;
  --el-tag-text-color: #475569;
}

.tip {
  margin-left: 8px;
  font-size: 12px;
  color: #64748b;
}
.muted {
  color: #64748b;
  font-size: 12px;
}
.mb12 {
  margin-bottom: 12px;
}
.mb16 {
  margin-bottom: 16px;
}

/* 试卷配置弹窗 */
.paper-config-dlg :deep(.el-dialog__header) {
  padding: 18px 20px 12px;
  margin-right: 0;
  border-bottom: 1px solid #eef2f7;
}
.paper-config-dlg :deep(.el-dialog__body) {
  padding: 0 20px 12px;
}
.paper-config-dlg :deep(.el-dialog__footer) {
  padding: 12px 20px 18px;
  border-top: 1px solid #eef2f7;
}
.paper-dlg-head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding-right: 24px;
}
.paper-dlg-title {
  margin: 0 0 6px;
  font-size: 18px;
  font-weight: 600;
  color: #0f172a;
}
.paper-dlg-desc {
  margin: 0;
  font-size: 13px;
  color: #64748b;
  line-height: 1.55;
  max-width: 520px;
}
.paper-dlg-stats {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.stat-chip {
  font-size: 13px;
  color: #64748b;
  padding: 6px 12px;
  background: #f8fafc;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}
.stat-chip strong {
  color: #0f172a;
  font-weight: 600;
}
.stat-chip--primary {
  background: #eff6ff;
  border-color: #bfdbfe;
  color: #1d4ed8;
}
.stat-chip--primary strong {
  color: #1d4ed8;
}

.compose-tabs :deep(.el-tabs__header) {
  margin-bottom: 12px;
}
.paper-three-col {
  display: grid;
  grid-template-columns: 1fr 120px 1fr;
  gap: 12px;
  min-height: 460px;
}
@media (max-width: 960px) {
  .paper-three-col {
    grid-template-columns: 1fr;
  }
  .paper-col--actions {
    flex-direction: row !important;
    flex-wrap: wrap;
  }
}
.paper-col {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #fafbfc;
  display: flex;
  flex-direction: column;
  min-height: 420px;
  overflow: hidden;
}
.paper-col--actions {
  background: #fff;
  border-style: dashed;
  align-items: center;
  justify-content: center;
  padding: 16px 10px;
}
.col-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid #eef2f7;
  background: #fff;
}
.col-title {
  font-size: 13px;
  font-weight: 600;
  color: #0f172a;
}
.col-meta {
  font-size: 12px;
  color: #94a3b8;
}
.col-filters {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding: 10px 12px;
  background: #fff;
  border-bottom: 1px solid #eef2f7;
}
.col-filters .el-input:last-child {
  grid-column: 1 / -1;
}
.question-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  max-height: 380px;
}
.col-empty {
  padding: 32px 16px;
  text-align: center;
  font-size: 13px;
  color: #94a3b8;
  line-height: 1.6;
}

.q-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 8px;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.q-card--pool:hover {
  border-color: #93c5fd;
}
.q-card--picked {
  cursor: pointer;
}
.q-card--picked.q-card--selected {
  border-color: #2563eb;
  box-shadow: 0 0 0 1px #2563eb;
}
.q-card-stem {
  font-size: 13px;
  line-height: 1.5;
  color: #334155;
  word-break: break-word;
  margin-bottom: 8px;
}
.q-card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  margin-bottom: 8px;
}
.q-id,
.q-score {
  font-size: 11px;
  color: #94a3b8;
}
.q-add-btn {
  width: 100%;
}
.q-picked-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.q-index {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: #eff6ff;
  color: #2563eb;
  font-size: 12px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.q-picked-actions {
  display: flex;
  gap: 4px;
  margin-top: 6px;
}

.action-stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}
.action-stack .el-button {
  margin: 0;
  width: 100%;
}
.action-hint {
  margin: 14px 0 0;
  font-size: 11px;
  color: #94a3b8;
  text-align: center;
  line-height: 1.45;
}

.picked-overview {
  padding: 12px;
  background: #fff;
  border-bottom: 1px solid #eef2f7;
}
.overview-row {
  display: flex;
  gap: 16px;
  font-size: 13px;
  color: #64748b;
  margin-bottom: 8px;
}
.overview-row strong {
  color: #0f172a;
}
.type-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.type-chip {
  font-size: 11px;
  padding: 2px 8px;
  background: #f1f5f9;
  border-radius: 4px;
  color: #475569;
}

.random-panel {
  padding: 4px 0 8px;
}
.random-lead {
  margin: 0 0 16px;
  font-size: 13px;
  color: #64748b;
  line-height: 1.6;
}
.rand-counts-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}
@media (max-width: 720px) {
  .rand-counts-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
.rand-count-cell {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  background: #fff;
}
.rand-count-label {
  font-size: 13px;
  color: #64748b;
}
.rand-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
}
.rand-label {
  font-size: 13px;
  color: #64748b;
}
.rand-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.paper-dlg-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}
.footer-summary {
  font-size: 13px;
  color: #64748b;
}
.footer-summary strong {
  color: #0f172a;
}
.footer-warn {
  color: #ea580c;
}
.footer-btns {
  display: flex;
  gap: 8px;
}

.hint {
  font-size: 13px;
  color: #64748b;
  margin: 0 0 12px;
}
.preview-hint {
  line-height: 1.55;
}
.paper-preview-lead {
  margin: 0 0 14px;
  font-size: 14px;
  color: #64748b;
}
.paper-preview-lead strong {
  color: #2563eb;
  font-weight: 600;
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

<style>
.exam-workbench {
  background: transparent;
}
</style>
