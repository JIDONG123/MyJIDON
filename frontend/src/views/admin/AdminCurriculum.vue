<template>
  <div class="page-curriculum-admin">
    <header class="page-head">
      <h1 class="page-title">课程与实训监管</h1>
      <p class="page-desc">
        专业 / 学期 / 课程维护，教学班全生命周期监管，项目模板与实训日历总览
      </p>
    </header>

    <!-- 数据概览 -->
    <section class="overview-grid">
      <div v-for="item in overviewCards" :key="item.key" class="overview-card">
        <span class="ov-label">{{ item.label }}</span>
        <span class="ov-value" :class="item.accent">{{ item.value }}</span>
      </div>
    </section>

    <!-- Tab 监管区 -->
    <el-card class="main-card" shadow="never">
      <el-tabs v-model="tab" class="reg-tabs" @tab-change="onTabChange">
        <!-- 专业 -->
        <el-tab-pane label="专业" name="majors">
          <CurriculumToolbar
            v-model:keyword="filters.majors.keyword"
            v-model:college="filters.majors.college"
            v-model:status="filters.majors.status"
            :college-options="collegeOptions"
            show-college
            show-status
            add-label="新增专业"
            @add="openMajor()"
          />
          <CurriculumDataTable
            :rows="pagedMajors"
            :loading="loadingMajors"
            empty-text="暂无数据，请点击新增进行配置"
            :total="filteredMajors.length"
            v-model:page="pages.majors"
            v-model:page-size="pageSize"
          >
            <el-table-column prop="code" label="专业代码" width="110" />
            <el-table-column prop="name" label="专业名称" min-width="140" show-overflow-tooltip />
            <el-table-column prop="college" label="所属学院" min-width="120" show-overflow-tooltip>
              <template #default="{ row }">{{ row.college || '—' }}</template>
            </el-table-column>
            <el-table-column label="课程数" width="88" align="center">
              <template #default="{ row }">{{ row._courseCount ?? '—' }}</template>
            </el-table-column>
            <el-table-column label="教学班数" width="96" align="center">
              <template #default="{ row }">{{ row._tcCount ?? '—' }}</template>
            </el-table-column>
            <el-table-column label="状态" width="88" align="center">
              <template #default="{ row }">
                <el-tag size="small" :type="isStatusOff(row.status) ? 'info' : 'success'" effect="plain">
                  {{ isStatusOff(row.status) ? '停用' : '启用' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="200" align="right" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" @click="openMajor(row)">编辑</el-button>
                <el-button link type="primary" @click="goCoursesByMajor(row.id)">查看课程</el-button>
                <el-button link class="btn-danger-link" @click="delMajor(row.id)">删除</el-button>
              </template>
            </el-table-column>
          </CurriculumDataTable>
        </el-tab-pane>

        <!-- 学期 -->
        <el-tab-pane label="学期" name="terms">
          <CurriculumToolbar
            v-model:keyword="filters.terms.keyword"
            :show-search="true"
            add-label="新增学期"
            @add="openTerm()"
          />
          <CurriculumDataTable
            :rows="pagedTerms"
            :loading="loadingTerms"
            empty-text="暂无数据，请点击新增进行配置"
            :total="filteredTerms.length"
            v-model:page="pages.terms"
            v-model:page-size="pageSize"
          >
            <el-table-column prop="name" label="学期名称" min-width="160" show-overflow-tooltip />
            <el-table-column label="起止时间" min-width="180">
              <template #default="{ row }">{{ formatTermRange(row) }}</template>
            </el-table-column>
            <el-table-column label="当前学期" width="100" align="center">
              <template #default="{ row }">
                <el-tag v-if="row.is_current" size="small" type="primary" effect="light">当前</el-tag>
                <span v-else class="cell-muted">—</span>
              </template>
            </el-table-column>
            <el-table-column label="课程数" width="88" align="center">
              <template #default="{ row }">{{ row._courseCount ?? '—' }}</template>
            </el-table-column>
            <el-table-column label="教学班数" width="96" align="center">
              <template #default="{ row }">{{ row._tcCount ?? '—' }}</template>
            </el-table-column>
            <el-table-column label="任务数" width="88" align="center">
              <template #default="{ row }">{{ row._taskCount ?? '—' }}</template>
            </el-table-column>
            <el-table-column label="状态" width="88" align="center">
              <template #default="{ row }">
                <el-tag v-if="row.is_current" size="small" type="success" effect="plain">进行中</el-tag>
                <el-tag v-else size="small" type="info" effect="plain">历史</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="140" align="right" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" @click="openTerm(row)">编辑</el-button>
                <el-button link class="btn-danger-link" @click="delTerm(row.id)">删除</el-button>
              </template>
            </el-table-column>
          </CurriculumDataTable>
        </el-tab-pane>

        <!-- 课程 -->
        <el-tab-pane label="课程" name="courses">
          <CurriculumToolbar
            v-model:keyword="filters.courses.keyword"
            v-model:major-id="filters.courses.majorId"
            v-model:status="filters.courses.status"
            :major-options="majors"
            show-major
            show-status
            add-label="新增课程"
            @add="openCourse()"
          />
          <CurriculumDataTable
            :rows="pagedCourses"
            :loading="loadingCourses"
            empty-text="暂无数据，请点击新增进行配置"
            :total="filteredCourses.length"
            v-model:page="pages.courses"
            v-model:page-size="pageSize"
          >
            <el-table-column prop="course_code" label="课程代码" width="110" />
            <el-table-column prop="course_name" label="课程名称" min-width="150" show-overflow-tooltip />
            <el-table-column prop="major_name" label="所属专业" min-width="120" show-overflow-tooltip>
              <template #default="{ row }">{{ row.major_name || '—' }}</template>
            </el-table-column>
            <el-table-column prop="leader_name" label="课程负责人" width="110" show-overflow-tooltip>
              <template #default="{ row }">{{ row.leader_name || '—' }}</template>
            </el-table-column>
            <el-table-column label="教学班数" width="96" align="center">
              <template #default="{ row }">{{ row._tcCount ?? '—' }}</template>
            </el-table-column>
            <el-table-column label="项目模板数" width="108" align="center">
              <template #default="{ row }">{{ row._tplCount ?? '—' }}</template>
            </el-table-column>
            <el-table-column label="实训任务数" width="108" align="center">
              <template #default="{ row }">{{ row._taskCount ?? '—' }}</template>
            </el-table-column>
            <el-table-column label="状态" width="88" align="center">
              <template #default="{ row }">
                <el-tag size="small" :type="isStatusOff(row.status) ? 'info' : 'success'" effect="plain">
                  {{ isStatusOff(row.status) ? '停用' : '启用' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="260" align="right" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" @click="goTeachingByCourse(row.id)">查看教学班</el-button>
                <el-button link type="primary" @click="goTemplatesByCourse(row.id)">查看模板</el-button>
                <el-button link type="primary" @click="openCourse(row)">编辑</el-button>
                <el-button link class="btn-danger-link" @click="delCourse(row.id)">删除</el-button>
              </template>
            </el-table-column>
          </CurriculumDataTable>
        </el-tab-pane>

        <!-- 教学班监管 -->
        <el-tab-pane label="教学班监管" name="teaching-classes">
          <CurriculumToolbar
            v-model:keyword="filters.tc.keyword"
            v-model:course-id="filters.tc.courseId"
            v-model:term-id="filters.tc.termId"
            v-model:status="filters.tc.status"
            :course-options="courses"
            :term-options="terms"
            show-course
            show-term
            show-status
            add-label="新建教学班"
            @add="openTc()"
          />
          <CurriculumDataTable
            :rows="pagedTeachingClasses"
            :loading="loadingTc"
            empty-text="暂无数据，请点击新增进行配置"
            :total="filteredTeachingClasses.length"
            v-model:page="pages.tc"
            v-model:page-size="pageSize"
          >
            <el-table-column prop="class_name" label="教学班名称" min-width="140" show-overflow-tooltip />
            <el-table-column prop="course_name" label="所属课程" min-width="120" show-overflow-tooltip />
            <el-table-column prop="term_name" label="学期" width="120" show-overflow-tooltip />
            <el-table-column label="主讲教师" width="100" show-overflow-tooltip>
              <template #default="{ row }">{{ row._leadTeacher || '—' }}</template>
            </el-table-column>
            <el-table-column prop="student_count" label="学生数" width="80" align="center" />
            <el-table-column label="企业导师" width="96" align="center">
              <template #default="{ row }">
                <el-tag v-if="row._hasEnterprise" size="small" type="success" effect="plain">已配置</el-tag>
                <el-tag v-else size="small" type="warning" effect="plain">未配置</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="任务数" width="80" align="center">
              <template #default="{ row }">{{ row._taskCount ?? 0 }}</template>
            </el-table-column>
            <el-table-column label="提交率" width="120">
              <template #default="{ row }">
                <div v-if="row._submitRate != null && !Number.isNaN(row._submitRate)" class="progress-cell">
                  <el-progress :percentage="clampPercent(row._submitRate)" :stroke-width="6" />
                </div>
                <span v-else class="cell-muted">—</span>
              </template>
            </el-table-column>
            <el-table-column label="批改进度" width="120">
              <template #default="{ row }">
                <div v-if="row._gradeRate != null && !Number.isNaN(row._gradeRate)" class="progress-cell">
                  <el-progress :percentage="clampPercent(row._gradeRate)" :stroke-width="6" />
                </div>
                <span v-else class="cell-muted">—</span>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="88" align="center">
              <template #default="{ row }">
                <el-tag size="small" :type="isStatusOff(row.status) ? 'info' : 'success'" effect="plain">
                  {{ isStatusOff(row.status) ? '停用' : '启用' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="200" align="right" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" @click="goTcDetail(row.id)">成员</el-button>
                <el-button link type="primary" @click="openTc(row)">编辑</el-button>
                <el-button link class="btn-danger-link" @click="delTc(row.id)">删除</el-button>
              </template>
            </el-table-column>
          </CurriculumDataTable>
        </el-tab-pane>

        <!-- 项目模板 -->
        <el-tab-pane label="项目模板" name="templates">
          <CurriculumToolbar
            v-model:keyword="filters.templates.keyword"
            v-model:course-id="filters.templates.courseId"
            v-model:status="filters.templates.status"
            :course-options="courses"
            show-course
            show-status
            add-label="新增模板"
            @add="openTplCreate()"
          />
          <CurriculumDataTable
            :rows="pagedTemplates"
            :loading="loadingTpl"
            empty-text="暂无数据，请点击新增进行配置"
            :total="filteredTemplates.length"
            v-model:page="pages.templates"
            v-model:page-size="pageSize"
          >
            <el-table-column prop="project_name" label="模板名称" min-width="150" show-overflow-tooltip />
            <el-table-column prop="course_name" label="所属课程" min-width="120" show-overflow-tooltip />
            <el-table-column label="评价维度数" width="100" align="center">
              <template #default="{ row }">{{ row._metricCount ?? '—' }}</template>
            </el-table-column>
            <el-table-column label="企业标准" width="96" align="center">
              <template #default="{ row }">
                <el-tag size="small" :type="row._hasEnterpriseStd ? 'success' : 'warning'" effect="plain">
                  {{ row._hasEnterpriseStd ? '已配置' : '未配置' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="建议材料" width="96" align="center">
              <template #default="{ row }">
                <el-tag size="small" :type="row._hasMaterials ? 'success' : 'warning'" effect="plain">
                  {{ row._hasMaterials ? '已配置' : '未配置' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="使用次数" width="88" align="center">
              <template #default="{ row }">{{ row._useCount ?? 0 }}</template>
            </el-table-column>
            <el-table-column prop="creator_name" label="创建人" width="100" show-overflow-tooltip />
            <el-table-column label="状态" width="88" align="center">
              <template #default="{ row }">
                <el-tag size="small" :type="isStatusOff(row.status) ? 'info' : 'success'" effect="plain">
                  {{ isStatusOff(row.status) ? '停用' : '启用' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="240" align="right" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" @click="viewTpl(row)">查看详情</el-button>
                <el-button link type="primary" @click="openSpawn(row)">生成任务</el-button>
                <el-button link type="primary" @click="openTplEdit(row)">编辑</el-button>
                <el-button link class="btn-danger-link" @click="delTpl(row.id)">删除</el-button>
              </template>
            </el-table-column>
          </CurriculumDataTable>
        </el-tab-pane>

        <!-- 实训日历 -->
        <el-tab-pane label="实训日历" name="schedules">
          <CurriculumToolbar
            v-model:keyword="filters.schedules.keyword"
            v-model:course-id="filters.schedules.courseId"
            v-model:term-id="filters.schedules.termId"
            v-model:teaching-class-id="filters.schedules.teachingClassId"
            :course-options="courses"
            :term-options="terms"
            :teaching-class-options="teachingClasses"
            show-course
            show-term
            show-teaching-class
          />
          <CurriculumDataTable
            :rows="pagedSchedules"
            :loading="loadingSched"
            empty-text="暂无数据，请先在教学班中维护实训日历"
            :total="filteredSchedules.length"
            v-model:page="pages.schedules"
            v-model:page-size="pageSize"
          >
            <el-table-column prop="week_no" label="周次" width="70" align="center" />
            <el-table-column label="星期" width="72" align="center">
              <template #default="{ row }">周{{ row.weekday }}</template>
            </el-table-column>
            <el-table-column label="节次" width="90" align="center">
              <template #default="{ row }">{{ formatPeriod(row) }}</template>
            </el-table-column>
            <el-table-column prop="teaching_class_name" label="教学班" min-width="120" show-overflow-tooltip />
            <el-table-column label="课程" min-width="120" show-overflow-tooltip>
              <template #default="{ row }">{{ row._courseName || '—' }}</template>
            </el-table-column>
            <el-table-column prop="location" label="地点" width="100" show-overflow-tooltip>
              <template #default="{ row }">{{ row.location || '—' }}</template>
            </el-table-column>
            <el-table-column label="关联任务" min-width="130" show-overflow-tooltip>
              <template #default="{ row }">
                <el-tag v-if="!row.task_id && !row.task_title" size="small" type="warning" effect="plain">未关联</el-tag>
                <span v-else>{{ row.task_title || '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="任课教师" width="100" show-overflow-tooltip>
              <template #default="{ row }">{{ row._teacherName || '—' }}</template>
            </el-table-column>
            <el-table-column label="状态" width="88" align="center">
              <template #default="{ row }">
                <el-tag v-if="row.task_id" size="small" type="success" effect="plain">已关联</el-tag>
                <el-tag v-else size="small" type="warning" effect="plain">待关联</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="120" align="right" fixed="right">
              <template #default="{ row }">
                <el-button v-if="row.task_id" link type="primary" @click="goTasksByTc(row.teaching_class_id)">查看任务</el-button>
                <el-button v-else link type="primary" @click="goTeachingByCourse(row._courseId)">去配置</el-button>
              </template>
            </el-table-column>
          </CurriculumDataTable>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <!-- 对话框：专业 / 学期 / 课程 / 教学班（保持原逻辑） -->
    <el-dialog v-model="majorDlg" :title="majorForm.id ? '编辑专业' : '新增专业'" width="480px">
      <el-form label-width="80px">
        <el-form-item label="代码"><el-input v-model="majorForm.code" /></el-form-item>
        <el-form-item label="名称"><el-input v-model="majorForm.name" /></el-form-item>
        <el-form-item label="学院"><el-input v-model="majorForm.college" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="majorDlg = false">取消</el-button>
        <el-button type="primary" @click="saveMajor">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="termDlg" :title="termForm.id ? '编辑学期' : '新增学期'" width="480px">
      <el-form label-width="80px">
        <el-form-item label="名称"><el-input v-model="termForm.name" /></el-form-item>
        <el-form-item label="学年"><el-input-number v-model="termForm.year" :min="2020" :max="2035" /></el-form-item>
        <el-form-item label="季节">
          <el-select v-model="termForm.season" style="width: 100%">
            <el-option label="春季" value="spring" />
            <el-option label="秋季" value="autumn" />
          </el-select>
        </el-form-item>
        <el-form-item label="当前学期"><el-switch v-model="termForm.isCurrent" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="termDlg = false">取消</el-button>
        <el-button type="primary" @click="saveTerm">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="courseDlg" :title="courseForm.id ? '编辑课程' : '新增课程'" width="520px">
      <el-form label-width="90px">
        <el-form-item label="课程代码"><el-input v-model="courseForm.courseCode" /></el-form-item>
        <el-form-item label="课程名称"><el-input v-model="courseForm.courseName" /></el-form-item>
        <el-form-item label="专业">
          <el-select v-model="courseForm.majorId" clearable style="width: 100%">
            <el-option v-for="m in majors" :key="m.id" :label="m.name" :value="m.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="负责人">
          <el-select v-model="courseForm.leaderId" clearable filterable style="width: 100%">
            <el-option v-for="t in teachers" :key="t.id" :label="t.real_name" :value="t.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="课程目标"><el-input v-model="courseForm.courseGoal" type="textarea" :rows="2" /></el-form-item>
        <el-form-item label="能力目标"><el-input v-model="courseForm.abilityGoals" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="courseDlg = false">取消</el-button>
        <el-button type="primary" @click="saveCourse">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="tcDlg" :title="tcForm.id ? '编辑教学班' : '新建教学班'" width="540px">
      <el-form label-width="100px">
        <el-form-item label="课程" required>
          <el-select v-model="tcForm.courseId" filterable :disabled="!!tcForm.id" style="width: 100%">
            <el-option v-for="c in courses" :key="c.id" :label="`${c.course_code} ${c.course_name}`" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="学期" required>
          <el-select v-model="tcForm.termId" filterable :disabled="!!tcForm.id" style="width: 100%">
            <el-option v-for="t in terms" :key="t.id" :label="t.name" :value="t.id" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="!tcForm.id" label="主讲教师" required>
          <el-select v-model="tcForm.leadTeacherId" filterable style="width: 100%">
            <el-option v-for="t in teachers" :key="t.id" :label="t.real_name" :value="t.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="班代码" required><el-input v-model="tcForm.classCode" /></el-form-item>
        <el-form-item label="班名称" required><el-input v-model="tcForm.className" /></el-form-item>
        <el-form-item label="地点"><el-input v-model="tcForm.location" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="tcDlg = false">取消</el-button>
        <el-button type="primary" @click="saveTc">保存</el-button>
      </template>
    </el-dialog>

    <!-- 模板详情 / 编辑 / 生成任务 -->
    <el-dialog v-model="tplDetailDlg" title="项目模板详情" width="560px">
      <dl v-if="tplDetail" class="detail-dl">
        <div><dt>名称</dt><dd>{{ tplDetail.project_name }}</dd></div>
        <div><dt>课程</dt><dd>{{ tplDetail.course_name }}</dd></div>
        <div><dt>描述</dt><dd>{{ tplDetail.description || '—' }}</dd></div>
        <div><dt>企业标准</dt><dd>{{ tplDetail.enterprise_standard || '—' }}</dd></div>
        <div><dt>建议材料</dt><dd>{{ tplDetail.suggested_materials || '—' }}</dd></div>
      </dl>
    </el-dialog>

    <el-dialog v-model="tplEditDlg" :title="tplForm.id ? '编辑模板' : '新增模板'" width="560px">
      <el-form label-width="100px">
        <el-form-item label="所属课程" required>
          <el-select v-model="tplForm.courseId" filterable style="width: 100%">
            <el-option v-for="c in courses" :key="c.id" :label="c.course_name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="模板名称" required><el-input v-model="tplForm.projectName" /></el-form-item>
        <el-form-item label="描述"><el-input v-model="tplForm.description" type="textarea" :rows="2" /></el-form-item>
        <el-form-item label="企业标准"><el-input v-model="tplForm.enterpriseStandard" type="textarea" :rows="2" /></el-form-item>
        <el-form-item label="建议材料"><el-input v-model="tplForm.suggestedMaterials" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="tplEditDlg = false">取消</el-button>
        <el-button type="primary" @click="saveTpl">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="spawnDlg" title="从模板生成任务" width="480px">
      <el-form label-width="100px">
        <el-form-item label="教学班" required>
          <el-select v-model="spawnForm.teachingClassId" filterable style="width: 100%">
            <el-option
              v-for="tc in spawnTcOptions"
              :key="tc.id"
              :label="`${tc.class_name}（${tc.course_name}）`"
              :value="tc.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="截止时间" required>
          <el-date-picker v-model="spawnForm.deadline" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" style="width: 100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="spawnDlg = false">取消</el-button>
        <el-button type="primary" :loading="spawnLoading" @click="confirmSpawn">生成</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CurriculumToolbar from '../../components/admin/CurriculumToolbar.vue'
import CurriculumDataTable from '../../components/admin/CurriculumDataTable.vue'
import { listMajors, createMajor, updateMajor, deleteMajor } from '../../api/major'
import { listTerms, createTerm, updateTerm, deleteTerm } from '../../api/term'
import { listCourses, createCourse, updateCourse, deleteCourse } from '../../api/course'
import {
  listTeachingClasses,
  createTeachingClass,
  updateTeachingClass,
  deleteTeachingClass,
  getTeachingClass,
} from '../../api/teachingClass'
import {
  listProjectTemplates,
  getProjectTemplate,
  createProjectTemplate,
  updateProjectTemplate,
  deleteProjectTemplate,
  spawnTaskFromTemplate,
} from '../../api/projectTemplate'
import { listCalendar } from '../../api/schedule'
import { getAllTasks } from '../../api/task'
import { getTeacherUsers } from '../../api/user'
import { formatDateTime } from '../../utils/format'
import { ElMessage, ElMessageBox } from 'element-plus'

function isStatusOff(status) {
  return status === 0 || status === '0'
}

function clampPercent(v) {
  return Math.min(100, Math.max(0, Math.round(Number(v))))
}

const route = useRoute()
const router = useRouter()
const tab = ref(route.query.tab || 'majors')
const pageSize = ref(10)
const pages = reactive({ majors: 1, terms: 1, courses: 1, tc: 1, templates: 1, schedules: 1 })

const majors = ref([])
const terms = ref([])
const courses = ref([])
const teachers = ref([])
const teachingClasses = ref([])
const templates = ref([])
const schedules = ref([])
const tasks = ref([])
const tcMetaMap = ref({})

const loadingMajors = ref(false)
const loadingTerms = ref(false)
const loadingCourses = ref(false)
const loadingTc = ref(false)
const loadingTpl = ref(false)
const loadingSched = ref(false)

const filters = reactive({
  majors: { keyword: '', college: '', status: '' },
  terms: { keyword: '' },
  courses: { keyword: '', majorId: null, status: '' },
  tc: { keyword: '', courseId: null, termId: null, status: '' },
  templates: { keyword: '', courseId: null, status: '' },
  schedules: { keyword: '', courseId: null, termId: null, teachingClassId: null },
})

function parseMetrics(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw)
      return Array.isArray(p) ? p : []
    } catch {
      return []
    }
  }
  return []
}

function countTasksBy(field, id) {
  if (id == null) return 0
  return tasks.value.filter((t) => Number(t[field]) === Number(id)).length
}

function tcTasks(tcId) {
  return tasks.value.filter((t) => Number(t.teaching_class_id) === Number(tcId))
}

function calcSubmitGradeRates(tcId) {
  const list = tcTasks(tcId)
  if (!list.length) return { submit: null, grade: null }
  let submitNum = 0
  let submitDen = 0
  let gradeNum = 0
  let gradeDen = 0
  list.forEach((t) => {
    const aud = Number(t.audienceStudentCount ?? t.audience_student_count ?? 0)
    const sub = Number(t.submittedStudentCount ?? t.submitted_student_count ?? 0)
    const subs = Number(t.submissionCount ?? t.submission_count ?? 0)
    if (aud > 0) {
      submitDen += aud
      submitNum += sub
    }
    if (subs > 0) {
      gradeDen += subs
      gradeNum += subs
    }
  })
  return {
    submit: submitDen > 0 ? (submitNum / submitDen) * 100 : null,
    grade: gradeDen > 0 ? Math.min(100, (gradeNum / gradeDen) * 50) : null,
  }
}

const enrichedMajors = computed(() =>
  majors.value.map((m) => ({
    ...m,
    _courseCount: courses.value.filter((c) => Number(c.major_id) === Number(m.id)).length,
    _tcCount: teachingClasses.value.filter((tc) => {
      const c = courses.value.find((co) => Number(co.id) === Number(tc.course_id))
      return c && Number(c.major_id) === Number(m.id)
    }).length,
  }))
)

const enrichedTerms = computed(() =>
  terms.value.map((t) => {
    const tcs = teachingClasses.value.filter((tc) => Number(tc.term_id) === Number(t.id))
    const courseIds = new Set(tcs.map((tc) => tc.course_id))
    return {
      ...t,
      _tcCount: tcs.length,
      _courseCount: courseIds.size,
      _taskCount: tasks.value.filter((tk) => tcs.some((tc) => Number(tk.teaching_class_id) === Number(tc.id))).length,
    }
  })
)

const enrichedCourses = computed(() =>
  courses.value.map((c) => ({
    ...c,
    _tcCount: teachingClasses.value.filter((tc) => Number(tc.course_id) === Number(c.id)).length,
    _tplCount: templates.value.filter((tpl) => Number(tpl.course_id) === Number(c.id)).length,
    _taskCount: countTasksBy('course_id', c.id),
  }))
)

const enrichedTeachingClasses = computed(() =>
  teachingClasses.value.map((tc) => {
    const meta = tcMetaMap.value[tc.id] || {}
    const rates = calcSubmitGradeRates(tc.id)
    return {
      ...tc,
      _leadTeacher: meta.leadTeacher || '',
      _hasEnterprise: !!meta.hasEnterprise,
      _taskCount: tcTasks(tc.id).length,
      _submitRate: rates.submit,
      _gradeRate: rates.grade,
    }
  })
)

const enrichedTemplates = computed(() =>
  templates.value.map((tpl) => ({
    ...tpl,
    _metricCount: parseMetrics(tpl.evaluation_metrics).length,
    _hasEnterpriseStd: !!(tpl.enterprise_standard && String(tpl.enterprise_standard).trim()),
    _hasMaterials: !!(tpl.suggested_materials && String(tpl.suggested_materials).trim()),
    _useCount: tasks.value.filter((t) => Number(t.project_template_id) === Number(tpl.id)).length,
  }))
)

const enrichedSchedules = computed(() =>
  schedules.value.map((s) => {
    const tc = teachingClasses.value.find((x) => Number(x.id) === Number(s.teaching_class_id))
    const meta = tc ? tcMetaMap.value[tc.id] : null
    return {
      ...s,
      _courseName: tc?.course_name || '',
      _courseId: tc?.course_id || null,
      _teacherName: meta?.leadTeacher || '',
    }
  })
)

function filterByKeyword(list, keyword, fields) {
  const kw = String(keyword || '').trim().toLowerCase()
  if (!kw) return list
  return list.filter((row) => fields.some((f) => String(row[f] ?? '').toLowerCase().includes(kw)))
}

function filterByStatus(list, status) {
  if (status === '' || status == null) return list
  return list.filter((row) => String(row.status) === String(status))
}

const filteredMajors = computed(() => {
  let list = enrichedMajors.value
  if (filters.majors.college) list = list.filter((m) => m.college === filters.majors.college)
  list = filterByStatus(list, filters.majors.status)
  return filterByKeyword(list, filters.majors.keyword, ['code', 'name', 'college'])
})

const filteredTerms = computed(() => filterByKeyword(enrichedTerms.value, filters.terms.keyword, ['name']))

const filteredCourses = computed(() => {
  let list = enrichedCourses.value
  if (filters.courses.majorId) list = list.filter((c) => Number(c.major_id) === Number(filters.courses.majorId))
  list = filterByStatus(list, filters.courses.status)
  return filterByKeyword(list, filters.courses.keyword, ['course_code', 'course_name', 'major_name'])
})

const filteredTeachingClasses = computed(() => {
  let list = enrichedTeachingClasses.value
  if (filters.tc.courseId) list = list.filter((tc) => Number(tc.course_id) === Number(filters.tc.courseId))
  if (filters.tc.termId) list = list.filter((tc) => Number(tc.term_id) === Number(filters.tc.termId))
  list = filterByStatus(list, filters.tc.status)
  return filterByKeyword(list, filters.tc.keyword, ['class_name', 'class_code', 'course_name'])
})

const filteredTemplates = computed(() => {
  let list = enrichedTemplates.value
  if (filters.templates.courseId) list = list.filter((t) => Number(t.course_id) === Number(filters.templates.courseId))
  list = filterByStatus(list, filters.templates.status)
  return filterByKeyword(list, filters.templates.keyword, ['project_name', 'course_name'])
})

const filteredSchedules = computed(() => {
  let list = enrichedSchedules.value
  if (filters.schedules.courseId) list = list.filter((s) => Number(s._courseId) === Number(filters.schedules.courseId))
  if (filters.schedules.termId) {
    list = list.filter((s) => {
      const tc = teachingClasses.value.find((x) => Number(x.id) === Number(s.teaching_class_id))
      return tc && Number(tc.term_id) === Number(filters.schedules.termId)
    })
  }
  if (filters.schedules.teachingClassId) {
    list = list.filter((s) => Number(s.teaching_class_id) === Number(filters.schedules.teachingClassId))
  }
  return filterByKeyword(list, filters.schedules.keyword, ['teaching_class_name', 'task_title', 'title', 'location'])
})

function paginate(list, pageKey) {
  const p = pages[pageKey] || 1
  const start = (p - 1) * pageSize.value
  return list.slice(start, start + pageSize.value)
}

const pagedMajors = computed(() => paginate(filteredMajors.value, 'majors'))
const pagedTerms = computed(() => paginate(filteredTerms.value, 'terms'))
const pagedCourses = computed(() => paginate(filteredCourses.value, 'courses'))
const pagedTeachingClasses = computed(() => paginate(filteredTeachingClasses.value, 'tc'))
const pagedTemplates = computed(() => paginate(filteredTemplates.value, 'templates'))
const pagedSchedules = computed(() => paginate(filteredSchedules.value, 'schedules'))

const collegeOptions = computed(() => [...new Set(majors.value.map((m) => m.college).filter(Boolean))])

const overviewCards = computed(() => {
  const currentTermIds = new Set(terms.value.filter((t) => t.is_current).map((t) => t.id))
  const activeTc = teachingClasses.value.filter((tc) => currentTermIds.has(Number(tc.term_id))).length
  return [
    { key: 'majors', label: '专业总数', value: majors.value.length },
    { key: 'courses', label: '课程总数', value: courses.value.length },
    { key: 'tc', label: '教学班总数', value: teachingClasses.value.length },
    { key: 'tpl', label: '项目模板数', value: templates.value.length },
    { key: 'tasks', label: '实训任务数', value: tasks.value.length },
    { key: 'active', label: '本学期进行中教学班', value: activeTc, accent: 'ov-value--primary' },
  ]
})

function formatTermRange(row) {
  const a = row.start_date ? formatDateTime(row.start_date).slice(0, 10) : ''
  const b = row.end_date ? formatDateTime(row.end_date).slice(0, 10) : ''
  if (a && b) return `${a} ~ ${b}`
  if (a || b) return a || b
  return `${row.year} · ${row.season === 'spring' ? '春' : '秋'}`
}

function formatPeriod(row) {
  if (row.period_start == null) return '—'
  if (row.period_end && row.period_end !== row.period_start) return `${row.period_start}-${row.period_end}节`
  return `第${row.period_start}节`
}

function syncQuery() {
  router.replace({
    query: {
      tab: tab.value,
      majorId: filters.courses.majorId || undefined,
      courseId: filters.tc.courseId || filters.templates.courseId || filters.schedules.courseId || undefined,
      termId: filters.tc.termId || filters.schedules.termId || undefined,
    },
  })
}

function onTabChange() {
  pages[tab.value] = 1
  syncQuery()
  refreshTab(tab.value)
}

function goTab(name, patch = {}) {
  tab.value = name
  if (patch.majorId != null) filters.courses.majorId = Number(patch.majorId)
  if (patch.courseId != null) {
    filters.tc.courseId = Number(patch.courseId)
    filters.templates.courseId = Number(patch.courseId)
    filters.schedules.courseId = Number(patch.courseId)
  }
  if (patch.termId != null) {
    filters.tc.termId = Number(patch.termId)
    filters.schedules.termId = Number(patch.termId)
  }
  if (patch.teachingClassId != null) filters.schedules.teachingClassId = Number(patch.teachingClassId)
  pages[name] = 1
  syncQuery()
  refreshTab(name)
}

const goCoursesByMajor = (majorId) => goTab('courses', { majorId })
const goTeachingByCourse = (courseId) => goTab('teaching-classes', { courseId })
const goTemplatesByCourse = (courseId) => goTab('templates', { courseId })
const goTasksByTc = (tcId) => router.push({ path: '/admin/tasks', query: { teachingClassId: String(tcId) } })

async function enrichTeachingClassMeta() {
  const map = { ...tcMetaMap.value }
  for (const tc of teachingClasses.value.slice(0, 50)) {
    if (map[tc.id]?.loaded) continue
    try {
      const res = await getTeachingClass(tc.id)
      if (res.success && res.data) {
        const teachers = res.data.teachers || []
        const lead = teachers.find((t) => t.role === 'lead')
        map[tc.id] = {
          loaded: true,
          leadTeacher: lead?.real_name || teachers[0]?.real_name || '',
          hasEnterprise: false,
        }
      }
    } catch (_) {}
  }
  tcMetaMap.value = map
}

/* ---------- 原有 CRUD（保持不变） ---------- */
const majorDlg = ref(false)
const termDlg = ref(false)
const courseDlg = ref(false)
const tcDlg = ref(false)
const majorForm = reactive({ id: null, code: '', name: '', college: '' })
const termForm = reactive({ id: null, name: '', year: new Date().getFullYear(), season: 'autumn', isCurrent: false })
const courseForm = reactive({
  id: null,
  courseCode: '',
  courseName: '',
  majorId: null,
  leaderId: null,
  courseGoal: '',
  abilityGoals: '',
})
const tcForm = reactive({
  id: null,
  courseId: null,
  termId: null,
  leadTeacherId: null,
  classCode: '',
  className: '',
  location: '',
})

const tplDetailDlg = ref(false)
const tplDetail = ref(null)
const tplEditDlg = ref(false)
const tplForm = reactive({
  id: null,
  courseId: null,
  projectName: '',
  description: '',
  enterpriseStandard: '',
  suggestedMaterials: '',
})
const spawnDlg = ref(false)
const spawnLoading = ref(false)
const spawnTargetTpl = ref(null)
const spawnForm = reactive({ teachingClassId: null, deadline: '' })

const spawnTcOptions = computed(() => {
  const cid = spawnTargetTpl.value?.course_id
  if (!cid) return teachingClasses.value
  return teachingClasses.value.filter((tc) => Number(tc.course_id) === Number(cid))
})

const loadMajors = async () => {
  loadingMajors.value = true
  try {
    const res = await listMajors()
    if (res.success) majors.value = res.data || []
  } finally {
    loadingMajors.value = false
  }
}
const loadTerms = async () => {
  loadingTerms.value = true
  try {
    const res = await listTerms()
    if (res.success) terms.value = res.data || []
  } finally {
    loadingTerms.value = false
  }
}
const loadCourses = async () => {
  loadingCourses.value = true
  try {
    const res = await listCourses()
    if (res.success) courses.value = res.data || []
  } finally {
    loadingCourses.value = false
  }
}
async function loadTeachingClasses() {
  loadingTc.value = true
  try {
    const res = await listTeachingClasses()
    if (res.success) {
      teachingClasses.value = res.data || []
      void enrichTeachingClassMeta()
    }
  } finally {
    loadingTc.value = false
  }
}
const loadTemplates = async () => {
  loadingTpl.value = true
  try {
    const res = await listProjectTemplates()
    if (res.success) templates.value = res.data || []
  } finally {
    loadingTpl.value = false
  }
}
const loadSchedules = async () => {
  loadingSched.value = true
  try {
    const res = await listCalendar({})
    if (res.success) schedules.value = res.data || []
  } finally {
    loadingSched.value = false
  }
}
const loadTasks = async () => {
  try {
    const res = await getAllTasks()
    if (res.success) tasks.value = res.data || []
  } catch (_) {}
}

const openMajor = (row) => {
  majorForm.id = row?.id || null
  majorForm.code = row?.code || ''
  majorForm.name = row?.name || ''
  majorForm.college = row?.college || ''
  majorDlg.value = true
}
const saveMajor = async () => {
  const payload = { code: majorForm.code, name: majorForm.name, college: majorForm.college }
  if (majorForm.id) await updateMajor(majorForm.id, payload)
  else await createMajor(payload)
  ElMessage.success('已保存')
  majorDlg.value = false
  loadMajors()
}
const delMajor = async (id) => {
  await ElMessageBox.confirm('确定删除？', '提示', { type: 'warning' })
  await deleteMajor(id)
  loadMajors()
}

const openTerm = (row) => {
  termForm.id = row?.id || null
  termForm.name = row?.name || ''
  termForm.year = row?.year || new Date().getFullYear()
  termForm.season = row?.season || 'autumn'
  termForm.isCurrent = !!row?.is_current
  termDlg.value = true
}
const saveTerm = async () => {
  const payload = { name: termForm.name, year: termForm.year, season: termForm.season, isCurrent: termForm.isCurrent }
  if (termForm.id) await updateTerm(termForm.id, payload)
  else await createTerm(payload)
  ElMessage.success('已保存')
  termDlg.value = false
  loadTerms()
}
const delTerm = async (id) => {
  await ElMessageBox.confirm('确定删除？', '提示', { type: 'warning' })
  await deleteTerm(id)
  loadTerms()
}

const openCourse = (row) => {
  courseForm.id = row?.id || null
  courseForm.courseCode = row?.course_code || ''
  courseForm.courseName = row?.course_name || ''
  courseForm.majorId = row?.major_id || null
  courseForm.leaderId = row?.leader_id || null
  courseForm.courseGoal = row?.course_goal || ''
  courseForm.abilityGoals = row?.ability_goals || ''
  courseDlg.value = true
}
const saveCourse = async () => {
  const payload = {
    courseCode: courseForm.courseCode,
    courseName: courseForm.courseName,
    majorId: courseForm.majorId,
    leaderId: courseForm.leaderId,
    courseGoal: courseForm.courseGoal,
    abilityGoals: courseForm.abilityGoals,
  }
  if (courseForm.id) await updateCourse(courseForm.id, payload)
  else await createCourse(payload)
  ElMessage.success('已保存')
  courseDlg.value = false
  loadCourses()
}
const delCourse = async (id) => {
  await ElMessageBox.confirm('确定删除？', '提示', { type: 'warning' })
  await deleteCourse(id)
  loadCourses()
}

const openTc = (row) => {
  tcForm.id = row?.id || null
  tcForm.courseId = row?.course_id || null
  tcForm.termId = row?.term_id || null
  tcForm.leadTeacherId = row?.lead_teacher_id || null
  tcForm.classCode = row?.class_code || ''
  tcForm.className = row?.class_name || ''
  tcForm.location = row?.location || ''
  tcDlg.value = true
}
const saveTc = async () => {
  try {
    if (tcForm.id) {
      await updateTeachingClass(tcForm.id, {
        classCode: tcForm.classCode,
        className: tcForm.className,
        location: tcForm.location,
      })
    } else {
      if (!tcForm.courseId || !tcForm.termId || !tcForm.classCode || !tcForm.className) {
        ElMessage.warning('请填写必填项')
        return
      }
      await createTeachingClass({
        courseId: tcForm.courseId,
        termId: tcForm.termId,
        classCode: tcForm.classCode,
        className: tcForm.className,
        location: tcForm.location,
        leadTeacherId: tcForm.leadTeacherId,
      })
    }
    ElMessage.success('已保存')
    tcDlg.value = false
    loadTeachingClasses()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '保存失败')
  }
}
const delTc = async (id) => {
  await ElMessageBox.confirm('删除教学班将解除成员与课表关联，确定继续？', '提示', { type: 'warning' })
  try {
    await deleteTeachingClass(id)
    ElMessage.success('已删除')
    loadTeachingClasses()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '删除失败')
  }
}
const goTcDetail = (id) => router.push(`/admin/teaching-classes/${id}`)

const delTpl = async (id) => {
  await ElMessageBox.confirm('确定删除该项目模板？', '提示', { type: 'warning' })
  try {
    await deleteProjectTemplate(id)
    ElMessage.success('已删除')
    loadTemplates()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '删除失败')
  }
}

async function viewTpl(row) {
  try {
    const res = await getProjectTemplate(row.id)
    if (res.success) {
      tplDetail.value = res.data
      tplDetailDlg.value = true
    }
  } catch (e) {
    ElMessage.error('加载详情失败')
  }
}

function openTplCreate() {
  tplForm.id = null
  tplForm.courseId = filters.templates.courseId || null
  tplForm.projectName = ''
  tplForm.description = ''
  tplForm.enterpriseStandard = ''
  tplForm.suggestedMaterials = ''
  tplEditDlg.value = true
}

function openTplEdit(row) {
  tplForm.id = row.id
  tplForm.courseId = row.course_id
  tplForm.projectName = row.project_name
  tplForm.description = row.description || ''
  tplForm.enterpriseStandard = row.enterprise_standard || ''
  tplForm.suggestedMaterials = row.suggested_materials || ''
  tplEditDlg.value = true
}

async function saveTpl() {
  if (!tplForm.courseId || !tplForm.projectName?.trim()) {
    ElMessage.warning('请填写课程与模板名称')
    return
  }
  const payload = {
    courseId: tplForm.courseId,
    projectName: tplForm.projectName,
    description: tplForm.description,
    enterpriseStandard: tplForm.enterpriseStandard,
    suggestedMaterials: tplForm.suggestedMaterials,
  }
  try {
    if (tplForm.id) await updateProjectTemplate(tplForm.id, payload)
    else await createProjectTemplate(payload)
    ElMessage.success('已保存')
    tplEditDlg.value = false
    loadTemplates()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '保存失败')
  }
}

function openSpawn(row) {
  spawnTargetTpl.value = row
  spawnForm.teachingClassId = null
  spawnForm.deadline = ''
  spawnDlg.value = true
}

async function confirmSpawn() {
  if (!spawnForm.teachingClassId || !spawnForm.deadline) {
    ElMessage.warning('请选择教学班与截止时间')
    return
  }
  spawnLoading.value = true
  try {
    const res = await spawnTaskFromTemplate(spawnTargetTpl.value.id, {
      teachingClassId: spawnForm.teachingClassId,
      deadline: spawnForm.deadline,
    })
    if (res.success) {
      ElMessage.success('任务已生成')
      spawnDlg.value = false
      loadTasks()
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '生成失败')
  } finally {
    spawnLoading.value = false
  }
}

function refreshTab(v) {
  if (v === 'majors') loadMajors()
  if (v === 'terms') loadTerms()
  if (v === 'courses') loadCourses()
  if (v === 'teaching-classes') loadTeachingClasses()
  if (v === 'templates') loadTemplates()
  if (v === 'schedules') {
    if (!teachingClasses.value.length) loadTeachingClasses()
    loadSchedules()
  }
}

watch(
  () => route.query,
  (q) => {
    if (q.tab) tab.value = q.tab
    if (q.majorId) filters.courses.majorId = Number(q.majorId)
    if (q.courseId) {
      const cid = Number(q.courseId)
      filters.tc.courseId = cid
      filters.templates.courseId = cid
      filters.schedules.courseId = cid
    }
    if (q.termId) {
      const tid = Number(q.termId)
      filters.tc.termId = tid
      filters.schedules.termId = tid
    }
  },
  { immediate: true }
)

Object.keys(filters).forEach((k) => {
  watch(
    () => filters[k],
    () => {
      const pageKey = k === 'teaching-classes' ? 'tc' : k
      if (pages[pageKey] != null) pages[pageKey] = 1
    },
    { deep: true }
  )
})

onMounted(async () => {
  const tRes = await getTeacherUsers({ pageSize: 200 })
  if (tRes.success) teachers.value = tRes.data || []
  await Promise.all([
    loadMajors(),
    loadTerms(),
    loadCourses(),
    loadTasks(),
    loadTeachingClasses(),
    loadTemplates(),
  ])
  if (tab.value === 'schedules') loadSchedules()
})
</script>

<style scoped>
.page-curriculum-admin {
  min-height: 100%;
  padding: 20px 24px 32px;
  background: #f5f7fa;
}

.page-head {
  margin-bottom: 16px;
}

.page-title {
  margin: 0 0 6px;
  font-size: 22px;
  font-weight: 600;
  color: #1f2d3d;
}

.page-desc {
  margin: 0;
  font-size: 14px;
  color: #6b7280;
  line-height: 1.55;
}

.overview-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}

.overview-card {
  background: #fff;
  border: 1px solid #e5eaf2;
  border-radius: 12px;
  padding: 14px 16px;
  box-shadow: 0 1px 4px rgba(15, 45, 61, 0.04);
}

.ov-label {
  display: block;
  font-size: 12px;
  color: #9ca3af;
  margin-bottom: 6px;
}

.ov-value {
  font-size: 22px;
  font-weight: 700;
  color: #1f2d3d;
}

.ov-value--primary {
  color: #1d5fd6;
}

.main-card {
  border-radius: 12px;
  border: 1px solid #e5eaf2;
  box-shadow: 0 1px 4px rgba(15, 45, 61, 0.04);
}

.main-card :deep(.el-card__body) {
  padding: 8px 16px 16px;
}

.reg-tabs :deep(.el-tabs__header) {
  margin-bottom: 12px;
}

.reg-tabs :deep(.el-tabs__item) {
  font-size: 14px;
  font-weight: 500;
  color: #6b7280;
  padding: 0 18px;
  height: 44px;
}

.reg-tabs :deep(.el-tabs__item.is-active) {
  color: #1d5fd6;
  font-weight: 600;
}

.reg-tabs :deep(.el-tabs__active-bar) {
  background-color: #1d5fd6;
  height: 3px;
}

.cell-muted {
  color: #9ca3af;
  font-size: 13px;
}

.btn-danger-link {
  color: #dc2626 !important;
}

.progress-cell {
  min-width: 88px;
}

.detail-dl {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-dl div {
  display: grid;
  grid-template-columns: 88px 1fr;
  gap: 8px;
}

.detail-dl dt {
  margin: 0;
  font-size: 12px;
  color: #9ca3af;
}

.detail-dl dd {
  margin: 0;
  font-size: 13px;
  color: #374151;
  line-height: 1.55;
  white-space: pre-wrap;
}

@media (max-width: 1280px) {
  .overview-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 768px) {
  .overview-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .page-curriculum-admin {
    padding: 12px 14px 24px;
  }
}
</style>
