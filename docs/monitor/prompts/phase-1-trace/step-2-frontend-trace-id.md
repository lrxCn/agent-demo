# Phase 7-1 / Step 2：前端注入 W3C traceparent + 解析 SSE trace 事件（P1 + P2）

## 上下文

监控体系 Phase 7-1 的第二步。**前端在每个 outbound 请求中生成 W3C `traceparent` header**，并**解析 SSE 流中新增的 `{type:'trace'}` 事件**，把 `langsmith_run_id` 缓存到 message.meta（供后续 Phase 7-3 反馈按钮使用）。

执行前必读：

- `@docs/monitor/REQUIREMENTS.md` §8 决策 #10（W3C Trace Context 标准）
- `@docs/monitor/1.PRD.md` §4.1（trace 全链路传递方式）+ §5.2.1（前端 trace 注入验收清单）
- `@docs/monitor/3.ARCHITECTURE.md` §2 P1 + P2 + §6（trace_id 规范）
- `@packages/frontend/src/api/request.ts`（现状：仅注入 JWT）
- `@packages/frontend/src/api/modules/agent.ts`（现状：streamChat 用原生 fetch）
- `@packages/frontend/src/composables/useChat.ts`（现状：解析 SSE 4 类 payload）

前置条件：

- Step 1 已完成（PROGRESS.md 7-1-1 = ✅）

## 任务

### 任务 1：新建 W3C traceparent 工具

新建文件 `packages/frontend/src/utils/trace.ts`，**全文**如下：

```typescript
/**
 * W3C Trace Context 生成器
 * 规范：https://www.w3.org/TR/trace-context/
 *
 * 格式：00-<32 字符 hex trace_id>-<16 字符 hex span_id>-01
 *   - 00：version
 *   - 01：flags（采样位，01 表示采样）
 */

const HEX_CHARS = '0123456789abcdef'

/** 生成 N 字符的随机 hex 字符串（用浏览器内置 crypto） */
function randomHex(length: number): string {
  const bytes = new Uint8Array(length / 2)
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]
    out += HEX_CHARS[b >> 4] + HEX_CHARS[b & 0x0f]
  }
  return out
}

/** 生成 32 字符 hex trace_id */
export function generateTraceId(): string {
  return randomHex(32)
}

/** 生成 16 字符 hex span_id */
export function generateSpanId(): string {
  return randomHex(16)
}

/**
 * 生成完整 W3C traceparent header 值
 * 可传入已有的 trace_id（如同一次会话内复用）
 */
export function generateTraceparent(traceId?: string): string {
  const tid = traceId ?? generateTraceId()
  const sid = generateSpanId()
  return `00-${tid}-${sid}-01`
}

/**
 * 从 traceparent header 值中提取 trace_id（前端排查用）
 * 解析失败返回空字符串
 */
export function parseTraceId(traceparent: string | null | undefined): string {
  if (!traceparent) {
    return ''
  }
  const parts = traceparent.split('-')
  if (parts.length !== 4 || parts[0] !== '00' || parts[1].length !== 32) {
    return ''
  }
  return parts[1]
}
```

### 任务 2：修改 axios 拦截器自动注入 `traceparent`

修改 `@packages/frontend/src/api/request.ts`。在 JWT 注入之后追加 traceparent 注入。**完整替换**该文件内容：

```typescript
import axios, { AxiosHeaders, type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import type { ApiEnvelope } from '../types'
import { generateTraceparent, parseTraceId } from '../utils/trace'

const request = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
})

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
```

### 任务 3：让 SSE fetch 也注入 traceparent

修改 `@packages/frontend/src/api/modules/agent.ts` 的 `streamChat` 函数。**完整替换**：

```typescript
import request, { unwrapApiData } from '../request'
import { generateTraceparent, parseTraceId } from '../utils/trace'

export interface StreamChatRequestBody {
  message: string
  thread_id?: string
  available_tools?: string[]
}

/** 调用方可拿到本次请求生成的 trace_id（用于关联 UI 状态） */
export interface StreamChatResult {
  response: Response
  traceId: string
}

/**
 * 发起 SSE 流式对话（使用 fetch，axios 无法消费流式 body）
 */
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
```

### 任务 4：`useChat.ts` 解析 SSE `{type:'trace'}` 事件

修改 `@packages/frontend/src/composables/useChat.ts`。**两处改动**：

#### 改动 4.1：扩展 `AgentStreamPayload` 联合类型

在文件顶部找到 `type AgentStreamPayload` 定义，**改为**：

```typescript
/** 与后端 AgentChatStreamPayload 对齐 */
type AgentStreamPayload =
  | { type: 'token'; content: string }
  | { type: 'tool_call'; tool: string; params: Record<string, unknown> }
  | { type: 'done'; content: string; thread_id: string }
  | { type: 'error'; message: string }
  | { type: 'trace'; trace_id: string; langsmith_run_id: string }
```

#### 改动 4.2：处理 trace 事件 + 拿到 `traceId`

在 `sendMessage` 函数中，找到 `const res = await streamChat(body, token, ac.signal)` 这一行，**完整替换**该 try 块的内容（从 `const res = await streamChat...` 到 `markAssistantStreamEnd` 那个 if 块结束）：

