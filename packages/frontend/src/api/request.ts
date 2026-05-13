import axios, { AxiosHeaders, type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import type { ApiEnvelope } from '../types'
import { generateTraceparent, parseTraceId } from '../utils/trace'

const request = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
})

// 请求拦截器：附加 JWT + traceparent
request.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const headers = AxiosHeaders.from(config.headers ?? {})
  const token = localStorage.getItem('access_token')
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  // 监控体系：W3C traceparent，每次请求生成新 trace_id
  const traceparent = generateTraceparent()
  headers.set('traceparent', traceparent)
  config.headers = headers
  // 开发期排查：把 trace_id 打到 console
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.debug('[trace]', config.method?.toUpperCase(), config.url, 'trace_id=', parseTraceId(traceparent))
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
