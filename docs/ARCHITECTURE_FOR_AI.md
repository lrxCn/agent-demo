# 架构说明（Cursor 专用）

本文件是 ARCHITECTURE.md 的 Cursor 友好版本。用纯文字描述系统架构，方便 AI 理解。
人类可读版本请看 ARCHITECTURE.md。

## 系统组成

本项目是 monorepo，包含 3 个子项目：

1. packages/agent/ — Python LangGraph Agent（端口 8123）
2. packages/backend/ — NestJS 后端（端口 3000）
3. packages/frontend/ — Vue3 前端（端口 5173）

## 通信方式

- 前端 和 后端 之间：REST API（JSON）+ SSE（流式对话）+ WebSocket（工具调用回传 + WebRTC 信令）
- 后端 和 Agent 之间：HTTP 请求（后端作为代理转发到 LangGraph API）
- 前端用户之间：WebRTC P2P（通过后端 WebSocket 做信令交换）

## 外部依赖服务

- Redis：地址 localhost:6379，用途是 LangGraph checkpointer（短期记忆，按 thread_id 隔离对话上下文）
- Qdrant：地址 localhost:6333，端口 6334 为 gRPC。用途有两个：1) Mem0 长期记忆存储（集合名 user_memories），2) RAG 知识库向量存储（集合名 knowledge_base）
- SiliconFlow API：地址 https://api.siliconflow.cn/v1，提供 LLM（DeepSeek-V3.2）、Embedding（BAAI/bge-large-zh-v1.5）、语音转文字（Whisper）

## Agent 层详细说明

位置：packages/agent/

目录结构：
- src/graph/state.py — 定义 AgentState（TypedDict），字段包括 messages、mem0_user_id、thread_id、available_frontend_tools
- src/graph/nodes.py — 图节点函数：chat_node（调用 LLM）、tool_node_with_retry（带重试的工具执行）、fallback_node（失败回退）
- src/graph/builder.py — 构建 StateGraph 并编译为 graph，导出给 langgraph.json 使用
- src/graph/retry.py — 工具重试逻辑：最多 3 次，指数退避（1s, 2s, 4s），超时 30 秒
- src/tools/registry.py — ToolRegistry 类，支持按 category（builtin/frontend）和 tags 筛选工具
- src/tools/builtin/ — 内置工具：calculate（数学计算）、get_current_time（当前时间）、search_knowledge_base（RAG 检索）、search_my_calls（通话记录查询）
- src/tools/frontend/schemas.py — 前端工具 schema：navigate_to_page、create_student、delete_student、query_students
- src/memory/short_term.py — 获取 Redis checkpointer 实例
- src/memory/long_term.py — Mem0 实例管理、search_memories()、save_memories()
- src/rag/indexer.py — 文档切片 + Embedding + Qdrant 存储。Payload 需包含 knowledge_base_id 和 role_ids（用于权限过滤）。
- src/rag/retriever.py — 向量检索。知识库检索需传入用户 role_ids 并使用 MatchAny 过滤；通话记录检索按 participant_ids 过滤。
- src/config/settings.py — 从 .env 读取所有配置

图的执行流程：
START → chat_node → 判断是否有 tool_calls → 有则进入 tool_node_with_retry → 工具执行后判断是否有失败 → 有失败走 fallback_node → END，无失败回 chat_node → 无 tool_calls 则直接 END

工具按需加载机制：
chat_node 中，先从 registry 获取所有 builtin 工具，再根据 state 中的 available_frontend_tools 列表（由前端通过 WebSocket 实时更新）从 registry 获取匹配的 frontend 工具。只有当前页面注册的前端工具才会被注入到 LLM 的 bind_tools 中。

## 后端层详细说明

位置：packages/backend/

模块结构：
- src/auth/ — JWT 认证模块。提供 login（返回 access_token + refresh_token）和 refresh 接口。使用 Passport JWT 策略。
- src/user/ — 用户 CRUD。字段：id(UUID), username, password(bcrypt), nickname, avatar, created_at, updated_at。
- src/role/ — 角色 CRUD + assignPermissions。与 User 多对多关系（user_roles 表）。
- src/permission/ — 权限列表查询。预置权限按分组：用户管理(user:*)、角色管理(role:*)、学生管理(student:*)、知识库(knowledge:*)。与 Role 多对多关系（role_permissions 表）。
- src/student/ — 学生 CRUD + 批量操作。字段：id, name, student_no, gender, class_name, phone, email, created_at, updated_at。
- src/agent/ — Agent 代理层。使用 HttpService 转发请求到 LangGraph API（地址由环境变量 LANGGRAPH_API_URL 指定）。SSE 流式转发对话响应。
- src/knowledge/ — 知识库管理。文件上传（txt/md/pdf）、文本提取、调用 Agent 做向量化。
- src/rtc/ — WebRTC 信令（在 WebSocket Gateway 中实现）。
- src/dao/ — 数据访问抽象层。interfaces/ 定义接口（IUserDao, IRoleDao 等），sqlite/ 提供 TypeORM 实现。dao.module.ts 通过 provide token 绑定实现类，切换数据库只需修改 useClass。
- src/common/guards/ — JwtAuthGuard、RolesGuard、PermissionsGuard。
- src/common/decorators/ — @Roles()、@RequirePermissions()、@CurrentUser()。
- src/common/interceptors/ — ResponseInterceptor 统一包装响应为 { code, data, message } 格式。
- src/common/filters/ — HttpExceptionFilter 统一异常响应格式。

