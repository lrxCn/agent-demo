# Phase 4 - Step 4: 结构化输出 → WebSocket → 前端执行

## 上下文
前端工具 schema 已定义。现在打通 Agent → NestJS → 前端 的工具调用链路。

## 任务

### 1. 修改 NestJS Agent Service
当 SSE 流中检测到 tool_call 且工具名属于前端工具时：
- 通过 WebSocket 将 tool_call 事件发送给对应的前端用户
- 等待前端返回执行结果
- 将结果回传给 Agent 继续对话

### 2. 修改前端 WebSocket 连接
`src/composables/useWebSocket.ts`：
```typescript
// 连接 ws://localhost:3000/ws?token=xxx
// 监听 'tool:invoke' 事件
// 收到工具调用请求后：
//   - 如果 requireConfirm = true → 显示确认弹窗
//   - 用户确认后执行 handler
//   - 发送 'tool:result' 事件回传结果
```

### 3. 前端工具执行器
`src/composables/useToolExecutor.ts`：
```typescript
// 根据工具名找到对应的 handler 并执行
// navigate_to_page → router.push(path)（需确认）
// create_student → 调用 student API（需确认）
// delete_student → 调用 student API（需确认）
// query_students → 调用 student API（自动执行，不需确认）
```

### 4. 确认弹窗组件
使用 Arco Design 的 Modal.confirm()，显示操作描述让用户选择确认或取消。

## 验证
- 在聊天中说"帮我跳转到学生管理页面" → 弹出确认 → 确认后跳转
- 在学生管理页面说"帮我创建一个叫李四的学生" → 弹出确认 → 确认后创建

## 完成后
更新 PROJECT_STATUS.md 标记 4-4 为 ✅
