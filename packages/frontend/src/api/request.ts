import axios, { AxiosHeaders, type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import type { ApiEnvelope } from '../types'

const request = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
})

// 请求拦截器：附加 JWT
request.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    const headers = AxiosHeaders.from(config.headers ?? {})
    headers.set('Authorization', `Bearer ${token}`)
    config.headers = headers
  }
  return config
})

// 响应拦截器：解包 data，统一处理 401
request.interceptors.response.use(
  (response) => response.data,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      localStorage.removeItem('auth_user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  },
)

/** 断言 axios 拦截器返回的统一包装体并取出 data */
export function unwrapApiData<T>(body: unknown): T {
  if (typeof body !== 'object' || body === null) {
    throw new Error('响应格式错误')
  }
  const env = body as ApiEnvelope<T>
  if (env.code !== 0) {
    throw new Error(env.message || '请求失败')
  }
  return env.data
}

export default request
