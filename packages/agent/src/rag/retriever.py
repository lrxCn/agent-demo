"""RAG 检索器 - 按角色权限过滤。"""

from langchain_openai import OpenAIEmbeddings
from qdrant_client import QdrantClient
from qdrant_client.models import FieldCondition, Filter, MatchAny

from src.config.settings import (
    EMBEDDING_MODEL,
    OPENAI_API_KEY,
    OPENAI_BASE_URL,
    QDRANT_HOST,
    QDRANT_PORT,
)

COLLECTION_NAME = "knowledge_base"

embeddings = OpenAIEmbeddings(
    model=EMBEDDING_MODEL,
    api_key=OPENAI_API_KEY,
    base_url=OPENAI_BASE_URL,
)
qdrant = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)


def search_knowledge(query: str, role_ids: list[str], limit: int = 5) -> list[dict]:
    """按角色权限检索知识库。"""
    if not role_ids:
        return []

    query_vector = embeddings.embed_query(query)
    results = qdrant.search(
        collection_name=COLLECTION_NAME,
        query_vector=query_vector,
        limit=limit,
        query_filter=Filter(
            should=[
                FieldCondition(key="role_ids", match=MatchAny(any=role_ids)),
            ]
        ),
    )
    return [
        {
            "text": str(point.payload.get("text", "")),
            "score": float(point.score),
        }
        for point in results
    ]
