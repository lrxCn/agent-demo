# 项目进度追踪

> 这个文件是 Cursor 的「接力棒」。每完成一步后更新状态。
> 新开 Cursor 会话时，让它先读这个文件了解当前进度。

## 状态标记
- ⬜ 未开始
- 🔄 进行中
- ✅ 已完成
- ❌ 有问题需修复

---

## Phase 0: 项目脚手架 (预计 1 天)

**Phase 0 整体：✅ 已完成（2026-05-09）**

| 步骤 | 描述 | 状态 | 完成时间 | 备注 |
|------|------|------|----------|------|
| 0-1 | 初始化 monorepo + pnpm workspace + git | ✅ | 2026-05-09 | |
| 0-2 | 创建 .cursor/rules/ 规则文件 | ✅ | 已由 Antigravity 生成 | |
| 0-3 | 创建 docs/ 文档 | ✅ | 已由 Antigravity 生成 | |
| 0-4 | 初始化 NestJS backend | ✅ | 2026-05-09 | Nest 10 + 依赖与目录占位 |
| 0-5 | 初始化 Vue3 frontend | ✅ | 2026-05-09 | Vite + Arco 按需、代理、axios 封装与目录占位 |
| 0-6 | 初始化 Python agent (uv + langgraph) | ✅ | 2026-05-09 | uv 依赖、`langgraph.json`、最小 State + chat 图 |
| 0-7 | 配置 .env 环境变量 | ✅ | 2026-05-09 | 根目录 `.env`、`.env.example` 占位；`.gitignore` 已含 `.env` |

## Phase 1: Agent 核心 (预计 3 天)

**Phase 1 整体：✅ 已完成（2026-05-09）**

| 步骤 | 描述 | 状态 | 完成时间 | 备注 |
|------|------|------|----------|------|
| 1-1 | LangGraph State + 基础图结构 | ✅ | 2026-05-09 | chat → 条件边 → ToolNode → chat |
| 1-2 | 工具注册中心 ToolRegistry | ✅ | 2026-05-09 | `src/tools/registry.py` 单例与筛选 API |
| 1-3 | 内置工具（天气、计算器等） | ✅ | 2026-05-09 | `calculate` / `get_current_time` + 图绑定 ToolNode |
| 1-4 | 工具调用重试机制 | ✅ | 2026-05-09 | `retry.py` 同步重试 + 指数退避 |
| 1-5 | 超时检测 | ✅ | 2026-05-09 | `tool_node` 单工具总超时 30s（线程池） |
| 1-6 | 失败回退节点 | ✅ | 2026-05-09 | `after_tools` → `fallback` → END |
| 1-7 | Redis 短期记忆 (thread_id) | ✅ | 2026-05-09 | `pnpm dev:agentLocal` + `PLAN2CODE_AGENT_CLI_MODE` 时 Redis；`langgraph dev` 不传 checkpointer；`src/cli` + prompt_toolkit |
| 1-8 | Mem0 + Qdrant 长期记忆 (user_id) | ✅ | 2026-05-09 | `long_term.py` + `chat_node` 检索注入与 `save_memories`；`EMBEDDING_MODEL_DIMS` 与 Qdrant 集合一致 |
| 1-9 | langgraph-cli 启动并测试 | ✅ | 2026-05-09 | `uv run langgraph dev` 默认 API 为 `http://127.0.0.1:2024`（非 8123）；`/threads` + `/threads/{id}/runs` curl 验证通过 |

## Phase 2: NestJS 后端 (预计 3 天)

| 步骤 | 描述 | 状态 | 完成时间 | 备注 |
|------|------|------|----------|------|
| 2-1 | DAO 抽象层 + SQLite TypeORM | ✅ | 2026-05-09 | TypeORM better-sqlite3、五类实体与 M2M、DAO 接口 + SQLite 实现、`DaoModule` token 注入 |
| 2-2 | User 模块 | ⬜ | | |
| 2-3 | JWT 认证 + 内置 admin/admin | ⬜ | | |
| 2-4 | Role + Permission RBAC | ⬜ | | |
| 2-5 | Student 模块 (CRUD+批量) | ⬜ | | |
| 2-6 | Agent 代理层 (SSE 流式转发) | ⬜ | | |
| 2-7 | WebSocket Gateway | ⬜ | | |

## Phase 3: 前端基础页面 (预计 3 天)

| 步骤 | 描述 | 状态 | 完成时间 | 备注 |
|------|------|------|----------|------|
| 3-1 | Arco Design + 主题 + 布局 | ⬜ | | |
| 3-2 | 登录页面 + Token 管理 | ⬜ | | |
| 3-3 | 路由权限守卫 + 动态菜单 | ⬜ | | |
| 3-4 | 账号管理页面 | ⬜ | | |
| 3-5 | 角色管理页面 | ⬜ | | |
| 3-6 | 学生管理页面 | ⬜ | | |

