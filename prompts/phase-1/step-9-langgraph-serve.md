# Phase 1 - Step 9: LangGraph CLI 启动并测试 HTTP API

## 上下文
Agent 核心功能（工具、记忆、容错）全部完成。现在用 langgraph-cli 启动 Agent 服务。

## 任务

### 1. 确认 `langgraph.json` 正确
```json
{
  "dependencies": ["."],
  "graphs": {
    "agent": "./src/graph/builder.py:graph"
  },
  "env": "../../.env"
}
```

### 2. 启动 LangGraph 开发服务器
```bash
cd packages/agent
uv run langgraph dev
```
默认会在 `http://localhost:8123` 启动。

### 3. 测试 API
用 curl 测试：
```bash
# 创建 thread
curl -X POST http://localhost:8123/threads \
  -H "Content-Type: application/json" \
  -d '{"metadata": {}}'

# 发送消息（用上面返回的 thread_id 替换）
curl -X POST http://localhost:8123/threads/<THREAD_ID>/runs \
  -H "Content-Type: application/json" \
  -d '{
    "assistant_id": "agent",
    "input": {
      "messages": [{"role": "user", "content": "你好，现在几点了？"}],
      "mem0_user_id": "test-user",
      "thread_id": "<THREAD_ID>",
      "available_frontend_tools": []
    }
  }'
```

### 4. 如果启动失败
- 检查 Redis 是否运行：`redis-cli ping`（应返回 PONG）
- 检查 Qdrant 是否运行：`curl http://localhost:6333/healthz`
- 检查 .env 路径是否正确

## 验证
- LangGraph 服务在 8123 端口运行
- curl 调用能正常返回 AI 回复
- LangSmith 中能看到 trace 记录

## 完成后
更新 PROJECT_STATUS.md 标记 1-9 为 ✅，整个 Phase 1 完成。

```bash
git add .
git commit -m "feat: Phase 1 完成 - Agent 核心（工具/记忆/容错/HTTP API）"
```
