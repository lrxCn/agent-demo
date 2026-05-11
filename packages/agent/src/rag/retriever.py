import logging
import httpx
from langchain_openai import OpenAIEmbeddings
from qdrant_client import QdrantClient
from qdrant_client.models import FieldCondition, Filter, MatchAny, MatchValue

from src.config.settings import (
    EMBEDDING_MODEL,
    OPENAI_API_KEY,
    OPENAI_BASE_URL,
    QDRANT_HOST,
    QDRANT_PORT,
    RERANK_MODEL,
)

COLLECTION_NAME = "knowledge_base"
logger = logging.getLogger(__name__)

embeddings = OpenAIEmbeddings(
    model=EMBEDDING_MODEL,
    api_key=OPENAI_API_KEY,
    base_url=OPENAI_BASE_URL,
)
qdrant = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)


def rerank_results(query: str, items: list[dict], top_k: int) -> list[dict]:
    """使用 SiliconFlow API 对结果进行重排序。"""
    if not items:
        return []

    url = f"{OPENAI_BASE_URL}/rerank"
    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": RERANK_MODEL,
        "query": query,
        "documents": [item["text"] for item in items],
        "top_n": top_k
    }

    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()

            reranked = []
            for res in data.get("results", []):
                idx = res["index"]
                item = items[idx].copy()
                item["score"] = float(res["relevance_score"])
                reranked.append(item)
            return reranked
    except Exception as e:
        logger.error(f"Rerank failed, falling back to original order: {e}")
        return items[:top_k]


def search_knowledge(query: str, role_ids: list[str], limit: int = 5) -> list[dict]:
    """按角色权限检索知识库（带 Rerank）。"""
    if not role_ids:
        return []

    query_vector = embeddings.embed_query(query)
    # 初始检索较多候选分片用于重排
    initial_limit = max(limit * 4, 20)

    results = qdrant.query_points(
        collection_name=COLLECTION_NAME,
        query=query_vector,
        limit=initial_limit,
        query_filter=Filter(
            should=[
                FieldCondition(key="role_ids", match=MatchAny(any=role_ids)),
            ]
        ),
    )

    formatted = [
        {
            "text": str(point.payload.get("text", "")),
            "score": float(point.score),
        }
        for point in results.points
    ]

    return rerank_results(query, formatted, limit)


def search_call_transcripts(query: str, user_id: str, limit: int = 5) -> list[dict]:
    """搜索用户参与的通话记录（带 Rerank）。"""
    if not user_id:
        return []

    query_vector = embeddings.embed_query(query)
    initial_limit = max(limit * 4, 20)

    results = qdrant.query_points(
        collection_name=COLLECTION_NAME,
        query=query_vector,
        limit=initial_limit,
        query_filter=Filter(
            must=[
                FieldCondition(key="type", match=MatchValue(value="call_transcript")),
                FieldCondition(key="participant_ids", match=MatchAny(any=[user_id])),
            ]
        ),
    )

    formatted = [
        {
            "text": str(point.payload.get("text", "")),
            "score": float(point.score),
            "call_time": str(point.payload.get("call_time", "")),
        }
        for point in results.points
    ]

    return rerank_results(query, formatted, limit)
