import request, { unwrapApiData } from '../request'

/** 分组内单条权限（与后端 PermissionService 一致） */
export interface PermissionBrief {
  id: string
  code: string
  name: string
}

export interface PermissionGroup {
  groupName: string
  permissions: PermissionBrief[]
}

/** 查询权限列表（按分组），需 permission:view */
export async function fetchPermissionsGrouped(): Promise<{ groups: PermissionGroup[] }> {
  const body = await request.get<unknown>('/permissions')
  return unwrapApiData<{ groups: PermissionGroup[] }>(body)
}
