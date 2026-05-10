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

**Phase 2 整体：✅ 已完成（2026-05-09）**

| 步骤 | 描述 | 状态 | 完成时间 | 备注 |
|------|------|------|----------|------|
| 2-1 | DAO 抽象层 + SQLite TypeORM | ✅ | 2026-05-09 | TypeORM better-sqlite3、五类实体与 M2M、DAO 接口 + SQLite 实现、`DaoModule` token 注入 |
| 2-2 | User 模块 | ✅ | 2026-05-09 | User CRUD + 分配角色、bcrypt 密码、`ResponseInterceptor` / `HttpExceptionFilter`、全局 `api/v1` 前缀与 `ValidationPipe` |
| 2-3 | JWT 认证 + 内置 admin/admin | ✅ | 2026-05-09 | `AuthModule`（login/refresh、Passport JWT）、守卫与装饰器、环境变量签发 access/refresh、`AdminBootstrapService` 种子 admin + `*` 权限与角色、`UserController` 受 `JwtAuthGuard` 保护 |
| 2-4 | Role + Permission RBAC | ✅ | 2026-05-09 | PermissionModule（预置权限 + GET 分组列表）、RoleModule（CRUD + 分配权限）、User 路由挂 PermissionsGuard、`IPermissionDao.findAllOrdered` |
| 2-5 | Student 模块 (CRUD+批量) | ✅ | 2026-05-09 | `StudentModule`、DTO、DAO 扩展 `findByStudentNo` / `deleteMany`、keyword 仅姓名/学号 |
| 2-6 | Agent 代理层 (SSE 流式转发) | ✅ | 2026-05-09 | `AgentModule` + `HttpService` 转发 LangGraph `/threads` 与 `/runs/stream`；`messages-tuple`+`updates` 映射 token / 前端 tool_call；`SkipResponseWrap` 避免 SSE 被 JSON 包装 |
| 2-7 | WebSocket Gateway | ✅ | 2026-05-09 | `WsModule` + `/ws` 命名空间、JWT（query/auth/Authorization）、在线 Map、`tools:update` 缓存、`tool:result` 总线、RTC 占位；`AgentService` 合并 WebSocket 工具列表 |

## Phase 3: 前端基础页面 (预计 3 天)

**Phase 3 整体：✅ 已完成（2026-05-09）**

| 步骤 | 描述 | 状态 | 完成时间 | 备注 |
|------|------|------|----------|------|
| 3-1 | Arco Design + 主题 + 布局 | ✅ | 2026-05-09 | 深色主题、`AppLayout`、Pinia `auth`、路由与基础守卫、占位页面与极简登录联调布局 |
| 3-2 | 登录页面 + Token 管理 | ✅ | 2026-05-09 | `LoginView` 深色渐变卡片、`auth` API `login`/`refreshToken`、Pinia 登录后拉取用户详情、登出跳转、`request` 401 同步清理 refresh 与用户缓存 |
| 3-3 | 路由权限守卫 + 动态菜单 | ✅ | 2026-05-09 | `permission` store 从 `routes` 派生菜单；`AppLayout` 面包屑 + 侧栏联动；`DashboardView` 展示账号摘要 |
| 3-4 | 账号管理页面 | ✅ | 2026-05-09 | `user` API 全量 CRUD + 分配角色；`UserListView` 分页搜索与权限按钮 |
| 3-5 | 角色管理页面 | ✅ | 2026-05-09 | `role`/`permission` API、`RoleListView` 表格与弹窗；列表接口附带权限摘要便于分配回显；`user` 模块复用 `fetchRolesPage` |
| 3-6 | 学生管理页面 | ✅ | 2026-05-09 | `api/modules/student` 分页/CRUD/批量；`StudentListView` 搜索、列排序（当前页）、行多选、批量删除与批量导入弹窗；`student:*` 控制按钮 |

## Phase 4: AI 对话集成 (预计 3 天)

