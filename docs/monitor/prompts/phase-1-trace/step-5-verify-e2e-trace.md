# Phase 7-1 / Step 5：端到端 trace 验证（DoD-1）

## 上下文

Phase 7-1 的收尾步骤。**这一步几乎不写代码**，只跑验证脚本 + 浏览器操作，确认 4 条断言全部成立。

执行前必读：

- `@docs/monitor/REQUIREMENTS.md` §9（DoD 6 条之 DoD-1）
- `@docs/monitor/1.PRD.md` §5.2.5（端到端验证场景）
- `@docs/monitor/3.ARCHITECTURE.md` §5.1（数据流 1）
- `@docs/monitor/PROGRESS.md`

前置条件：

- 7-1-1 / 7-1-2 / 7-1-3 / 7-1-4 全部 ✅

## 任务

### 任务 1：清场，启动干净三端

```bash
# 终端 1
cd packages/agent && uv run langgraph dev --port 8123

# 终端 2
cd packages/backend && pnpm start:dev

# 终端 3
cd packages/frontend && pnpm dev
```

确认三端均无报错启动。

### 任务 2：正常路径验证（4 条断言）

#### 断言 A：前端 Console 输出 trace_id

1. 浏览器打开 `http://localhost:5173`
2. 登录（admin / admin）
3. 打开 DevTools → Console，开启 Verbose 级别
4. 右下角聊天气泡 → 输入 `2026 是闰年吗？` → 发送
5. **记录** Console 输出的 3 行 `[trace]` 日志，特别是第一行的 trace_id（32 位 hex）。

复制到剪贴板待用。

#### 断言 B：后端日志同 trace_id 跨多行

切到后端终端，按 `Cmd+F` / `Ctrl+F` 搜索断言 A 那个 trace_id，**应当至少匹配 2 行**：

- 一行来自 `HTTP` logger（HTTP 请求出入日志）
- 一行来自 `AgentService` logger（streamChat 入口）

如果 `[Nest]` 日志被颜色码污染影响搜索，可以重定向到文件：

```bash
# 重启后端时
cd packages/backend
pnpm start:dev 2>&1 | tee /tmp/backend.log

# 在另一个终端搜
grep "abc123..." /tmp/backend.log
```

#### 断言 C：LangSmith trace 详情页 metadata 含同 trace_id

1. 打开 https://smith.langchain.com
2. 进入对应 Project
3. 找到刚才那条 trace（按时间排序最新一条）
4. 点开 → 右侧或顶部找到 **Metadata** 区域
5. 应该看到：

```json
{
  "app_trace_id": "<断言 A 的 trace_id>",
  "mem0_user_id": "<admin 用户的 UUID>",
  "thread_id": "<某 UUID>",
  "role_ids": ["<admin 角色 UUID>"]
}
```

#### 断言 D：LangSmith Filter 精确命中

在 LangSmith UI 的 Filter 输入框中粘贴：

```
metadata.app_trace_id = "<断言 A 的 trace_id 完整粘贴>"
```

应当**精确命中 1 条** trace。

### 任务 3：错误路径验证（trace 仍可追溯）

#### 制造一次工具失败

在前端聊天气泡输入：

```
帮我计算 1/0
```

`calculate` 工具应该会抛错，触发 `fallback_node`。

#### 断言 E：错误路径 trace_id 仍能回溯

1. 拿到前端 Console 的新 trace_id
2. 在 LangSmith 上 Filter `metadata.app_trace_id = "<...>"`
3. 应能精确命中 1 条 trace
4. 展开 span 树，应能看到：
   - `chat_node` ✓
   - `tool_node_with_retry` → 红色（error）
   - `fallback_node` ✓

### 任务 4：fallback 路径验证（traceparent 缺失）

直接用 `curl` 调一个不带 traceparent 的 API：

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin"}' \
  | grep -o '"access_token":"[^"]*' | cut -d '"' -f4)

curl -s -i http://localhost:3000/api/v1/permissions \
  -H "Authorization: Bearer $TOKEN" | head -20
```

后端日志应当看到：

```
[Nest] ... DEBUG [TraceInterceptor] traceparent 缺失，fallback 生成 trace_id=<hex> path=GET /api/v1/permissions
[Nest] ... LOG [HTTP] {"trace_id":"<同 hex>","trace_origin":"backend",...}
```

**关键**：`trace_origin = backend`。这是 fallback 验证。

## 验证

把任务 2 / 3 / 4 的 5 条断言全部画对勾 = 本 phase 验收通过。

| 断言 | 描述 | 状态 |
|---|---|---|
| A | 前端 Console 输出 3 行 `[trace]` 日志 | ⬜ |
| B | 后端日志中同 trace_id 跨多行 | ⬜ |
| C | LangSmith metadata.app_trace_id 与前端 trace_id 一致 | ⬜ |
| D | LangSmith Filter `metadata.app_trace_id = "..."` 精确命中 | ⬜ |
| E | 错误路径（fallback_node）trace 仍可回溯 | ⬜ |
| F | 无 header 时 backend fallback 生成 trace_id 且标记 `trace_origin=backend` | ⬜ |

> ⚠️ 任何一项不通过 → **不要标 ✅**。回到对应 step 的"故障排查"段处理。

## 完成后

### 更新 PROGRESS.md

#### 改动 1：标记 7-1-5 完成

```
| 7-1-5 | 端到端 trace 验证 | ✅ | <今天日期> | 6 条断言全部通过；DoD-1 已达成 |
```

#### 改动 2：在 PROGRESS.md 顶部"Phase 7-1 整体"标识改为 ✅

找到：

```
## Phase 7-1：全链路 Trace（目标 2，P0 基石）

**整体：⬜ 未开始**（预估 1.5 天）
```

**改为**：

```
## Phase 7-1：全链路 Trace（目标 2，P0 基石）

**整体：✅ 已完成（<今天日期>）**（实际工期：<实际天数>）
```

#### 改动 3：DoD 表中 DoD-1 标 ✅

找到：

```
| DoD-1 | trace 闭环 | ⬜ | 前端 → LangSmith 看到完整 chat_node → tool_call → tool_result 链路 |
```

**改为**：

```
| DoD-1 | trace 闭环 | ✅ | 前端 → LangSmith 看到完整 chat_node → tool_call → tool_result 链路 |
```

### git commit

```bash
git add docs/monitor/PROGRESS.md

git commit -m "$(cat <<'EOF'
chore(monitor): phase-7-1 step-5 端到端 trace 验证通过

6 条断言全部通过：
- 前端 Console 输出 3 行 [trace] 日志
- 后端日志同 trace_id 跨多行
- LangSmith metadata.app_trace_id 与前端一致
- LangSmith Filter 精确命中
- 错误路径 (fallback_node) trace 可回溯
- 无 header 时 backend fallback 生成 trace_id + trace_origin=backend

DoD-1 ✅；Phase 7-1 整体完成。

ref: docs/monitor/PROGRESS.md Phase 7-1
EOF
)"
```

### 下一步

Phase 7-1 完成后，按 `DEVELOPER_GUIDE.md` §6 的依赖图，可以**并行**：

- **Phase 7-2**（Observability，0.5 天，LangSmith Web 配置 + 1 处代码改 `rag:hit/miss` tag）
- **Phase 7-3**（Eval，2 天，前端反馈按钮 + 后端 LangSmith REST + CLI Runner）

建议先做 Phase 7-2（短而快），让看板"真的有人看"。