```typescript
    try {
      const { response: res, traceId } = await streamChat(body, token, ac.signal)
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.debug('[trace] chat 流开始 trace_id=', traceId, 'assistantId=', assistantId)
      }
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
          case 'trace':
            // 把 LangSmith run_id 挂到当前 assistant message 的 meta（供 Phase 7-3 反馈按钮使用）
            chat.setAssistantMeta(assistantId, {
              trace_id: payload.trace_id,
              langsmith_run_id: payload.langsmith_run_id,
            })
            if (import.meta.env.DEV) {
              // eslint-disable-next-line no-console
              console.debug('[trace] SSE 收到 trace 事件 run_id=', payload.langsmith_run_id)
            }
            break
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
```

### 任务 5：`chat` store 增加 `setAssistantMeta` action

修改 `@packages/frontend/src/stores/chat.ts`。**操作**：

1. 找到 `ChatMessage` 类型定义，在字段列表中**新增**一个可选字段：

```typescript
   meta?: { trace_id: string; langsmith_run_id: string }
```

2. 找到 `actions` 块（或 store 的 setup 函数中 return 的方法集合），**新增**一个 action：

```typescript
function setAssistantMeta(
  id: string,
  meta: { trace_id: string; langsmith_run_id: string },
): void {
  const target = messages.value.find((m) => m.id === id)
  if (target) {
    target.meta = meta
  }
}
```

并把 `setAssistantMeta` 加入 store 的 return 列表中。

> **如果 `stores/chat.ts` 用的不是 setup 风格而是 options 风格**，把 `setAssistantMeta` 写到 `actions: { ... }` 块里，签名一致。如果你不确定，**先用 Read 工具读一遍** `@packages/frontend/src/stores/chat.ts` 再改。

## 验证

### 验证步骤 1：TypeScript 编译通过

```bash
cd packages/frontend
pnpm typecheck
```

期望无错误。

### 验证步骤 2：前端 dev 服务起来

```bash
pnpm dev
```

浏览器打开 `http://localhost:5173` → 登录。

### 验证步骤 3：Console 看到 trace_id

打开 DevTools → Console，确保 "Verbose" 级别开启。

发送任意一条聊天消息（如 `你好`）。Console 应该输出至少 3 行：

```
[trace] POST /agent/chat trace_id= <32位hex>
[trace] chat 流开始 trace_id= <同上32位hex> assistantId= <uuid>
[trace] SSE 收到 trace 事件 run_id= <LangSmith run_id>
```

**关键验证**：前两行的 trace_id 应当**完全相同**（这是同一次请求）。

### 验证步骤 4：Network 面板看 header

DevTools → Network → 找到 `chat` 请求 → Headers → Request Headers，应当能看到：

```
traceparent: 00-<32位hex 与上面相同>-<16位hex>-01
```

### 验证步骤 5：API 调用类（非 SSE）也注入了

随便点开一个其他页面（如学生管理），DevTools → Network 任选一个 `/api/v1/*` 请求，Headers 中也应有 `traceparent`。

### 故障排查

| 现象 | 原因 | 修复 |
|---|---|---|
| TS 报错 `Cannot find module '../utils/trace'` | 任务 1 路径写错 | 确认文件在 `packages/frontend/src/utils/trace.ts` |
| Console 看不到 `[trace]` 日志 | Vite 的 `import.meta.env.DEV` 在 build 时是 false | 确认 `pnpm dev`（不是 `pnpm build`） |
| SSE 收不到 `trace` 事件 | Step 4 后端改造未完成（必须等 Step 4 完成才能看到） | 现阶段任务 4 的 `case 'trace'` 分支不会触发是正常的 |
| `streamChat` 调用方还在用旧签名 | 没改 `useChat.ts` 的解构 | 必须改 `const { response: res, traceId } = ...` |

> ⚠️ **重要**：本 Step 完成后，Console 不会看到 `SSE 收到 trace 事件` 那行日志，**这是预期的**——因为后端还没产生 trace 事件，必须等 Step 4 完成才会出现。前 2 行日志（POST trace_id + 流开始 trace_id）必须立即可见。

## 完成后

### 更新 PROGRESS.md

打开 `@docs/monitor/PROGRESS.md`，找到：

```
| 7-1-2 | 前端 trace_id 注入（P1） | ⬜ | | ... |
```

改为：

```
| 7-1-2 | 前端 trace_id 注入（P1） | ✅ | <今天日期> | utils/trace.ts + axios/streamChat 注入 traceparent + useChat 预留 trace 事件分支 |
```

### git commit

```bash
git add packages/frontend/src/utils/trace.ts \
        packages/frontend/src/api/request.ts \
        packages/frontend/src/api/modules/agent.ts \
        packages/frontend/src/composables/useChat.ts \
        packages/frontend/src/stores/chat.ts \
        docs/monitor/PROGRESS.md

git commit -m "$(cat <<'EOF'
feat(monitor): phase-7-1 step-2 前端 W3C traceparent 注入

- 新增 src/utils/trace.ts (W3C traceparent 生成器)
- axios 拦截器 + streamChat 自动注入 traceparent header
- useChat.ts 预留 SSE {type:'trace'} 事件分支（等 step-4 后端配套）
- chat store 新增 setAssistantMeta action 缓存 langsmith_run_id
- DoD: console 可见每次请求的 trace_id；Network header 含 traceparent

ref: docs/monitor/PROGRESS.md 7-1-2
EOF
)"
```
