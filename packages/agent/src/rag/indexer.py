"""RAG 文档索引器。"""

import uuid
from typing import Any

from langchain_openai import OpenAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    MatchValue,
    PointStruct,
    VectorParams,
)

from src.config.settings import (
    EMBEDDING_MODEL,
    EMBEDDING_MODEL_DIMS,
    OPENAI_API_KEY,
    OPENAI_BASE_URL,
    QDRANT_HOST,
    QDRANT_PORT,
)

COLLECTION_NAME = "knowledge_base"
CHUNK_SIZE = 500
CHUNK_OVERLAP = 50

embeddings = OpenAIEmbeddings(
    model=EMBEDDING_MODEL,
    api_key=OPENAI_API_KEY,
    base_url=OPENAI_BASE_URL,
)
qdrant = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)


def ensure_collection() -> None:
    """确保 Qdrant 集合存在。"""
    collections = [collection.name for collection in qdrant.get_collections().collections]
    if COLLECTION_NAME in collections:
        return

    qdrant.create_collection(
        collection_name=COLLECTION_NAME,
        vectors_config=VectorParams(size=EMBEDDING_MODEL_DIMS, distance=Distance.COSINE),
    )


def index_document(text: str, metadata: dict[str, Any]) -> int:
    """将文档切片并向量化后写入 Qdrant，返回写入块数。"""
    normalized_text = text.strip()
    if not normalized_text:
        raise ValueError("文档内容为空，无法建立索引")

    ensure_collection()

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
    )
    chunks = splitter.split_text(normalized_text)
    if not chunks:
        raise ValueError("文档切片结果为空，无法建立索引")

    vectors = embeddings.embed_documents(chunks)
    points = []
    for chunk, vector in zip(chunks, vectors, strict=True):
        points.append(
            PointStruct(
                id=str(uuid.uuid4()),
                vector=vector,
                payload={
                    "text": chunk,
                    "knowledge_base_id": metadata.get("knowledge_base_id"),
                    "role_ids": metadata.get("role_ids", []),
                    **metadata,
                },
            )
        )

    qdrant.upsert(collection_name=COLLECTION_NAME, points=points)
    return len(points)


def index_call_transcript(
    text: str,
    caller_user_id: str,
    callee_user_id: str,
    call_time: str,
) -> int:
    """索引通话记录 - 仅通话双方可查询"""
    normalized_text = text.strip()
    if not normalized_text:
        return 0

    ensure_collection()

    metadata = {
        "type": "call_transcript",
        "caller_user_id": caller_user_id,
        "callee_user_id": callee_user_id,
        "call_time": call_time,
        "participant_ids": [caller_user_id, callee_user_id],
    }

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
    )
    chunks = splitter.split_text(normalized_text)
    if not chunks:
        return 0

    vectors = embeddings.embed_documents(chunks)
    points = []
    for chunk, vector in zip(chunks, vectors, strict=True):
        points.append(
            PointStruct(
                id=str(uuid.uuid4()),
                vector=vector,
                payload={
                    "text": chunk,
                    **metadata,
                },
            )
        )

    qdrant.upsert(collection_name=COLLECTION_NAME, points=points)
    return len(points)


def update_document_roles(knowledge_base_id: str, role_ids: list[str]) -> None:
    """批量更新 Qdrant 中特定文档的权限角色。"""
    qdrant.set_payload(
        collection_name=COLLECTION_NAME,
        payload={"role_ids": role_ids},
        points=Filter(
            must=[
                FieldCondition(
                    key="knowledge_base_id", match=MatchValue(value=knowledge_base_id)
                ),
            ]
        ),
    )


def delete_document(knowledge_base_id: str) -> None:
    """按 knowledge_base_id 从 Qdrant 中物理删除文档的所有 chunks。"""
    qdrant.delete(
        collection_name=COLLECTION_NAME,
        points_selector=Filter(
            must=[
                FieldCondition(
                    key="knowledge_base_id", match=MatchValue(value=knowledge_base_id)
                ),
            ]
        ),
    )
