/** Agent SSE 对话请求体 */
export interface StreamChatRequestBody {
  message: string
  thread_id?: string
  available_tools?: string[]
}

/**
 * 发起 SSE 流式对话（使用 fetch，axios 无法消费流式 body）
 * @param accessToken JWT，未登录时传空字符串将不带 Authorization
 */
export function streamChat(
  data: StreamChatRequestBody,
  accessToken: string,
  signal?: AbortSignal,
): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`
  }
  return fetch('/api/v1/agent/chat', {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
    signal,
  })
}
