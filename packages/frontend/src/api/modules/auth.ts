import request, { unwrapApiData } from '../request'
import type { LoginResponseData } from '../../types'

/** 登录，返回 token 与用户权限摘要 */
export async function loginApi(username: string, password: string): Promise<LoginResponseData> {
  const body = await request.post<unknown>('/auth/login', { username, password })
  return unwrapApiData<LoginResponseData>(body)
}
