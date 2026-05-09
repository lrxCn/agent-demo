import axios, { AxiosHeaders, type AxiosError, type InternalAxiosRequestConfig } from 'axios'

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
      window.location.href = '/login'
    }
    return Promise.reject(error)
  },
)

export default request
