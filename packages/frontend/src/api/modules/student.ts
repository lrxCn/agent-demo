import request, { unwrapApiData } from '../request'

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

/** 学生列表项（与后端实体 JSON 序列化 camelCase 一致） */
export interface StudentListItem {
  id: string
  name: string
  studentNo: string
  gender: string | null
  className: string | null
  phone: string | null
  email: string | null
  createdAt: string
  updatedAt: string
}

/** 创建学生请求体（snake_case，与后端 DTO 一致） */
export interface CreateStudentBody {
  name: string
  student_no: string
  gender?: string
  class_name?: string
  phone?: string
  email?: string
}

export type UpdateStudentBody = Partial<CreateStudentBody>

/** 分页查询，需 student:view */
export async function fetchStudentsPage(params: {
  page: number
  pageSize: number
  keyword?: string
}): Promise<PaginatedResult<StudentListItem>> {
  const body = await request.get<unknown>('/students', { params })
  return unwrapApiData<PaginatedResult<StudentListItem>>(body)
}

/** 单条详情，需 student:view */
export async function fetchStudentById(studentId: string): Promise<StudentListItem> {
  const body = await request.get<unknown>(`/students/${studentId}`)
  return unwrapApiData<StudentListItem>(body)
}

/** 创建，需 student:create */
export async function createStudent(payload: CreateStudentBody): Promise<StudentListItem> {
  const body = await request.post<unknown>('/students', payload)
  return unwrapApiData<StudentListItem>(body)
}

/** 更新，需 student:update */
export async function updateStudent(
  studentId: string,
  payload: UpdateStudentBody,
): Promise<StudentListItem> {
  const body = await request.post<unknown>(`/students/${studentId}`, payload)
  return unwrapApiData<StudentListItem>(body)
}

/** 删除，需 student:delete */
export async function deleteStudent(studentId: string): Promise<void> {
  const body = await request.delete<unknown>(`/students/${studentId}`)
  unwrapApiData<unknown>(body)
}

/** 批量创建，需 student:create */
export async function batchCreateStudents(items: CreateStudentBody[]): Promise<StudentListItem[]> {
  const body = await request.post<unknown>('/students/batch', { items })
  const data = unwrapApiData<{ items: StudentListItem[] }>(body)
  return data.items
}

/** 批量删除，需 student:delete */
export async function batchDeleteStudents(ids: string[]): Promise<{ deleted: number }> {
  const body = await request.delete<unknown>('/students/batch', { data: { ids } })
  return unwrapApiData<{ deleted: number }>(body)
}