| 步骤 | 描述 | 状态 | 完成时间 | 备注 |
|------|------|------|----------|------|
| 4-1 | 浮动聊天气泡组件 | ✅ | 2026-05-09 | `ChatBubble.vue`、`stores/chat`、markdown-it、AppLayout 挂载 |
| 4-2 | SSE 流式聊天 | ✅ | 2026-05-09 | `api/modules/agent` fetch SSE、`useChat` 解析 `token`/`tool_call`/`done`/`error`、Pinia `chat` 流式占位与 `thread_id` 续聊、`ChatBubble` 接入 |
| 4-3 | 前端工具 schema 定义 (Agent 端) | ✅ | 2026-05-10 | `schemas.py` 四工具（navigate/create/delete/query）、`frontend/__init__` 注册、`chat_node` 按 `available_frontend_tools` 按需加载 |
| 4-4 | 结构化输出 → WebSocket → 前端执行 | ✅ | 2026-05-10 | `AgentService` 推送 `tool:invoke`、`useWebSocket.ts` Socket.io 连接与监听、`useToolExecutor.ts` 四工具 handler + Modal.confirm、`AppLayout` 初始化 WS |
| 4-4 | 结构化输出 → WebSocket → 前端执行 | ✅ | 2026-05-10 | `AgentService` 推送 `tool:invoke`、`useWebSocket.ts` Socket.io 连接与监听、`useToolExecutor.ts` 四工具 handler + Modal.confirm、`AppLayout` 初始化 WS |
| 4-5 | 前端工具注册中心 (按页面按需) | ✅ | 2026-05-10 | `useToolRegistry` composable、`bindSocketToRegistry` 绑定 WebSocket、`AppLayout` 注册 navigate、`StudentListView` 注册学生工具、`ChatBubble` 动态读取 `available_tools` |
| 4-6 | 对话触发学生 CRUD | ✅ | 2026-05-10 | 端到端联调通过；在 `useToolExecutor` 和 `StudentListView` 间增加 `student:refresh` 事件实现列表自动刷新 |

## Phase 5: RAG 知识库 (预计 2 天)

