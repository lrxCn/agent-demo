# AI Agent 全栈演示项目

> 一个展示 AI Agent 工程能力的全栈项目，基于 LangChain 家族框架构建。

## 🎯 项目亮点

- **智能对话引擎**：基于 LangGraph 构建的多步推理 Agent，支持工具调用、自动重试、超时保护和失败回退
- **双层记忆系统**：短期记忆（Redis，按会话隔离）+ 长期记忆（Mem0 + Qdrant，跨会话持久化用户偏好）
- **RAG 知识库**：支持上传 PDF/Markdown/TXT 文档，按角色权限精准检索
- **AI 驱动的前端操作**：通过自然语言对话触发页面跳转、数据增删改查，所有操作需用户确认
- **工具按需加载**：前端页面级别的工具注册/注销机制，避免 prompt 膨胀，为大规模工具扩展预留架构
- **实时语音通话**：WebRTC P2P 局域网语音 + 自动录音 + 语音转文字 + 通话内容 AI 查询

## 🏗 技术架构

### 三层架构

```
┌─────────────────────────────────────────┐
│           前端 (Vue3 + Arco Design)      │
│   权限路由 · AI聊天浮窗 · WebRTC语音     │
└──────────────────┬──────────────────────┘
                   │ REST / SSE / WebSocket
┌──────────────────┴──────────────────────┐
│          后端 (NestJS + SQLite)           │
│   JWT认证 · RBAC权限 · Agent代理 · 信令   │
└──────────────────┬──────────────────────┘
                   │ HTTP
┌──────────────────┴──────────────────────┐
│      AI Agent (LangGraph + Python)       │
│   工具调用 · 记忆系统 · RAG · 容错机制    │
│          Redis · Qdrant · Mem0           │
└─────────────────────────────────────────┘
```

### 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vue 3 · TypeScript · Arco Design · Pinia · Vue Router · PeerJS |
| 后端 | NestJS · TypeORM · SQLite · JWT · Socket.io |
| Agent | LangGraph · LangChain · Mem0 · Qdrant · Redis |
| LLM | DeepSeek-V3.2 (SiliconFlow) |
| 语音 | SiliconFlow Whisper API |

## ✨ 功能模块

### 🔐 权限管理
- 内置超级管理员（admin/admin）
- 用户 → 角色 → 权限 三级 RBAC 体系
- 动态菜单：不同角色看到不同页面
- 按钮级权限控制

### 🎓 学生管理
- 完整的增删改查 + 批量操作
- 支持搜索、分页、排序
- 可通过 AI 对话进行操作（需用户确认）

### 🤖 AI 对话助手
- 页面右下角浮动聊天窗口
- SSE 流式输出（打字机效果）
- 智能工具调用：
  - 内置工具：计算器、时间查询、知识库检索
  - 前端工具：页面跳转、数据操作（按页面按需加载）
- 跨会话记忆：Agent 记住用户偏好

### 📚 知识库
- 支持上传 TXT / Markdown / PDF
- 自动切片 + 向量化存储（Qdrant）
- 按角色权限检索：不同角色访问不同知识

### 📞 语音通话
- WebRTC P2P 局域网语音通话
- 支持发送 MP3 等音频文件
- 通话自动录音 → 语音转文字（Whisper）
- 通话内容存入 RAG，仅通话双方可通过 AI 查询

## 🚀 快速开始

### 前置要求
- Node.js 18+
- Python 3.11+
- pnpm
- uv (Python 包管理)
- Redis (OrbStack 容器)
- Qdrant (OrbStack 容器)

### 启动服务
```bash
# 1. Agent 层
cd packages/agent && uv run langgraph dev

# 2. 后端
cd packages/backend && pnpm run start:dev

# 3. 前端
cd packages/frontend && pnpm run dev
```

### 访问
- 前端：http://localhost:5173
- 后端 API：http://localhost:3000
- LangGraph API：http://localhost:8123
- 默认账号：admin / admin

## 📐 项目结构

```
agent-demo/
├── packages/
│   ├── agent/          # Python LangGraph Agent
│   ├── backend/        # NestJS 后端
│   └── frontend/       # Vue3 前端
├── docs/               # 项目文档
└── .cursor/rules/      # AI 编码助手规则
```

## 📄 License

MIT
