# Phase 4 - Step 2: SSE 流式聊天对接

## 上下文
聊天浮窗 UI 已完成。现在对接后端 SSE 接口实现流式对话。

## 任务

### 1. 创建 API `src/api/modules/agent.ts`
```typescript
export function streamChat(data: { message: string; thread_id?: string; available_tools?: string[] }) {
  // 使用 fetch API 发起 SSE 请求（不用 axios，axios 不支持流式）
  return fetch('/api/v1/agent/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
    },
    body: JSON.stringify(data),
  })
}
```

### 2. 创建 composable `src/composables/useChat.ts`
```typescript
export function useChat() {
  // 处理 SSE 流，逐 token 更新消息
  // 解析 event 类型：token（追加文字）、tool_call（工具调用）、done（完成）
  async function sendMessage(content: string) {
    // 1. 添加用户消息到 store
    // 2. 创建空的 AI 消息占位
    // 3. 发起 SSE 请求
    // 4. 逐 token 更新 AI 消息内容（打字机效果）
    // 5. 完成后标记消息为 done
  }
  return { sendMessage }
}
```

### 3. 修改 ChatBubble.vue
使用 useChat composable 替换假数据，实现真正的流式对话。

## 验证
- 确保 LangGraph Agent 和 NestJS 都在运行
- 在聊天浮窗中发送"你好"→ 应看到流式打字效果
- 发送"现在几点？"→ 应触发工具调用并返回时间

## 完成后
更新 PROJECT_STATUS.md 标记 4-2 为 ✅
