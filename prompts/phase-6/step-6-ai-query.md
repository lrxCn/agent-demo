# Phase 6 - Step 6: AI 查询通话内容

## 上下文
通话文本已存入 RAG。最后一步：集成到 AI 对话中，支持查询通话内容。

## 任务

### 1. 创建通话记录查询工具
`packages/agent/src/tools/builtin/call_query_tool.py`：
```python
@tool
def search_my_calls(query: str) -> str:
    """搜索我的通话记录内容。只能查询自己参与的通话。
    
    Args:
        query: 搜索内容，如"上次和谁聊了什么"
    """
    # 使用 search_call_transcripts，传入当前 user_id
    from src.rag.retriever import search_call_transcripts
    # user_id 通过 state 注入
    ...
```

### 2. 注册到 ToolRegistry
在 builtin/__init__.py 中注册 search_my_calls。

### 3. 端到端测试
1. 用户 A 和用户 B 进行语音通话
2. 通话结束后，用户 A 在 AI 聊天中问："我上次通话聊了什么？"
3. Agent 调用 search_my_calls 工具
4. 返回通话内容摘要
5. 用户 C（未参与通话）查询同样内容 → 无结果

## 验证
- 通话双方能查到通话内容
- 非参与方查不到
- AI 能基于通话内容回答问题

## 完成后
更新 PROJECT_STATUS.md 标记 6-6 为 ✅，整个 Phase 6 和项目完成！

```bash
git add .
git commit -m "feat: Phase 6 完成 - WebRTC 语音通话（P2P/录音/STT/RAG/AI查询）"
git tag v1.0.0
```

## 🎉 项目完成！
恭喜！所有 6 个阶段全部完成。你现在拥有一个完整的 AI Agent 全栈演示项目，包括：
- ✅ LangGraph Agent（工具调用、重试、超时、回退）
- ✅ 短期记忆（Redis）+ 长期记忆（Mem0 + Qdrant）
- ✅ JWT 认证 + RBAC 权限
- ✅ 学生管理 CRUD + 批量操作
- ✅ AI 对话浮窗 + 流式输出
- ✅ 前端工具按需注册 + 结构化输出调用
- ✅ RAG 知识库（按角色权限）
- ✅ WebRTC 语音通话 + STT + 通话内容 AI 查询
