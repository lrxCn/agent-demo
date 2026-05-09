"""Redis 短期记忆 - 基于 LangGraph Checkpointer"""
from langgraph.checkpoint.redis import RedisSaver

from src.config.settings import REDIS_URL


def get_redis_checkpointer() -> RedisSaver:
    """获取 Redis checkpointer 实例（按 configurable.thread_id 隔离 checkpoint）。"""
    saver = RedisSaver(redis_url=REDIS_URL)
    # 创建 RediSearch 等依赖的索引；未调用时可能出现 “No such index checkpoint_write”
    saver.setup()
    return saver
