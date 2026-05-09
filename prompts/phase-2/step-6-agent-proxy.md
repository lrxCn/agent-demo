# Phase 2 - Step 6: Agent 代理层（SSE 流式转发）

## 上下文
业务 CRUD 已完成。现在创建 Agent 代理层，NestJS 作为中间层转发请求到 LangGraph API。
请阅读 @docs/API_CONTRACTS.md 的 Agent 对话接口和 @docs/ARCHITECTURE.md 的数据流部分。

## 任务

### 1. 创建 Agent 模块
- `src/agent/agent.service.ts` - 封装对 LangGraph API 的 HTTP 调用
- `src/agent/agent.controller.ts` - SSE 流式接口
- `src/agent/agent.module.ts`

### 2. Agent Service 核心逻辑
```typescript
// 使用 @nestjs/axios 的 HttpService
// LangGraph API 地址从环境变量 LANGGRAPH_API_URL 读取

async createThread(): Promise<string> {
  // POST ${LANGGRAPH_API_URL}/threads
  // 返回 thread_id
}

async *streamChat(threadId: string, message: string, userId: string, availableTools: string[]): AsyncGenerator {
  // POST ${LANGGRAPH_API_URL}/threads/${threadId}/runs/stream
  // body: { assistant_id: "agent", input: { messages, mem0_user_id, thread_id, available_frontend_tools }, stream_mode: "messages" }
  // 解析 SSE 流并 yield 每个 token
}
```

### 3. Agent Controller - SSE 端点
```typescript
@Post('chat')
@UseGuards(JwtAuthGuard)
@Sse()
async chat(@Body() body: ChatDto, @CurrentUser() user): Promise<Observable<MessageEvent>> {
  // 将 LangGraph 的流式响应转为 NestJS SSE
  // 检测 tool_call 类型的消息，特殊处理前端工具调用
}
```

### 4. 创建 ChatDto
```typescript
export class ChatDto {
  message: string;
  thread_id?: string;  // 可选，为空则创建新 thread
  available_tools?: string[];
}
```

## 验证
```bash
# 先确保 LangGraph 在 8123 端口运行
# 测试 SSE 流
curl -N -X POST http://localhost:3000/api/v1/agent/chat \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"message": "你好"}'
# 应该看到流式输出
```

## 完成后
更新 PROJECT_STATUS.md 标记 2-6 为 ✅
