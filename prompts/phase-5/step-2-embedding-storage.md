# Phase 5 - Step 2: Embedding + Qdrant 存储

## 上下文
文件上传已完成。现在在 Agent 端实现文档切片、向量化、存储。

## 任务

### 1. 安装依赖
```bash
cd packages/agent
uv add langchain-text-splitters
```

### 2. 创建 `packages/agent/src/rag/indexer.py`
```python
"""RAG 文档索引器"""
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
from src.config.settings import *
import uuid

embeddings = OpenAIEmbeddings(
    model=EMBEDDING_MODEL,
    api_key=OPENAI_API_KEY,
    base_url=OPENAI_BASE_URL,
)

qdrant = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)

COLLECTION_NAME = "knowledge_base"
CHUNK_SIZE = 500
CHUNK_OVERLAP = 50

def ensure_collection():
    """确保 Qdrant 集合存在"""
    collections = [c.name for c in qdrant.get_collections().collections]
    if COLLECTION_NAME not in collections:
        qdrant.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=VectorParams(size=1024, distance=Distance.COSINE),
        )

def index_document(text: str, metadata: dict):
    """将文档切片并存入 Qdrant"""
    ensure_collection()
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE, chunk_overlap=CHUNK_OVERLAP
    )
    chunks = splitter.split_text(text)
    vectors = embeddings.embed_documents(chunks)
    
    points = [
        PointStruct(
            id=str(uuid.uuid4()),
            vector=vec,
            payload={
                "text": chunk,
                "knowledge_base_id": metadata.get("knowledge_base_id"),
                "role_ids": metadata.get("role_ids", []),
                **metadata,
            }
        )
        for chunk, vec in zip(chunks, vectors)
    ]
    qdrant.upsert(collection_name=COLLECTION_NAME, points=points)
    return len(points)
```

### 3. 在 Agent 添加一个接收文档的 HTTP 端点
或者通过 LangGraph API 的自定义端点，让 NestJS 调用来触发索引。

## 验证
```bash
cd packages/agent
uv run python -c "
from src.rag.indexer import index_document
count = index_document('这是一个测试文档。LangGraph 是一个用于构建 Agent 的框架。', 
    {'knowledge_base_id': 'test', 'role_ids': ['admin']})
print(f'成功索引 {count} 个文档块')
"
```

## 完成后
更新 PROJECT_STATUS.md 标记 5-2 为 ✅
