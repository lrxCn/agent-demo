import request, { unwrapApiData } from '../request'
import type { LoginResponseData, RefreshTokenResponseData } from '../../types'

/** 登录，返回 access / refresh 与用户摘要 */
export async function login(data: { username: string; password: string }): Promise<LoginResponseData> {
  const body = await request.post<unknown>('/auth/login', data)
  return unwrapApiData<LoginResponseData>(body)
}

/** 使用 refresh_token 换取新的 access_token */
export async function refreshToken(refreshTokenValue: string): Promise<RefreshTokenResponseData> {
  const body = await request.post<unknown>('/auth/refresh', { refresh_token: refreshTokenValue })
  return unwrapApiData<RefreshTokenResponseData>(body)
}
