"""项目配置管理"""
import os
from dotenv import load_dotenv

# 加载 monorepo 根目录的 .env
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..', '.env'))

# LLM 配置（与 SiliconFlow OpenAI 兼容接口一致；密钥仍须由 .env 提供）
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
OPENAI_BASE_URL = os.getenv('OPENAI_BASE_URL', 'https://api.siliconflow.cn/v1')
OPENAI_MODEL_NAME = os.getenv('OPENAI_MODEL_NAME', 'deepseek-ai/DeepSeek-V3.2')
OPENAI_LLM_AS_JUDGE = os.getenv('OPENAI_LLM_AS_JUDGE', 'Pro/moonshotai/Kimi-K2.6')

# Redis 配置
REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379')

# Qdrant 配置
QDRANT_HOST = os.getenv('QDRANT_HOST', 'localhost')
QDRANT_PORT = int(os.getenv('QDRANT_PORT', '6333'))

# Embedding 配置（模型名与向量维度必须配套，供 Mem0/Qdrant 建集合与 embedder 一致）
EMBEDDING_MODEL = os.getenv('EMBEDDING_MODEL', 'BAAI/bge-large-zh-v1.5')
# 默认对应 BAAI/bge-large-zh-v1.5 的向量维度（1024）；更换 EMBEDDING_MODEL 时请同步修改
EMBEDDING_MODEL_DIMS = int(os.getenv('EMBEDDING_MODEL_DIMS', '1024'))

# Rerank 配置
RERANK_MODEL = os.getenv('RERANK_MODEL', 'BAAI/bge-reranker-v2-m3')
RERANK_TOP_K = int(os.getenv('RERANK_TOP_K', '5'))


# === Phase 8 新增：RAG 路由方案 B 开关 ===
# 默认 true（启用方案 B）；置为 false 可瞬间回滚到 START → memory_search → chat 旧图
def _parse_bool_env(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in ('1', 'true', 'yes', 'on')


AGENT_RAG_ROUTER_ENABLED = _parse_bool_env('AGENT_RAG_ROUTER_ENABLED', default=True)