## Phase 4: AI 对话集成 (预计 3 天)

| 步骤 | 描述 | 状态 | 完成时间 | 备注 |
|------|------|------|----------|------|
| 4-1 | 浮动聊天气泡组件 | ⬜ | | |
| 4-2 | SSE 流式聊天 | ⬜ | | |
| 4-3 | 前端工具 schema 定义 (Agent 端) | ⬜ | | |
| 4-4 | 结构化输出 → WebSocket → 前端执行 | ⬜ | | |
| 4-5 | 前端工具注册中心 (按页面按需) | ⬜ | | |
| 4-6 | 对话触发学生 CRUD | ⬜ | | |

## Phase 5: RAG 知识库 (预计 2 天)

| 步骤 | 描述 | 状态 | 完成时间 | 备注 |
|------|------|------|----------|------|
| 5-1 | 文件上传 + 文本解析 | ⬜ | | |
| 5-2 | Embedding + Qdrant 存储 | ⬜ | | |
| 5-3 | RAG 检索 (按角色过滤) | ⬜ | | |
| 5-4 | 知识库管理页面 | ⬜ | | |
| 5-5 | 集成到 Agent 对话 | ⬜ | | |

## Phase 6: WebRTC 语音 (预计 3 天)

| 步骤 | 描述 | 状态 | 完成时间 | 备注 |
|------|------|------|----------|------|
| 6-1 | WebSocket 信令服务 | ⬜ | | |
| 6-2 | PeerJS 语音通话 | ⬜ | | |
| 6-3 | 音频文件发送 | ⬜ | | |
| 6-4 | Whisper STT 转文字 | ⬜ | | |
| 6-5 | 通话文本存 RAG | ⬜ | | |
| 6-6 | AI 查询通话内容 | ⬜ | | |

---

## 已知问题
<!-- 在这里记录发现的 bug 或待解决的问题 -->

## 变更记录
| 日期 | 变更内容 |
|------|----------|
| 2026-05-09 | 项目初始化，由 Antigravity 生成规则文件和文档 |
| 2026-05-09 | Phase 0 Step 0-1：初始化 monorepo、pnpm workspace、.gitignore、packages/、git 仓库 |
| 2026-05-09 | Phase 0 Step 0-4：`packages/backend` NestJS 脚手架、核心/WebSocket/HTTP 依赖、模块目录占位、`ConfigModule` |
| 2026-05-09 | Phase 0 Step 0-5：`packages/frontend` Vite Vue-TS、Arco/Pinia/Router/axios、Vite 代理与 `src/api/request.ts` |
| 2026-05-09 | Phase 0 Step 0-6：`packages/agent` uv、LangGraph/LangChain/mem0/Qdrant/redis、`settings.py`、最小可编译图 |
| 2026-05-09 | Phase 0 Step 0-7 与 Phase 0 收尾：根目录 `.env` / `.env.example`，验证三端可读配置；`feat: Phase 0 完成` 提交 |
| 2026-05-09 | Phase 1 Step 1-1：`builder.py` 条件路由 + `ToolNode` + `bind_tools`（工具列表占位，待 1-2/1-3 接入） |
| 2026-05-09 | Phase 1 Step 1-2：`ToolRegistry` / `ToolMeta`、`get_tools` 筛选与全局 `registry` |
| 2026-05-09 | Phase 1 Step 1-3：内置 `calculate` / `get_current_time`，`builder` 集成 registry 与 ToolNode |
| 2026-05-09 | Phase 1 Step 1-4/1-5：`retry.py`、`nodes.tool_node_with_retry`，替换预置 ToolNode |
| 2026-05-09 | Phase 1 Step 1-6：`after_tools`、`fallback_node`，工具失败则 `fallback` → END |
| 2026-05-09 | Phase 1 Step 1-7：`langgraph-checkpoint-redis`、`get_redis_checkpointer` + 图编译接入 Redis checkpointer |
| 2026-05-09 | 本地 CLI：`pnpm dev:agentLocal`、`PLAN2CODE_AGENT_CLI_MODE` 下 Redis checkpoint；`langgraph dev` 不传 checkpointer；`src/cli` + `prompt-toolkit` |
| 2026-05-09 | Phase 1 Step 1-8：`memory/long_term.py`（Mem0+Qdrant+`embedding_model_dims`）、`nodes.chat_node` 记忆检索与保存 |
| 2026-05-09 | Phase 1 Step 1-9：`langgraph dev` 本地验证；`langgraph.json` 已对齐；Phase 1 收尾提交 |
| 2026-05-09 | Phase 2 Step 2-1：TypeORM + SQLite、`*.entity`、DAO 接口与 `sqlite` 实现、`DaoModule`、`main` 创建 `data/` |
