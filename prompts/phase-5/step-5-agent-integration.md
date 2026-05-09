# Phase 5 - Step 5: RAG 集成到 Agent 对话

## 上下文
知识库前后端都已完成。现在做端到端集成。

## 任务

### 1. 修改 Agent chat_node
在调用 LLM 前，将用户的角色信息传入 RAG 检索工具，确保权限过滤正确：
- 从 state 中获取用户角色 → 传递给 RAG 工具
- 可以通过在 state 中增加 `user_role_ids` 字段实现

### 2. 修改 NestJS Agent 代理层
在调用 LangGraph API 时，从 JWT payload 中提取用户角色 ID 列表，传入 state。

### 3. 端到端测试
1. 上传一份技术文档到知识库
2. 设置该知识库仅对 admin 角色可见
3. 用 admin 登录，在聊天中问相关问题 → 应能获取知识库内容
4. 用普通用户登录，同样的问题 → 应无法获取该知识库内容

## 验证
权限过滤正确，不同角色看到不同内容。

## 完成后
更新 PROJECT_STATUS.md 标记 5-5 为 ✅，整个 Phase 5 完成。

```bash
git add .
git commit -m "feat: Phase 5 完成 - RAG 知识库（上传/切片/向量化/权限检索）"
```
