import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * 学生端在线考试：与 StudentExamTake 的「全屏答题工作台」同步。
 * 仅在真正答题时锁定侧栏；查成绩 / 未开始 / 已结束 等静态页不锁。
 */
export const useStudentExamUiStore = defineStore('studentExamUi', () => {
  const examTakeLocksSidebar = ref(false)

  function setExamTakeLocksSidebar(v) {
    examTakeLocksSidebar.value = !!v
  }

  return { examTakeLocksSidebar, setExamTakeLocksSidebar }
})
