import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ChatRole = 'user' | 'assistant'

/** 单条聊天消息（前端展示用） */
export interface ChatMessageItem {
  id: string
  role: ChatRole
  content: string
}

function newId(): string {
  return crypto.randomUUID()
}

/** 未接后端时的轮换模拟回复 */
const MOCK_REPLIES = [
  '收到。这是**本地模拟**回复，对接 SSE 后会显示真实 AI 内容。',
  '你好，我是 **AI 助手**（演示数据）。',
  '你可以继续提问；当前尚未连接后端接口。',
]

let mockReplyIndex = 0

export const useChatStore = defineStore('chat', () => {
  const messages = ref<ChatMessageItem[]>([])
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

  /**
   * 发送用户消息并模拟助手回复（Phase 4-2 再接入真实 SSE）
   */
  async function sendMessage(text: string): Promise<void> {
    const trimmed = text.trim()
    if (!trimmed || isLoading.value) {
      return
    }
    if (!currentThreadId.value) {
      currentThreadId.value = newId()
    }
    messages.value.push({
      id: newId(),
      role: 'user',
      content: trimmed,
    })
    isLoading.value = true
    try {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 900)
      })
      const reply = MOCK_REPLIES[mockReplyIndex % MOCK_REPLIES.length]
      mockReplyIndex += 1
      messages.value.push({
        id: newId(),
        role: 'assistant',
        content: reply,
      })
    } finally {
      isLoading.value = false
    }
  }

  return {
    messages,
    currentThreadId,
    isOpen,
    isLoading,
    sendMessage,
    toggleChat,
    clearMessages,
  }
})
