/** 登录接口返回的用户摘要（与 API_CONTRACTS 一致） */
export interface AuthUserSummary {
  id: string
  username: string
  nickname: string
  roles: string[]
  permissions: string[]
}

/** GET /users/:id 返回的嵌套角色（含权限码） */
export interface UserRolePayload {
  id: string
  name: string
  permissions?: Array<{ code: string }>
}

export interface UserDetailPayload {
  id: string
  username: string
  nickname: string
  avatar?: string | null
  roles?: UserRolePayload[]
}

export interface LoginResponseData {
  access_token: string
  refresh_token: string
  expires_in: number
  user: AuthUserSummary
}

/** 统一响应包装（与后端 ResponseInterceptor 一致） */
export interface ApiEnvelope<T> {
  code: number
  data: T
  message: string
}
