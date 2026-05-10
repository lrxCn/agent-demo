import { ref } from 'vue'
import { streamChat, type StreamChatRequestBody } from '../api/modules/agent'
import { useAuthStore } from '../stores/auth'
import { useChatStore } from '../stores/chat'

/** 与后端 AgentChatStreamPayload 对齐 */
type AgentStreamPayload =
  | { type: 'token'; content: string }
  | { type: 'tool_call'; tool: string; params: Record<string, unknown> }
  | { type: 'done'; content: string; thread_id: string }
  | { type: 'error'; message: string }

function dispatchSseBlock(block: string, onPayload: (p: AgentStreamPayload) => void): void {
  const lines = block.split('\n').filter((l) => !l.startsWith(':'))
  const dataParts: string[] = []
  for (const line of lines) {
    if (line.startsWith('data:')) {
      dataParts.push(line.slice(5).trimStart())
    }
  }
  if (dataParts.length === 0) {
    return
  }
  const joined = dataParts.join('\n')
  try {
    const parsed = JSON.parse(joined) as AgentStreamPayload
    onPayload(parsed)
  } catch {
    // 忽略无法解析的片段
  }
}

/** 从 fetch Response 的 body 中解析 SSE（event: message + data: JSON） */
async function readAgentSseStream(
  response: Response,
  onPayload: (p: AgentStreamPayload) => void,
): Promise<void> {
  const body = response.body
  if (!body) {
    throw new Error('响应无 body，无法读取 SSE')
  }
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let carry = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      carry += decoder.decode(value, { stream: true })
      for (;;) {
        const sep = carry.indexOf('\n\n')
        if (sep === -1) {
          break
        }
        const block = carry.slice(0, sep)
        carry = carry.slice(sep + 2)
        dispatchSseBlock(block, onPayload)
      }
    }
    const tail = carry.trim()
    if (tail.length > 0) {
      dispatchSseBlock(tail, onPayload)
    }
  } finally {
    reader.releaseLock()
  }
}

function formatToolCallLine(tool: string, params: Record<string, unknown>): string {
  const paramsStr = JSON.stringify(params)
  return `\n\n*（调用工具 \`${tool}\`）* ${paramsStr}\n`
}

export function useChat() {
  const auth = useAuthStore()
  const chat = useChatStore()
  const streamAbort = ref<AbortController | null>(null)

  async function sendMessage(content: string, options?: { available_tools?: string[] }): Promise<void> {
    debugger
    const trimmed = content.trim()
    if (!trimmed || chat.isLoading) {
      return
    }
    const token = auth.token?.trim() ?? ''
    if (!token) {
      throw new Error('未登录，无法发送消息')
    }

    streamAbort.value?.abort()
    const ac = new AbortController()
    streamAbort.value = ac

    chat.appendUserMessage(trimmed)
    const assistantId = chat.pushAssistantStreaming()
    chat.setLoading(true)

    const body: StreamChatRequestBody = {
      message: trimmed,
      ...(chat.currentThreadId ? { thread_id: chat.currentThreadId } : {}),
      ...(options?.available_tools?.length ? { available_tools: options.available_tools } : {}),
    }

    try {
      const res = await streamChat(body, token, ac.signal)
      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        throw new Error(errText || `请求失败 (${res.status})`)
      }
      if (!res.headers.get('content-type')?.includes('text/event-stream')) {
        const errText = await res.text().catch(() => '')
        throw new Error(errText || '服务端未返回 SSE 流')
      }

      await readAgentSseStream(res, (payload) => {
        switch (payload.type) {
          case 'token':
            if (payload.content) {
              chat.appendAssistantDelta(assistantId, payload.content)
            }
            break
          case 'tool_call':
            chat.appendAssistantDelta(
              assistantId,
              formatToolCallLine(payload.tool, payload.params),
            )
            break
          case 'done':
            chat.finalizeAssistantMessage(assistantId, payload.content)
            chat.setServerThreadId(payload.thread_id)
            break
          case 'error':
            chat.finalizeAssistantMessage(
              assistantId,
              `**错误：** ${payload.message}`,
            )
            break
        }
      })
      const pending = chat.messages.find((m) => m.id === assistantId)
      if (pending?.streamStatus === 'streaming') {
        chat.markAssistantStreamEnd(assistantId)
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        chat.markAssistantStreamEnd(assistantId)
        return
      }
      const msg = e instanceof Error ? e.message : '流式对话失败'
      chat.finalizeAssistantMessage(assistantId, `**错误：** ${msg}`)
    } finally {
      if (streamAbort.value === ac) {
        streamAbort.value = null
      }
      chat.setLoading(false)
    }
  }

  return { sendMessage }
}
