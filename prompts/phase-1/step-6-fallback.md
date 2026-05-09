# Phase 1 - Step 6: 失败回退节点

## 上下文
重试和超时已完成。请先阅读 @packages/agent/src/graph/builder.py 和 @packages/agent/src/graph/nodes.py。

## 任务

### 1. 在 `nodes.py` 中添加 fallback_node
```python
async def fallback_node(state: AgentState) -> dict:
    """回退节点：工具全部失败时给出友好提示"""
    from langchain_core.messages import AIMessage
    last_messages = []
    for msg in reversed(state["messages"]):
        if hasattr(msg, "tool_call_id"):
            last_messages.append(msg)
        else:
            break
    failed = [m for m in last_messages if any(x in m.content for x in ["❌","⏱️","⚠️"])]
    if failed:
        summary = "\n".join([m.content for m in failed])
        return {"messages": [AIMessage(content=f"抱歉，操作遇到问题：\n{summary}\n\n请稍后重试。")]}
    return {"messages": []}
```

### 2. 更新 `builder.py`，添加 after_tools 条件路由
- 导入 fallback_node
- 添加 `after_tools` 函数：检查 ToolMessage 是否含错误标记，有则走 fallback，否则回 chat
- 图结构：`tools → after_tools? → chat 或 fallback → END`

## 验证
正常工具调用仍然正常：计算器和时间工具可用。

## 完成后
更新 PROJECT_STATUS.md 标记 1-6 为 ✅，git commit。
