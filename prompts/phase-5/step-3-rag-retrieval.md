# Phase 5 - Step 3: RAG 检索工具（按角色过滤）

## 上下文
文档已可入库。现在创建 RAG 检索工具，支持按角色权限过滤。

## 任务

### 1. 创建 `packages/agent/src/rag/retriever.py`
```python
"""RAG 检索器 - 按角色权限过滤"""
from langchain_openai import OpenAIEmbeddings
from qdrant_client import QdrantClient
from qdrant_client.models import Filter, FieldCondition, MatchAny
from src.config.settings import *

embeddings = OpenAIEmbeddings(model=EMBEDDING_MODEL, api_key=OPENAI_API_KEY, base_url=OPENAI_BASE_URL)
qdrant = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)

def search_knowledge(query: str, role_ids: list[str], limit: int = 5) -> list[dict]:
    """按角色权限检索知识库"""
    query_vector = embeddings.embed_query(query)
    
    # 按角色过滤：role_ids 中任一匹配即可
    results = qdrant.search(
        collection_name="knowledge_base",
        query_vector=query_vector,
        limit=limit,
        query_filter=Filter(
            should=[
                FieldCondition(key="role_ids", match=MatchAny(any=role_ids)),
            ]
        ),
    )
    return [{"text": r.payload["text"], "score": r.score} for r in results]
```

### 2. 创建 RAG 工具 `packages/agent/src/tools/builtin/rag_tool.py`
```python
@tool
def search_knowledge_base(query: str) -> str:
    """在知识库中搜索相关信息。
    Args:
        query: 搜索查询内容
    """
    # 注意：role_ids 需要从 state 中获取
    # 这里先用占位，后续在 chat_node 中通过 inject 传入
    from src.rag.retriever import search_knowledge
    results = search_knowledge(query, role_ids=["admin"])  # 临时
    if not results:
        return "未找到相关知识。"
    return "\n\n".join([f"[相关度:{r['score']:.2f}] {r['text']}" for r in results])
```

### 3. 注册到 ToolRegistry 并在 builtin/__init__.py 中注册

## 验证
先手动索引一些文档，然后通过 Agent 对话查询。

## 完成后
更新 PROJECT_STATUS.md 标记 5-3 为 ✅
