# Phase 6 - Step 5: 通话文本存 RAG

## 上下文
STT 转文字已完成。现在将通话内容存入 RAG，并限定仅通话双方可查询。

## 任务

### 1. 修改 Agent 的 RAG indexer
添加通话记录专用的索引函数：
```python
def index_call_transcript(
    text: str, 
    caller_user_id: str, 
    callee_user_id: str,
    call_time: str,
):
    """索引通话记录 - 仅通话双方可查询"""
    ensure_collection()
    # metadata 中记录双方 user_id
    metadata = {
        "type": "call_transcript",
        "caller_user_id": caller_user_id,
        "callee_user_id": callee_user_id,
        "call_time": call_time,
        "participant_ids": [caller_user_id, callee_user_id],
    }
    # 使用 participant_ids 而非 role_ids 做权限过滤
    # ...
```

### 2. 修改 RAG retriever
添加按 user_id 过滤的检索函数（用于通话记录）：
```python
def search_call_transcripts(query: str, user_id: str, limit: int = 5):
    """搜索用户参与的通话记录"""
    # 过滤条件：participant_ids 包含 user_id
```

### 3. NestJS 端：通话结束后调用 Agent 索引
在 STT 转写完成后，将文本 + 双方 user_id 发送给 Agent 索引。

## 验证
- 两个用户通话结束后，通话内容被索引到 Qdrant
- 只有通话双方能通过 AI 查询到通话内容

## 完成后
更新 PROJECT_STATUS.md 标记 6-5 为 ✅
