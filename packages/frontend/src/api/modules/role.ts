import request, { unwrapApiData } from '../request'

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

/** 角色上挂载的权限摘要（列表/分配结果） */
export interface RolePermissionBrief {
  id: string
  code: string
  name: string
  groupName: string
}

export interface RoleListItem {
  id: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
  permissions: RolePermissionBrief[]
}

export interface CreateRoleInput {
  name: string
  description?: string
}

export interface UpdateRoleInput {
  name?: string
  description?: string
}

function normalizeRoleItem(
  raw: Omit<RoleListItem, 'permissions'> & { permissions?: RolePermissionBrief[] },
): RoleListItem {
  return { ...raw, permissions: raw.permissions ?? [] }
}

/** 分页查询角色，需 role:view */
export async function fetchRolesPage(params: {
  page: number
  pageSize: number
  keyword?: string
}): Promise<PaginatedResult<RoleListItem>> {
  const body = await request.get<unknown>('/roles', { params })
  const page = unwrapApiData<
    PaginatedResult<Omit<RoleListItem, 'permissions'> & { permissions?: RolePermissionBrief[] }>
  >(body)
  return {
    ...page,
    items: page.items.map((r) => normalizeRoleItem(r)),
  }
}

export async function createRole(payload: CreateRoleInput): Promise<RoleListItem> {
  const body = await request.post<unknown>('/roles', payload)
  const raw = unwrapApiData<Omit<RoleListItem, 'permissions'> & { permissions?: RolePermissionBrief[] }>(body)
  return normalizeRoleItem(raw)
}

export async function updateRole(roleId: string, payload: UpdateRoleInput): Promise<RoleListItem> {
  const body = await request.post<unknown>(`/roles/${roleId}`, payload)
  const raw = unwrapApiData<Omit<RoleListItem, 'permissions'> & { permissions?: RolePermissionBrief[] }>(body)
  return normalizeRoleItem(raw)
}

export async function deleteRole(roleId: string): Promise<void> {
  const body = await request.delete<unknown>(`/roles/${roleId}`)
  unwrapApiData<unknown>(body)
}

/** 为角色分配权限（传空数组表示清空），需 role:assign-permission */
export async function assignRolePermissions(
  roleId: string,
  permissionIds: string[],
): Promise<RoleListItem> {
  const body = await request.post<unknown>(`/roles/${roleId}/permissions`, { permissionIds })
  const raw = unwrapApiData<Omit<RoleListItem, 'permissions'> & { permissions?: RolePermissionBrief[] }>(body)
  return normalizeRoleItem(raw)
}
