# 项目架构文档

## 系统架构总览

```
┌─────────────────────────────────────────────────────────┐
│                    用户浏览器                             │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Vue3 + Arco Design + Pinia + Vue Router         │   │
│  │  ┌─────────┐ ┌──────────┐ ┌──────────────────┐  │   │
│  │  │ 业务页面 │ │ AI聊天浮窗 │ │ WebRTC语音(PeerJS)│  │   │
│  │  └────┬────┘ └─────┬────┘ └────────┬─────────┘  │   │
│  └───────┼────────────┼───────────────┼─────────────┘   │
└──────────┼────────────┼───────────────┼─────────────────┘
           │ REST/JWT   │ SSE          │ WebSocket
           ▼            ▼              ▼
┌──────────────────────────────────────────────────────────┐
│  NestJS 后端 (packages/backend/)                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐  │
│  │ Auth模块  │ │ CRUD模块  │ │ Agent代理 │ │ WS Gateway│  │
│  │ JWT+RBAC │ │ 用户/学生  │ │ SSE转发   │ │ 信令+工具  │  │
│  └────┬─────┘ └────┬─────┘ └─────┬────┘ └─────┬─────┘  │
│       └────────────┴─────────────┼─────────────┘        │
│                    DAO 抽象层     │                       │
│                    ┌───────┐     │ HTTP                  │
│                    │SQLite │     │                       │
│                    └───────┘     ▼                       │
└──────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────┐
│  LangGraph Agent (packages/agent/)                       │
│  ┌──────────────────────────────────────────────────┐   │
│  │  LangGraph 图                                     │   │
│  │  chat_node → tool_node → (retry/fallback)        │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │ToolRegistry│ │  Mem0    │ │   RAG    │ │  Config  │  │
│  │ 按需加载   │ │ 长期记忆  │ │ 知识检索  │ │  LLM配置  │  │
│  └─────┬────┘ └────┬─────┘ └────┬─────┘ └──────────┘  │
│        │           │            │                       │
│        ▼           ▼            ▼                       │
│   ┌─────────┐ ┌─────────┐ ┌─────────┐                 │
│   │  Redis  │ │  Qdrant  │ │  Qdrant  │                 │
│   │短期记忆  │ │ 用户记忆  │ │ RAG向量  │                 │
│   └─────────┘ └─────────┘ └─────────┘                 │
└──────────────────────────────────────────────────────────┘
```

## 模块职责

### 1. Agent 层 (packages/agent/)
- **图引擎**：LangGraph 定义对话流程（chat → tool → retry/fallback）
- **工具注册中心**：按类别/标签管理工具，支持按需加载
- **短期记忆**：Redis checkpointer，按 thread_id 隔离
- **长期记忆**：Mem0 + Qdrant，按 user_id 存储用户偏好
- **RAG**：Qdrant 向量检索，按角色过滤权限
- **容错**：重试（3次指数退避）→ 超时（30s）→ fallback

### 2. 后端层 (packages/backend/)
- **认证**：JWT access_token + refresh_token，内置 admin/admin
- **RBAC**：用户 → 角色 → 权限，三级关联
- **DAO 层**：接口 + 实现分离，当前 SQLite，可切换
- **Agent 代理**：HTTP 转发到 LangGraph，SSE 流式响应
- **WebSocket**：信令服务（WebRTC）+ 前端工具调用回传
- **文件处理**：上传 txt/md/pdf → 传递给 Agent 做 RAG 入库
- **Guardrails 审计**：`AuditModule` 提供内部接口，落库 `audit_logs`（`INTERNAL_API_KEY` 鉴权）

### 3. 前端层 (packages/frontend/)
- **权限路由**：动态菜单，按角色渲染
- **AI 聊天浮窗**：SSE 流式对话，工具调用确认
- **工具注册中心**：页面级注册/注销，通知后端当前可用工具
- **WebRTC 语音**：PeerJS P2P 通话，录音 → STT → RAG

## 数据流