| 步骤 | 描述 | 状态 | 完成时间 | 备注 |
|------|------|------|----------|------|
| 5-1 | 文件上传 + 文本解析 | ✅ | 2026-05-10 | 安装 multer/pdf-parse，创建 KnowledgeModule 接收 txt/md/pdf 上传，解析文本并存入 SQLite，预留发给 Agent 的接口通路 |
| 5-2 | Embedding + Qdrant 存储 | ✅ | 2026-05-10 | Agent 新增 `rag/indexer.py`，并通过 LangGraph 自定义路由暴露 `POST /knowledge/ingest` |
| 5-3 | RAG 检索 (按角色过滤) | ✅ | 2026-05-10 | Agent 新增 `rag/retriever.py` 和 `search_knowledge_base` 工具，支持按 `role_ids` 过滤召回 |
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
| 2026-05-09 | Phase 2 Step 2-2：`UserModule`（DTO/Service/Controller）、`IUserDao` 扩展 `findByUsername` / `findWithRolesById` / `assignRoles`、全局响应包装与异常过滤器、`main` 全局前缀与校验管道 |
| 2026-05-09 | Phase 2 Step 2-3：JWT 登录与刷新、`JwtStrategy`、通用守卫/装饰器、DAO 扩展（`findByCode` / `findByName` / `setPermissions`）、内置 admin 种子、`tsconfig` 关闭 declaration 以规避 PassportStrategy 声明文件问题 |
| 2026-05-09 | Phase 2 Step 2-4：`PermissionModule` / `RoleModule`、预置权限种子、`IPermissionDao.findAllOrdered`、`UserController` 细粒度权限、`PermissionsGuard` 文档说明 |
| 2026-05-09 | Phase 2 Step 2-5：`StudentModule`（CRUD + 批量创建/删除）、JWT + `student:*` 权限、`IStudentDao` 扩展 |
| 2026-05-09 | Phase 2 Step 2-6：`AgentModule`（`POST /agent/chat` SSE）、`LANGGRAPH_API_URL`、`SkipResponseWrap` + `ResponseInterceptor` 跳过包装 |
| 2026-05-09 | Phase 2 Step 2-7：`WsModule` / `AppGateway`（Socket.IO `/ws`）、`UserFrontendToolsService` 与 `FrontendToolResultBus`、`AgentService` 合并缓存工具名；Phase 2 收尾提交 |
| 2026-05-09 | Phase 3 Step 3-1：Arco 深色主题、`theme.css`、`AppLayout`（侧栏/顶栏/`router-view`）、`auth` store、`router`+`routes`+`guard`、占位视图与可登录验证布局（需后端 `admin/admin`） |
| 2026-05-09 | Phase 3 Step 3-2：登录页视觉与默认 `admin/admin`、`api/modules/auth` 契约方法、登录后 `GET /users/:id` 同步权限、登出整页跳转登录、401 清理全套本地会话键 |
| 2026-05-09 | Phase 3 Step 3-3：`stores/permission` 按权限过滤侧栏（与 `meta.permissions` 及 `*` 一致）、顶栏面包屑、`DashboardView` 账号信息卡片 |
| 2026-05-09 | Phase 3 Step 3-4：`api/modules/user` 列表/增删改/分配角色 + 角色下拉；`UserListView` 表格与弹窗、`hasPermission` 控制按钮 |
| 2026-05-09 | Phase 3 Step 3-5：`api/modules/role` + `permission`；`RoleListView` 增删改与按分组分配权限；角色列表 DTO 附带权限摘要；`user` 复用角色分页 API |
| 2026-05-09 | Phase 3 Step 3-6：`api/modules/student`；`StudentListView` 分页搜索、表格排序、增删改、批量删除/导入；Phase 3 收尾 |
| 2026-05-09 | Phase 4 Step 4-1：`ChatBubble.vue`、`stores/chat`、markdown-it、AppLayout 挂载浮动对话与模拟回复 |
| 2026-05-09 | Phase 4 Step 4-2：`streamChat` + `useChat` 对接 `POST /api/v1/agent/chat` SSE；移除本地模拟回复；首字节前 typing、流中更新助手气泡 |
| 2026-05-10 | Phase 4 Step 4-3：`tools/frontend/schemas.py` 四工具 schema（navigate_to_page / create_student / delete_student / query_students）、`frontend/__init__` 注册到 registry、`chat_node` 按 `available_frontend_tools` 按需加载前端工具 |
| 2026-05-10 | Phase 4 Step 4-4：`AgentService` 注入 `AppGateway` + `pushToolInvoke` WebSocket 推送；`useToolExecutor.ts` 四工具 handler + Arco Modal.confirm 确认弹窗；`useWebSocket.ts` Socket.io 连接 + `tool:invoke` 监听 + `tool:result` 回传；`AppLayout` 初始化 WS |
| 2026-05-10 | Phase 4 Step 4-5：创建 `useToolRegistry.ts` (按页面按需注册前端工具)；在 `useWebSocket.ts` 中绑定 Socket 以在工具变化时 `notifyBackend()` (`tools:update`)；在 `AppLayout` 注册 `navigate_to_page`；在 `StudentListView` 注册学生 CRUD 工具并在卸载时自动注销；修改 `ChatBubble` 使其在 `sendMessage` 时动态获取可用工具 (`getRegisteredToolNames()`) |
| 2026-05-10 | Phase 4 Step 4-6：修复了对话 CRUD 中，代理成功创建/删除后页面列表未更新的问题。在 `useToolExecutor` 加入 `CustomEvent('student:refresh')` 派发逻辑，`StudentListView` 监听此事件执行刷新 |
| 2026-05-10 | Phase 5 Step 5-1：创建 `KnowledgeModule`、`KnowledgeController` 和 `KnowledgeService`。引入 `multer` 和 `pdf-parse`，实现 `POST /api/v1/knowledge/upload` 接口，支持 `.txt`, `.md`, `.pdf` 文本解析，并将知识库元数据存入 `knowledge_bases` 表，为下一步集成 Agent 向量化预留了 HTTP 发送逻辑 |
| 2026-05-10 | Phase 5 Step 5-2：`packages/agent` 新增 `src/rag/indexer.py`（切片+Embedding+Qdrant upsert），新增 `src/webapp.py` 暴露 `POST /knowledge/ingest`，并在 `langgraph.json` 中挂载 `http.app` 供后端触发索引 |
| 2026-05-10 | Phase 5 Step 5-3：`packages/agent` 新增 `src/rag/retriever.py`（按 `role_ids` 过滤检索 `knowledge_base`）与 `src/tools/builtin/rag_tool.py`，并在 builtin 工具注册中心接入 `search_knowledge_base` |
