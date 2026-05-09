import request, { unwrapApiData } from '../request'
import type { UserDetailPayload } from '../../types'

/** 列表项（不含密码，与后端 PublicUser 序列化一致） */
export interface UserListItem {
  id: string
  username: string
  nickname: string
  avatar: string | null
  createdAt: string
  updatedAt: string
}

/** 分页结果 */
export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface CreateUserInput {
  username: string
  password: string
  nickname?: string
}

export interface UpdateUserInput {
  username?: string
  password?: string
  nickname?: string
}

/** 角色列表项（分配角色弹窗用，与 role 模块列表项一致，需 role:view） */
export type { RoleListItem as RolePickerItem } from './role'
export { fetchRolesPage } from './role'

/** 按 ID 拉取用户详情（含角色与权限，用于刷新会话与分配角色回显） */
export async function fetchUserById(userId: string): Promise<UserDetailPayload> {
  const body = await request.get<unknown>(`/users/${userId}`)
  return unwrapApiData<UserDetailPayload>(body)
}

/** 分页查询用户 */
export async function fetchUsersPage(params: {
  page: number
  pageSize: number
  keyword?: string
}): Promise<PaginatedResult<UserListItem>> {
  const body = await request.get<unknown>('/users', { params })
  return unwrapApiData<PaginatedResult<UserListItem>>(body)
}

export async function createUser(payload: CreateUserInput): Promise<UserListItem> {
  const body = await request.post<unknown>('/users', payload)
  return unwrapApiData<UserListItem>(body)
}

export async function updateUser(userId: string, payload: UpdateUserInput): Promise<UserListItem> {
  const body = await request.put<unknown>(`/users/${userId}`, payload)
  return unwrapApiData<UserListItem>(body)
}

export async function deleteUser(userId: string): Promise<void> {
  const body = await request.delete<unknown>(`/users/${userId}`)
  unwrapApiData<unknown>(body)
}

export async function assignUserRoles(userId: string, roleIds: string[]): Promise<UserListItem> {
  const body = await request.put<unknown>(`/users/${userId}/roles`, { roleIds })
  return unwrapApiData<UserListItem>(body)
}
