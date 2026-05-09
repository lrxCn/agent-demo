"""Mem0 长期记忆 - 基于 Qdrant 向量存储"""
import logging

from mem0 import Memory

from src.config.settings import (
    EMBEDDING_MODEL,
    EMBEDDING_MODEL_DIMS,
    OPENAI_API_KEY,
    OPENAI_BASE_URL,
    OPENAI_MODEL_NAME,
    QDRANT_HOST,
    QDRANT_PORT,
)

logger = logging.getLogger(__name__)

_memory_instance: Memory | None = None


def get_memory() -> Memory:
    """获取 Mem0 实例（单例）"""
    global _memory_instance
    if _memory_instance is None:
        config: dict = {
            'vector_store': {
                'provider': 'qdrant',
                'config': {
                    'collection_name': 'user_memories',
                    'embedding_model_dims': EMBEDDING_MODEL_DIMS,
                    'host': QDRANT_HOST,
                    'port': QDRANT_PORT,
                },
            },
            'llm': {
                'provider': 'openai',
                'config': {
                    'model': OPENAI_MODEL_NAME,
                    'api_key': OPENAI_API_KEY,
                    'openai_base_url': OPENAI_BASE_URL,
                },
            },
            'embedder': {
                'provider': 'openai',
                'config': {
                    'model': EMBEDDING_MODEL,
                    'api_key': OPENAI_API_KEY,
                    'openai_base_url': OPENAI_BASE_URL,
                },
            },
        }
        _memory_instance = Memory.from_config(config)
    return _memory_instance


def search_memories(query: str, user_id: str, limit: int = 5) -> list[str]:
    """搜索用户的长期记忆"""
    memory = get_memory()
    results = memory.search(
        query=query,
        filters={'user_id': user_id},
        top_k=limit,
    )
    return [r['memory'] for r in results.get('results', [])]


def save_memories(messages: list[dict], user_id: str) -> None:
    """保存对话到长期记忆"""
    memory = get_memory()
    memory.add(messages=messages, user_id=user_id)
