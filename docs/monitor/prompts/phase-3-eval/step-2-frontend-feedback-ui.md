# Phase 7-3 / Step 2：前端反馈 UI（ChatBubble 三按钮 + postFeedback API）

## 上下文

Phase 7-3 第二步。在 ChatBubble 中每条 AI 消息底部加 👍 / 👎 / 备注 三按钮，点击调 `POST /api/v1/agent/feedback`，本地状态高亮 + Toast + 禁止重复。

执行前必读：

- `@docs/monitor/REQUIREMENTS.md` §2 目标 3 验收点（前端反馈 UI）
- `@docs/monitor/1.PRD.md` §5.3.1
- `@packages/frontend/src/components/chat/ChatBubble.vue`（必读）
- `@packages/frontend/src/api/modules/agent.ts`（必读）
- `@packages/frontend/src/stores/chat.ts`（已在 Phase 7-1 / Step 2 中扩展 `meta` 字段）

前置条件：

- Phase 7-1 已完成（chat store 的 `meta.langsmith_run_id` 已注入）
- 后端 `feedback` 接口尚未存在，本步只做前端，**点击调用会 404**，这是预期的（Step 3 完成后才会成功）

## 任务

### 任务 1：扩展 `chat` store

修改 `@packages/frontend/src/stores/chat.ts`。

#### 改动 1.1：`ChatMessage` 类型新增字段

在 `ChatMessage` 类型/interface 中**追加**：

```typescript
  /** 用户反馈状态（监控体系 Phase 7-3） */
  feedback?: 'up' | 'down' | null
```

确认前面 Phase 7-1 / Step 2 已加的字段 `meta?: { trace_id: string; langsmith_run_id: string }` 仍在。

#### 改动 1.2：新增 `setMessageFeedback` action

```typescript
function setMessageFeedback(id: string, feedback: 'up' | 'down'): void {
  const target = messages.value.find((m) => m.id === id)
  if (target) {
    target.feedback = feedback
  }
}
```

并把 `setMessageFeedback` 加入 store 的 return 列表。

> 如果你的 `stores/chat.ts` 使用的是 options 风格（`actions: {...}`），请把上面的函数改写到 `actions` 块中，签名一致。

### 任务 2：`api/modules/agent.ts` 新增 `postFeedback`

修改 `@packages/frontend/src/api/modules/agent.ts`。在文件末尾**追加**：

```typescript
/** 反馈请求体；后端在 LangSmith 上对该 run 写 feedback */
export interface FeedbackPayload {
  thread_id: string
  langsmith_run_id: string
  feedback: 'up' | 'down' | 'note'
  comment?: string
}

/** 提交对某条 AI 回复的反馈（依赖 traceparent 拦截器自动注入 trace_id） */
export async function postFeedback(payload: FeedbackPayload): Promise<void> {
  await request.post('/agent/feedback', payload)
}
```

> 这里用 `request`（axios 实例）而不是 `fetch`，axios 拦截器会自动注入 `Authorization` + `traceparent` header。

### 任务 3：修改 `ChatBubble.vue`

修改 `@packages/frontend/src/components/chat/ChatBubble.vue`。

#### 改动 3.1：script setup 区追加 import + handler

在 `<script setup lang="ts">` 中，**追加**到现有 import 之后：

```typescript
import { IconThumbUp, IconThumbDown, IconEdit } from '@arco-design/web-vue/es/icon'
import { postFeedback } from '../../api/modules/agent'
```

> 如果 `@arco-design/web-vue/es/icon` 没有 `IconThumbUp` / `IconThumbDown`（不同 arco 版本不同），用 `IconStar` / `IconCloseCircle` 之类替代；或：
> ```typescript
> import { IconUp, IconDown } from '@arco-design/web-vue/es/icon'
> ```
> 实在不行就直接用文字 `👍 / 👎`，体验也 OK。

紧接着，在 `onSend` 函数之后**追加**：

```typescript
async function onFeedback(
  msgId: string,
  feedback: 'up' | 'down' | 'note',
): Promise<void> {
  const msg = chat.messages.find((m) => m.id === msgId)
  if (!msg) {
    return
  }
  if (msg.role !== 'assistant') {
    return
  }
  if (!msg.meta?.langsmith_run_id) {
    Message.warning('该消息缺少 trace 信息（可能是历史消息），无法反馈')
    return
  }
  if (feedback !== 'note' && msg.feedback === feedback) {
    return // 已点过同类型，幂等
  }

  let comment: string | undefined
  if (feedback === 'note') {
    const text = window.prompt('请输入备注（最多 200 字）：')
    if (text === null) {
      return
    }
    comment = text.trim().slice(0, 200) || undefined
    if (!comment) {
      return
    }
  }

  try {
    await postFeedback({
      thread_id: chat.currentThreadId ?? '',
      langsmith_run_id: msg.meta.langsmith_run_id,
      feedback,
      ...(comment ? { comment } : {}),
    })
    if (feedback !== 'note') {
      chat.setMessageFeedback(msgId, feedback)
    }
    Message.success(
      feedback === 'up' ? '已反馈：有用' : feedback === 'down' ? '已反馈：需改进' : '备注已提交',
    )
  } catch (e) {
    const m = e instanceof Error ? e.message : '反馈失败'
    Message.error(m)
  }
}
```

#### 改动 3.2：template 中给 AI 气泡追加按钮组

