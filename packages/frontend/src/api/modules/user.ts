import request, { unwrapApiData } from '../request'
import type { UserDetailPayload } from '../../types'

/** 按 ID 拉取用户详情（含角色与权限，用于刷新会话） */
export async function fetchUserById(userId: string): Promise<UserDetailPayload> {
  const body = await request.get<unknown>(`/users/${userId}`)
  return unwrapApiData<UserDetailPayload>(body)
}
