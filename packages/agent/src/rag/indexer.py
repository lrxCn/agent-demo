"""RAG 文档索引器。"""
import logging
import uuid
from typing import Any

from langchain_openai import OpenAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    FilterSelector,
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
CHUNK_SIZE = 400
CHUNK_OVERLAP = 40

embeddings = OpenAIEmbeddings(
    model=EMBEDDING_MODEL,
    api_key=OPENAI_API_KEY,
    base_url=OPENAI_BASE_URL,
    chunk_size=20,
)
qdrant = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)
logger = logging.getLogger(__name__)


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
    """对文档进行切片、向量化并存入 Qdrant。"""
    kb_id = metadata.get("knowledge_base_id")
    logger.info("开始索引文档: kb_id=%s, metadata=%s", kb_id, metadata)
    
    try:
        normalized_text = text.strip()
        if not normalized_text:
            logger.warning("文档内容为空，跳过索引: kb_id=%s", kb_id)
            raise ValueError("文档内容为空，无法建立索引")

        logger.info("确保 Qdrant 集合存在: %s", COLLECTION_NAME)
        ensure_collection()

        logger.info("正在切片文档: kb_id=%s, text_len=%d", kb_id, len(normalized_text))
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=CHUNK_SIZE,
            chunk_overlap=CHUNK_OVERLAP,
        )
        chunks = splitter.split_text(normalized_text)
        if not chunks:
            logger.error("文档切片结果为空: kb_id=%s", kb_id)
            raise ValueError("文档切片结果为空，无法建立索引")
        
        logger.info("切片完成: kb_id=%s, chunks_count=%d", kb_id, len(chunks))

        logger.info("正在调用 Embedding 接口进行向量化: kb_id=%s", kb_id)
        vectors = embeddings.embed_documents(chunks)
        logger.info("向量化完成: kb_id=%s, vectors_count=%d", kb_id, len(vectors))

        points = []
        for i, (chunk, vector) in enumerate(zip(chunks, vectors)):
            points.append(
                PointStruct(
                    id=str(uuid.uuid4()),
                    vector=vector,
                    payload={
                        "text": chunk,
                        "knowledge_base_id": kb_id,
                        "role_ids": metadata.get("role_ids", []),
                        **metadata,
                    },
                )
            )

        logger.info("正在写入 Qdrant: kb_id=%s, points_count=%d", kb_id, len(points))
        qdrant.upsert(collection_name=COLLECTION_NAME, points=points)
        logger.info("文档索引成功: kb_id=%s, points_count=%d", kb_id, len(points))
        return len(points)
    except Exception as e:
        logger.exception("索引文档时发生异常: kb_id=%s, error=%s", kb_id, str(e))
        raise


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
    for chunk, vector in zip(chunks, vectors):
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
        points_selector=FilterSelector(
            filter=Filter(
                must=[
                    FieldCondition(
                        key="knowledge_base_id",
                        match=MatchValue(value=knowledge_base_id),
                    ),
                ]
            )
        ),
    )


def reindex_document(text: str, metadata: dict[str, Any]) -> int:
    """重新索引文档：先删除旧分片，再插入新分片。"""
    kb_id = metadata.get("knowledge_base_id")
    if not kb_id:
        raise ValueError("重新索引必须提供 knowledge_base_id")

    # 1. 删除旧数据
    delete_document(kb_id)

    # 2. 插入新数据
    return index_document(text, metadata)