找到现有 template 中的 AI 气泡渲染（`<div v-if="m.role === 'assistant'" class="bubble bubble--assistant">`），**完整替换**该 div 块：

```html
          <div v-if="m.role === 'assistant'" class="bubble bubble--assistant">
            <div class="bubble-md chat-md" v-html="renderMarkdown(m.content)" />
            <div v-if="m.meta?.langsmith_run_id" class="bubble-actions">
              <button
                type="button"
                class="action-btn"
                :class="{ 'action-btn--active': m.feedback === 'up' }"
                :disabled="m.feedback === 'up'"
                aria-label="有用"
                @click="onFeedback(m.id, 'up')"
              >
                👍
              </button>
              <button
                type="button"
                class="action-btn"
                :class="{ 'action-btn--active': m.feedback === 'down' }"
                :disabled="m.feedback === 'down'"
                aria-label="需改进"
                @click="onFeedback(m.id, 'down')"
              >
                👎
              </button>
              <button
                type="button"
                class="action-btn"
                aria-label="添加备注"
                @click="onFeedback(m.id, 'note')"
              >
                ✏️
              </button>
            </div>
          </div>
```

#### 改动 3.3：`<style scoped>` 中追加按钮样式

在 `<style scoped>` 块末尾（`}` 闭合之前合适位置）**追加**：

```css
.bubble-actions {
  display: flex;
  gap: 4px;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed rgba(255, 255, 255, 0.08);
}

.action-btn {
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 6px;
  font-size: 14px;
  line-height: 1;
  opacity: 0.6;
  transition: opacity 0.15s ease, background 0.15s ease;
  color: var(--color-text-2, #94a3b8);
}

.action-btn:hover {
  opacity: 1;
  background: rgba(255, 255, 255, 0.06);
}

.action-btn:disabled {
  cursor: not-allowed;
}

.action-btn--active {
  opacity: 1;
  background: rgba(99, 102, 241, 0.25);
}
```

## 验证

### 验证步骤 1：编译通过

```bash
cd packages/frontend
pnpm typecheck
```

期望无错误。

### 验证步骤 2：dev 起来不白屏

```bash
pnpm dev
```

浏览器登录后发一条消息（如 `你好`）。

### 验证步骤 3：按钮可见

每条 AI 气泡底部应能看到一行 3 个按钮（👍 / 👎 / ✏️）。**初次发消息时**第一条 AI 回复可能因为 SSE trace 事件晚到导致 `meta.langsmith_run_id` 还没赋值，气泡底部不显示按钮——这是预期的；流结束后稍等 1 秒再看。

### 验证步骤 4：点击按钮行为（**后端 404 是预期的**）

点击 👍：

- 期望 Toast 显示 "反馈失败：Request failed with status code 404"（因为 Step 3 后端接口还没建好）
- 期望 Network 面板能看到一次 POST `/api/v1/agent/feedback` 请求
- 期望请求 body 含 `{ thread_id, langsmith_run_id, feedback: "up" }`
- 期望请求 header 含 `traceparent` + `Authorization`

> 关键是 **请求发出且 body 正确**。Toast 报 404 是预期，Step 3 实现后即转为成功。

### 验证步骤 5：备注弹窗

点击 ✏️ → 浏览器弹出 prompt 输入框 → 输入文字 → 确定 → Network 看到 POST，body 含 `comment` 字段。

### 故障排查

| 现象 | 原因 | 修复 |
|---|---|---|
| 气泡底部按钮不显示 | `m.meta.langsmith_run_id` 是空 | Phase 7-1 / Step 4 后端 SSE 改造未完成；或前端 `chat.setAssistantMeta` 未注册 |
| Toast 显示 "无法反馈"（缺少 trace 信息） | meta 字段未赋值 | 同上 |
| Icon 编译报错 | arco 版本里没那个 icon 名 | 用 emoji（👍 / 👎 / ✏️）即可，已在改动 3.2 中默认用 emoji |
| 按钮点击没反应 | onFeedback handler 没绑定 | 检查 @click="onFeedback(m.id, 'up')" 拼写 |

## 完成后

### 更新 PROGRESS.md

```
| 7-3-2 | 前端反馈 UI（P3） | ✅ | <今天日期> | ChatBubble.vue 三按钮 + postFeedback API + chat store setMessageFeedback；点击 POST 已发出（后端 Step 3 完成前会 404） |
```

### git commit

```bash
git add packages/frontend/src/stores/chat.ts \
        packages/frontend/src/api/modules/agent.ts \
        packages/frontend/src/components/chat/ChatBubble.vue \
        docs/monitor/PROGRESS.md

git commit -m "$(cat <<'EOF'
feat(monitor): phase-7-3 step-2 前端反馈 UI 三按钮

- ChatBubble.vue 每条 AI 气泡底部加 👍/👎/✏️ 三按钮
- 已反馈类型按钮 disable + 高亮 (action-btn--active)
- 备注用浏览器 prompt 输入（最多 200 字）
- api/modules/agent.ts 新增 postFeedback API
- chat store 加 feedback 字段 + setMessageFeedback action
- 依赖 Phase 7-1 注入的 meta.langsmith_run_id；缺失则按钮不显示
- DoD: Network 可见 POST /agent/feedback 请求 body 完整
  (Step 3 后端实现前会返回 404，正常)

ref: docs/monitor/PROGRESS.md 7-3-2
EOF
)"
```
