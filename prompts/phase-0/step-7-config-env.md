# Phase 0 - Step 7: 配置环境变量

## 上下文
三个子项目已初始化。现在统一配置环境变量。

## 任务
1. 在项目根目录创建 `.env` 文件：
```env
# LangSmith
LANGSMITH_API_KEY=lsv2_****
LANGCHAIN_TRACING_V2=true

# SiliconFlow (OpenAI 兼容)
OPENAI_API_KEY=sk-*****
OPENAI_BASE_URL=https://api.siliconflow.cn/v1
OPENAI_MODEL_NAME=deepseek-ai/DeepSeek-V3.2

# Embedding
EMBEDDING_MODEL=BAAI/bge-large-zh-v1.5

# Redis
REDIS_URL=redis://localhost:6379

# Qdrant
QDRANT_HOST=localhost
QDRANT_PORT=6333

# JWT
JWT_SECRET=agent-demo-jwt-secret-key-2026
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# LangGraph API
LANGGRAPH_API_URL=http://localhost:8123
```

2. 创建 `.env.example`（同上但去掉真实 key 值，用占位符替代）

3. 确认 `.gitignore` 已包含 `.env`

## 验证
- NestJS 能读到环境变量：`cd packages/backend && pnpm run start:dev`（不报错即可）
- Python Agent 能读到环境变量：
```bash
cd packages/agent
uv run python -c "from src.config.settings import OPENAI_MODEL_NAME; print(OPENAI_MODEL_NAME)"
```
应输出：`deepseek-ai/DeepSeek-V3.2`

## 完成后
更新 @docs/PROJECT_STATUS.md 将 Phase 0 Step 0-7 状态改为 ✅，并标记整个 Phase 0 完成。

执行 git commit：
```bash
git add .
git commit -m "feat: Phase 0 完成 - 项目脚手架初始化"
```
