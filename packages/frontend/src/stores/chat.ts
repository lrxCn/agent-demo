import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ChatRole = 'user' | 'assistant'

/** 单条聊天消息（前端展示用） */
export interface ChatMessageItem {
  id: string
  role: ChatRole
  content: string
  /** 流式助手消息：接收 token 中为 streaming，结束后为 done */
  streamStatus?: 'streaming' | 'done'
  meta?: { trace_id: string; langsmith_run_id: string }
}

function newId(): string {
  return crypto.randomUUID()
}

export const useChatStore = defineStore('chat', () => {
  const messages = ref<ChatMessageItem[]>([])
  /** 服务端 LangGraph thread_id；首条消息由 SSE done 回填 */
  const currentThreadId = ref<string | null>(null)
  const isOpen = ref(false)
  const isLoading = ref(false)

  function toggleChat(): void {
    isOpen.value = !isOpen.value
  }

  function clearMessages(): void {
    messages.value = []
    currentThreadId.value = null
  }

  function appendUserMessage(content: string): void {
    messages.value.push({
      id: newId(),
      role: 'user',
      content,
    })
  }

  /** 追加一条空的流式助手消息，返回其 id */
  function pushAssistantStreaming(): string {
    const id = newId()
    messages.value.push({
      id,
      role: 'assistant',
      content: '',
      streamStatus: 'streaming',
    })
    return id
  }

  function appendAssistantDelta(id: string, delta: string): void {
    const item = messages.value.find((m) => m.id === id)
    if (!item || item.role !== 'assistant') {
      return
    }
    item.content += delta
  }

  /** 流结束：写入最终正文并标记完成 */
  function finalizeAssistantMessage(id: string, content: string): void {
    const item = messages.value.find((m) => m.id === id)
    if (!item || item.role !== 'assistant') {
      return
    }
    item.content = content
    item.streamStatus = 'done'
  }

  function setServerThreadId(threadId: string): void {
    const t = threadId.trim()
    if (t) {
      currentThreadId.value = t
    }
  }

  function setLoading(loading: boolean): void {
    isLoading.value = loading
  }

  /** 中止流时保留已生成正文，仅结束 streaming 标记 */
  function markAssistantStreamEnd(id: string): void {
    const item = messages.value.find((m) => m.id === id)
    if (item?.role === 'assistant') {
      item.streamStatus = 'done'
    }
  }

  function setAssistantMeta(
    id: string,
    meta: { trace_id: string; langsmith_run_id: string },
  ): void {
    const target = messages.value.find((m) => m.id === id)
    if (target) {
      target.meta = meta
    }
  }

  return {
    messages,
    currentThreadId,
    isOpen,
    isLoading,
    toggleChat,
    clearMessages,
    appendUserMessage,
    pushAssistantStreaming,
    appendAssistantDelta,
    finalizeAssistantMessage,
    setServerThreadId,
    setLoading,
    markAssistantStreamEnd,
    setAssistantMeta,
  }
})
