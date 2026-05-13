# Phase 7-1 / Step 1：启用 LangSmith 自动 trace（仅配置，无代码）

## 上下文

监控体系 Phase 7-1 的第一步。**仅修改 `.env` 与 `.env.example`、启动 Agent、人工在 LangSmith Web 端核对**，**不写任何代码**。

执行前必读：

- `@docs/monitor/REQUIREMENTS.md`（§8 决策 #1：LangSmith Cloud SaaS）
- `@docs/monitor/1.PRD.md` §5.1.1（验收清单）
- `@docs/monitor/PROGRESS.md`（接力棒）
- `@.env`（确认 LangSmith 相关变量已配置）

前置条件：

- 已注册 LangSmith 账号（https://smith.langchain.com）
- `.env` 中 `LANGSMITH_API_KEY` 已是真实有效值（非占位符）
- `redis-cli ping` 输出 `PONG`、`curl http://localhost:6333/healthz` 通过

## 任务

### 任务 1：核对并补齐 `.env`

打开 `@.env`，确保以下 4 行存在且非占位值：

```dotenv
LANGSMITH_API_KEY=lsv2_pt_<实际密钥>
LANGCHAIN_TRACING_V2=true
LANGCHAIN_PROJECT=plan2code-agent
LANGCHAIN_ENDPOINT=https://api.smith.langchain.com
```

> **建议**：把 `LANGCHAIN_PROJECT` 改为可识别的本地名，如 `plan2code-<你的名字>-local`，便于多人协作时区分。

### 任务 2：核对并补齐 `.env.example`

打开 `@.env.example`，确保上面 4 行也存在（key 名一致、value 用占位符）。这是给新接手开发者的模板，**不能含真实 key**：

```dotenv
LANGSMITH_API_KEY=your_langsmith_api_key
LANGCHAIN_TRACING_V2=true
LANGCHAIN_PROJECT=plan2code-agent
LANGCHAIN_ENDPOINT=https://api.smith.langchain.com
```

### 任务 3：（一次性）确认 LangGraph 启动端口

打开 `@.env`，确认：

```dotenv
LANGGRAPH_API_URL=http://localhost:8123
```

**重要**：监控体系开发期统一使用 8123 端口（覆盖 `langgraph dev` 默认的 2024）。后端 `agent.service.ts` 已通过该变量读取，无需改后端代码。

## 验证

### 验证步骤 1：启动 Agent

```bash
cd packages/agent
uv run langgraph dev --port 8123
```

期望输出包含：

```
LangGraph API:    http://127.0.0.1:8123
- 🚀 API: http://127.0.0.1:8123
- 🎨 Studio UI: https://smith.langchain.com/studio?baseUrl=http://127.0.0.1:8123
- 📚 API Docs: http://127.0.0.1:8123/docs
```

### 验证步骤 2：触发一次 trace

启动后端与前端（另两个终端）：

```bash
# 终端 2
cd packages/backend && pnpm start:dev

# 终端 3
cd packages/frontend && pnpm dev
```

浏览器打开 `http://localhost:5173` → 登录（admin / admin）→ 右下角聊天气泡发一条消息，比如 `你好`。

### 验证步骤 3：LangSmith Web 端核对

打开 https://smith.langchain.com → 左侧菜单 **Projects** → **应该能看到**你 `.env` 中 `LANGCHAIN_PROJECT` 的名字（如 `plan2code-agent` 或你的本地名）。

点进去后：

- **应当看到至少 1 条 trace**（刚才那次对话）
- **点开 trace** → 应能看到 span 树：根节点（如 `LangGraph`）→ `chat_node` → 若调用了工具还会有 `tool_node_with_retry`
- **每个 span 都有 `latency`、`input`、`output` 字段可见**

### 故障排查

| 现象 | 原因 | 修复 |
|---|---|---|
| LangSmith 看不到 project | `LANGCHAIN_TRACING_V2` 不是 `true`，或 `.env` 改完没重启 Agent | 重启 `uv run langgraph dev --port 8123` |
| project 有但 trace 数=0 | API key 失效 / 网络不通 | 终端 `curl -H "x-api-key: $LANGSMITH_API_KEY" https://api.smith.langchain.com/info` 验证 |
| 端口冲突 | 8123 被占 | `lsof -i :8123` 看占用者；杀掉或换端口（但需同步改 `.env` 的 `LANGGRAPH_API_URL`） |

## 完成后

### 更新 PROGRESS.md

打开 `@docs/monitor/PROGRESS.md`，找到 Phase 7-1 表格中的：

```
| 7-1-1 | LangSmith 启用与项目命名 | ⬜ | | ... |
```

改为：

```
| 7-1-1 | LangSmith 启用与项目命名 | ✅ | <今天日期> | LangSmith Web 已可见 project=<实际名>；首条 trace 已上报 |
```

### git commit（可选）

`.env` 不入 git，所以**通常无需 commit**。只有 `.env.example` 改动时才需要：

```bash
git add .env.example docs/monitor/PROGRESS.md
git commit -m "$(cat <<'EOF'
chore(monitor): phase-7-1 step-1 启用 LangSmith 自动 trace

- .env.example 补齐 LANGCHAIN_* 4 个变量占位
- PROGRESS.md 标记 7-1-1 完成
- 验证：LangSmith Web 可见 plan2code-agent project + 首条 trace

ref: docs/monitor/PROGRESS.md 7-1-1
EOF
)"
```
