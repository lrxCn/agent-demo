import request, { unwrapApiData } from '../request'
import { generateTraceparent, parseTraceId } from '../../utils/trace'

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
export interface StreamChatResult {
  response: Response
  traceId: string
}

export async function streamChat(
  data: StreamChatRequestBody,
  accessToken: string,
  signal?: AbortSignal,
): Promise<StreamChatResult> {
  const traceparent = generateTraceparent()
  const traceId = parseTraceId(traceparent)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    traceparent,
  }
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`
  }
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.debug('[trace] POST /agent/chat trace_id=', traceId)
  }
  const response = await fetch('/api/v1/agent/chat', {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
    signal,
  })
  return { response, traceId }
}

interface TranscribeResponse {
  text: string
}

export async function transcribeAudio(
  file: Blob,
  filename = 'call-record.webm',
  callerUserId?: string,
  calleeUserId?: string,
  callId?: string,
): Promise<string> {
  const formData = new FormData()
  formData.append('file', file, filename)
  if (callerUserId) {
    formData.append('callerUserId', callerUserId)
  }
  if (calleeUserId) {
    formData.append('calleeUserId', calleeUserId)
  }
  if (callId) {
    formData.append('callId', callId)
  }
  const body = await request.post('/agent/transcribe', formData)
  const data = unwrapApiData<TranscribeResponse>(body)
  return data.text
}
