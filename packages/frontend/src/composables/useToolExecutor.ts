/**
 * 前端工具执行器
 *
 * 根据工具名找到对应的 handler 并执行。
 * 部分工具需要用户通过弹窗确认后才执行。
 */
import { Modal, Message } from '@arco-design/web-vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import {
  createStudent as apiCreateStudent,
  deleteStudent as apiDeleteStudent,
  fetchStudentsPage,
  type CreateStudentBody,
} from '../api/modules/student'

/** 工具执行结果 */
export interface ToolResult {
  success: boolean
  result?: unknown
  /** 用户取消确认 */
  cancelled?: boolean
}

/** 弹窗确认（返回 Promise<boolean>） */
function confirmAction(title: string, content: string): Promise<boolean> {
  return new Promise((resolve) => {
    Modal.confirm({
      title,
      content,
      okText: '确认执行',
      cancelText: '取消',
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    })
  })
}

export function useToolExecutor() {
  const router = useRouter()

  /** 导航到指定页面（需确认） */
  async function handleNavigateToPage(params: Record<string, unknown>): Promise<ToolResult> {
    const path = String(params.path ?? '/')
    const msg = String(params.confirm_message || `确认跳转到 ${path}？`)

    // 权限校验拦截
    const auth = useAuthStore()
    const targetRoute = router.resolve(path)
    const required = targetRoute.matched
      .map((r) => r.meta.permissions)
      .find((p) => Array.isArray(p) && p.length > 0) as string[] | undefined

    if (required?.length) {
      const allowed = required.every((code) => auth.hasPermission(code))
      if (!allowed) {
        Message.error('抱歉，您没有权限访问该页面')
        return { success: false, result: '用户无权访问目标页面' }
      }
    }

    const ok = await confirmAction('页面导航', msg)
    if (!ok) {
      return { success: false, cancelled: true, result: '用户取消了导航' }
    }
    await router.push(path)
    return { success: true, result: `已导航到 ${path}` }
  }

  /** 创建学生（需确认） */
  async function handleCreateStudent(params: Record<string, unknown>): Promise<ToolResult> {
    const name = String(params.name ?? '')
    const studentNo = String(params.student_no ?? '')
    const gender = String(params.gender ?? '')
    const className = String(params.class_name ?? '')

    const desc = `姓名: ${name}\n学号: ${studentNo}\n性别: ${gender}\n班级: ${className}`
    const ok = await confirmAction('创建学生', `确认创建以下学生？\n\n${desc}`)
    if (!ok) {
      return { success: false, cancelled: true, result: '用户取消了创建' }
    }

    const body: CreateStudentBody = {
      name,
      student_no: studentNo,
      gender: gender || undefined,
      class_name: className || undefined,
      phone: params.phone ? String(params.phone) : undefined,
      email: params.email ? String(params.email) : undefined,
    }
    const student = await apiCreateStudent(body)
    window.dispatchEvent(new CustomEvent('student:refresh'))
    return { success: true, result: { id: student.id, name: student.name } }
  }

  /** 删除学生（需确认） */
  async function handleDeleteStudent(params: Record<string, unknown>): Promise<ToolResult> {
    const studentId = String(params.student_id ?? '')
    const studentName = String(params.student_name ?? '未知')

    const ok = await confirmAction('删除学生', `确认删除学生「${studentName}」？此操作不可恢复。`)
    if (!ok) {
      return { success: false, cancelled: true, result: '用户取消了删除' }
    }

    await apiDeleteStudent(studentId)
    window.dispatchEvent(new CustomEvent('student:refresh'))
    return { success: true, result: `已删除学生 ${studentName}` }
  }

  /** 查询学生（自动执行，无需确认） */
  async function handleQueryStudents(params: Record<string, unknown>): Promise<ToolResult> {
    const keyword = String(params.keyword ?? '')
    const page = Number(params.page) || 1

    const data = await fetchStudentsPage({ page, pageSize: 20, keyword: keyword || undefined })
    return { success: true, result: { total: data.total, items: data.items.length } }
  }

  /** 工具名 → handler 映射 */
  const handlers: Record<string, (params: Record<string, unknown>) => Promise<ToolResult>> = {
    navigate_to_page: handleNavigateToPage,
    create_student: handleCreateStudent,
    delete_student: handleDeleteStudent,
    query_students: handleQueryStudents,
  }

  /** 执行指定工具 */
  async function execute(tool: string, params: Record<string, unknown>): Promise<ToolResult> {
    const handler = handlers[tool]
    if (!handler) {
      return { success: false, result: `未知工具: ${tool}` }
    }
    try {
      return await handler(params)
    } catch (e) {
      const msg = e instanceof Error ? e.message : '工具执行失败'
      return { success: false, result: msg }
    }
  }

  return { execute }
}