### AI 对话流程
```
用户输入 → 前端 → NestJS SSE 接口 → LangGraph API
                                        ↓
                                    chat_node (LLM)
                                        ↓
                              需要工具？→ tool_node
                                        ↓
                              内置工具 → 直接执行
                              前端工具 → 结构化输出
                                        ↓
                    NestJS WebSocket ← 结构化输出
                         ↓
                    前端执行（需用户确认）
                         ↓
                    执行结果回传 → Agent 继续
```

### 工具按需加载流程
```
前端页面切换 → onMounted 注册工具 → WebSocket 发送可用工具列表
                                          ↓
                              NestJS 缓存用户当前工具集
                                          ↓
                              Agent 请求时附带工具列表
                                          ↓
                              ToolRegistry.get_tools(frontend_available=[...])
                                          ↓
                              只注入相关工具到 LLM prompt
```

### 语音通话流程
```
发起方 → WebSocket 发送呼叫请求 → 接收方
                                    ↓
                              接听/拒绝
                                    ↓
                PeerJS P2P 连接建立（仅音频）
                                    ↓
                          通话中（可发送 mp3 文件）
                                    ↓
                              挂断
                                    ↓
                    录音 → SiliconFlow Whisper API → 文字
                                    ↓
                    文字 + 双方 user_id → Qdrant RAG 存储
                                    ↓
                    仅通话双方可通过 AI 查询通话内容
```

### Guardrails 审计流程
```
Quota / Tool ACL 命中（Backend） ──┐
                                   ├─→ AuditService → IAuditLogDao → SQLite audit_logs
PromptInjection / PII 命中（Agent） ─┘
                 ↓
POST /api/v1/internal/audit-log（x-internal-api-key）
                 ↓
          AuditController 鉴权后写库
```

## 数据库设计 (SQLite)

### users 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| username | TEXT UNIQUE | 用户名 |
| password | TEXT | bcrypt 哈希 |
| nickname | TEXT | 昵称 |
| avatar | TEXT | 头像 URL |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

### roles 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| name | TEXT UNIQUE | 角色名 |
| description | TEXT | 描述 |

### permissions 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| code | TEXT UNIQUE | 权限码（如 student:create） |
| name | TEXT | 权限名称 |
| group_name | TEXT | 分组 |

### user_roles 表（多对多）
| 字段 | 类型 |
|------|------|
| user_id | TEXT FK |
| role_id | TEXT FK |

### role_permissions 表（多对多）
| 字段 | 类型 |
|------|------|
| role_id | TEXT FK |
| permission_id | TEXT FK |

### students 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| name | TEXT | 姓名 |
| student_no | TEXT UNIQUE | 学号 |
| gender | TEXT | 性别 |
| class_name | TEXT | 班级 |
| phone | TEXT | 手机号 |
| email | TEXT | 邮箱 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

### knowledge_bases 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| name | TEXT | 知识库名 |
| description | TEXT | 描述 |
| file_name | TEXT | 原始文件名 |
| file_type | TEXT | 文件类型 |
| qdrant_collection | TEXT | Qdrant 集合名 |
| created_at | DATETIME | 创建时间 |

### knowledge_base_roles 表（知识库角色权限）
| 字段 | 类型 |
|------|------|
| knowledge_base_id | TEXT FK |
| role_id | TEXT FK |

### audit_logs 表（Guardrails 审计日志）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| trace_id | TEXT NULL | W3C trace_id |
| user_id | TEXT NULL | 触发用户 ID |
| event_type | TEXT | `quota_exceeded` / `tool_denied` / `prompt_injection` / `pii_filtered` |
| severity | TEXT | `info` / `warn` / `block` |
| payload_json | TEXT NULL | 事件负载 JSON 字符串 |
| created_at | DATETIME | 创建时间 |

## 环境依赖

| 服务 | 地址 | 部署方式 |
|------|------|----------|
| Redis | localhost:6379 | OrbStack 容器 |
| Qdrant | localhost:6333 | OrbStack 容器 |
| LangGraph API | localhost:8123 | langgraph-cli |
| NestJS | localhost:3000 | pnpm run start:dev |
| Vue Dev | localhost:5173 | pnpm run dev |
| SiliconFlow | api.siliconflow.cn | 云端 API |
