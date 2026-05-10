"""RAG 文档索引器。"""

import uuid
from typing import Any

from langchain_openai import OpenAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, PointStruct, VectorParams

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