WebSocket Gateway：
命名空间 /ws，连接时从 query 参数提取 JWT token 验证身份。
维护在线用户映射 Map<userId, Socket>。
事件：tools:update（前端通知当前可用工具列表）、tool:invoke（服务端请求前端执行工具）、tool:result（前端返回工具执行结果）、rtc:call/answer/reject/signal/hangup（WebRTC 信令）。

数据库：SQLite，通过 TypeORM 管理。数据库文件位于 data/agent-demo.db。
表：users, roles, permissions, user_roles, role_permissions, students, knowledge_bases, knowledge_base_roles。

初始化：AppModule.onModuleInit 中自动创建 admin 用户（密码 admin）、admin 角色（权限码 *）、预置所有权限。

## 前端层详细说明

位置：packages/frontend/

目录结构：
- src/views/ — 页面组件：login/LoginView.vue、dashboard/DashboardView.vue、user/UserListView.vue、role/RoleListView.vue、student/StudentListView.vue、knowledge/KnowledgeListView.vue、rtc/VoiceCallView.vue
- src/components/layout/AppLayout.vue — 主布局：左侧可折叠菜单（根据用户权限动态生成）+ 顶部导航栏 + 主内容区
- src/components/chat/ChatBubble.vue — 右下角浮动聊天气泡，展开后显示 AI 对话面板
- src/stores/auth.ts — 认证状态：user, token, permissions。actions: login, logout, fetchUserInfo。
- src/stores/permission.ts — 根据用户权限过滤路由表生成可访问菜单
- src/stores/chat.ts — 聊天状态：messages, currentThreadId, isOpen, isLoading
- src/router/ — Vue Router 配置 + 路由守卫（未登录跳转 /login，已登录检查权限）
- src/api/request.ts — axios 封装，自动附加 JWT token，401 自动跳转登录
- src/api/modules/ — 按模块分类的 API 调用函数
- src/composables/useChat.ts — 处理 SSE 流式对话
- src/composables/useWebSocket.ts — WebSocket 连接管理 + 工具调用事件处理
- src/composables/useToolRegistry.ts — 前端工具注册中心，onMounted 注册、onUnmounted 注销、变更时通知后端
- src/composables/useWebRTC.ts — PeerJS 语音通话 + MediaRecorder 录音

主题：Arco Design 深色模式，主色调蓝紫渐变（#6366f1 → #8b5cf6）。

前端工具注册流程：
页面组件在 onMounted 中调用 useToolRegistry().register() 注册当前页面可用的工具（如学生管理页面注册 create_student、delete_student、query_students）。
注册后通过 WebSocket 发送 tools:update 事件给后端，后端缓存该用户的可用工具列表。
Agent 收到请求时从缓存获取工具列表，只注入对应的前端工具到 LLM prompt。
页面组件在 onUnmounted 时自动注销工具，通知后端更新。

前端工具执行流程：
Agent 通过结构化输出返回 tool_call → NestJS 通过 WebSocket 发送 tool:invoke 事件到前端 → 前端检查 requireConfirm 字段 → 如果需要确认则弹出 Modal.confirm → 用户确认后执行 handler → 通过 WebSocket 发送 tool:result 回后端 → 后端转发给 Agent 继续对话。

## 环境变量

所有环境变量在项目根目录 .env 文件中定义。各子项目通过相对路径引用：
- agent: src/config/settings.py 用 python-dotenv 加载 ../../.env
- backend: ConfigModule.forRoot({ envFilePath: '../../.env' })
- frontend: vite.config.ts 中的 proxy 配置指向后端端口

关键环境变量：
- OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL_NAME — LLM 配置
- EMBEDDING_MODEL — 向量嵌入模型
- REDIS_URL — Redis 连接地址
- QDRANT_HOST, QDRANT_PORT — Qdrant 连接
- JWT_SECRET, JWT_EXPIRES_IN, JWT_REFRESH_EXPIRES_IN — JWT 配置
- LANGGRAPH_API_URL — LangGraph 服务地址
- LANGSMITH_API_KEY, LANGCHAIN_TRACING_V2 — LangSmith 追踪

## API 接口速查

认证：POST /api/v1/auth/login, POST /api/v1/auth/refresh
用户：GET/POST /api/v1/users, GET/POST/DELETE /api/v1/users/:id, POST /api/v1/users/:id/roles
角色：GET/POST /api/v1/roles, POST/DELETE /api/v1/roles/:id, POST /api/v1/roles/:id/permissions
权限：GET /api/v1/permissions
学生：GET/POST /api/v1/students, GET/POST/DELETE /api/v1/students/:id, POST /api/v1/students/batch, DELETE /api/v1/students/batch
AI对话：POST /api/v1/agent/chat (SSE)
知识库：GET /api/v1/knowledge, POST /api/v1/knowledge/upload, DELETE /api/v1/knowledge/:id, POST /api/v1/knowledge/:id/roles
语音转文字：POST /api/v1/agent/transcribe

统一响应格式：{ code: 0, data: {}, message: "ok" }
分页响应格式：{ code: 0, data: { items: [], total: number, page: number, pageSize: number } }
