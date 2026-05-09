<script setup lang="ts">
import { Message } from '@arco-design/web-vue'
import { IconClose, IconMessage, IconSend } from '@arco-design/web-vue/es/icon'
import MarkdownIt from 'markdown-it'
import { computed, nextTick, ref, watch } from 'vue'
import { useChat } from '../../composables/useChat'
import { useChatStore } from '../../stores/chat'

const chat = useChatStore()
const { sendMessage } = useChat()
const inputValue = ref('')
const listRef = ref<HTMLElement | null>(null)

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
})

function renderMarkdown(content: string): string {
  return md.render(content)
}

function scrollListToBottom(): void {
  const el = listRef.value
  if (!el) {
    return
  }
  el.scrollTop = el.scrollHeight
}

watch(
  () => [chat.messages.length, chat.isLoading, chat.isOpen] as const,
  () => {
    void nextTick(() => {
      scrollListToBottom()
    })
  },
  { flush: 'post' },
)

function onToggleFab(): void {
  chat.toggleChat()
}

function onClosePanel(): void {
  if (chat.isOpen) {
    chat.toggleChat()
  }
}

/** 首字节未到前显示独立 typing 行；已有流式正文时由气泡内展示 */
const showStreamingTyping = computed(() => {
  if (!chat.isLoading) {
    return false
  }
  const last = chat.messages[chat.messages.length - 1]
  if (!last || last.role !== 'assistant') {
    return true
  }
  return last.content.length === 0
})

async function onSend(): Promise<void> {
  const raw = inputValue.value
  if (!raw.trim()) {
    Message.warning('请输入内容')
    return
  }
  inputValue.value = ''
  try {
    await sendMessage(raw)
  } catch (e) {
    Message.error(e instanceof Error ? e.message : '发送失败')
  }
}
</script>

<template>
  <div class="chat-bubble-root">
    <button v-if="!chat.isOpen" type="button" class="fab" aria-label="打开 AI 助手" @click="onToggleFab">
      <IconMessage :size="26" />
    </button>

    <div v-else class="panel" role="dialog" aria-label="AI 助手对话">
      <header class="panel-header">
        <span class="panel-title">AI 助手</span>
        <a-button type="text" class="panel-close" @click="onClosePanel">
          <template #icon>
            <IconClose />
          </template>
        </a-button>
      </header>

      <div ref="listRef" class="panel-messages">
        <div
          v-for="m in chat.messages"
          :key="m.id"
          class="msg-row"
          :class="m.role === 'user' ? 'msg-row--user' : 'msg-row--assistant'"
        >
          <div v-if="m.role === 'assistant'" class="bubble bubble--assistant">
            <div class="bubble-md chat-md" v-html="renderMarkdown(m.content)" />
          </div>
          <div v-else class="bubble bubble--user">
            {{ m.content }}
          </div>
        </div>

        <div v-if="showStreamingTyping" class="msg-row msg-row--assistant">
          <div class="bubble bubble--assistant bubble--typing">
            <span class="typing-dot" />
            <span class="typing-dot typing-dot--2" />
            <span class="typing-dot typing-dot--3" />
          </div>
        </div>
      </div>

      <footer class="panel-footer">
        <a-textarea
          v-model="inputValue"
          :auto-size="{ minRows: 1, maxRows: 4 }"
          placeholder="输入消息…"
          class="panel-input"
          @keydown.enter.exact.prevent="onSend"
        />
        <a-button type="primary" class="panel-send" :loading="chat.isLoading" @click="onSend">
          <template #icon>
            <IconSend />
          </template>
        </a-button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.chat-bubble-root {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 2000;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  pointer-events: none;
}

.chat-bubble-root > * {
  pointer-events: auto;
}

.fab {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  box-shadow: 0 8px 24px rgba(99, 102, 241, 0.45);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.fab:hover {
  transform: scale(1.05);
  box-shadow: 0 10px 28px rgba(99, 102, 241, 0.55);
}

.panel {
  width: 400px;
  height: 600px;
  max-height: calc(100vh - 48px);
  border-radius: 16px;
  background: var(--color-bg-2, #1e293b);
  border: 1px solid var(--color-border-2, rgba(255, 255, 255, 0.08));
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  flex-shrink: 0;
  height: 52px;
  padding: 0 12px 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--color-border-2, rgba(255, 255, 255, 0.08));
}

.panel-title {
  font-weight: 600;
  font-size: 15px;
  color: var(--color-text-1, #e2e8f0);
}

.panel-close {
  color: var(--color-text-2, #94a3b8);
}

.panel-messages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.msg-row {
  display: flex;
  width: 100%;
}

.msg-row--user {
  justify-content: flex-end;
}

.msg-row--assistant {
  justify-content: flex-start;
}

.bubble {
  max-width: 85%;
  padding: 10px 12px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.5;
  word-break: break-word;
}

.bubble--user {
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  color: #f8fafc;
  white-space: pre-wrap;
}

.bubble--assistant {
  background: var(--color-fill-2, #334155);
  color: var(--color-text-1, #e2e8f0);
}

.bubble--typing {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 56px;
  min-height: 40px;
}

.typing-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-text-3, #64748b);
  animation: chat-typing 1.2s ease-in-out infinite;
}

.typing-dot--2 {
  animation-delay: 0.2s;
}

.typing-dot--3 {
  animation-delay: 0.4s;
}

@keyframes chat-typing {
  0%,
  80%,
  100% {
    opacity: 0.35;
    transform: translateY(0);
  }
  40% {
    opacity: 1;
    transform: translateY(-4px);
  }
}

.panel-footer {
  flex-shrink: 0;
  padding: 12px;
  display: flex;
  gap: 8px;
  align-items: flex-end;
  border-top: 1px solid var(--color-border-2, rgba(255, 255, 255, 0.08));
}

.panel-input {
  flex: 1;
}

.panel-send {
  flex-shrink: 0;
}

/* Markdown 正文（助手气泡内） */
.bubble-md :deep(p) {
  margin: 0 0 0.5em;
}

.bubble-md :deep(p:last-child) {
  margin-bottom: 0;
}

.bubble-md :deep(strong) {
  font-weight: 600;
  color: var(--color-text-1, #e2e8f0);
}

.bubble-md :deep(a) {
  color: #a5b4fc;
  text-decoration: underline;
}

.bubble-md :deep(code) {
  font-size: 0.9em;
  padding: 0.1em 0.35em;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.25);
}

.bubble-md :deep(ul),
.bubble-md :deep(ol) {
  margin: 0.35em 0 0.35em 1.1em;
  padding: 0;
}
</style>
