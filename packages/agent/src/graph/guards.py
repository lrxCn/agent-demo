"""图节点护栏：统一处理超时与降级返回。"""
from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FuturesTimeout
from functools import wraps
from typing import Callable, ParamSpec, TypeVar

P = ParamSpec('P')
R = TypeVar('R')

logger = logging.getLogger(__name__)


def node_timeout_guard(
    *,
    node_name: str,
    timeout_seconds: float,
    fallback: Callable[[], R],
) -> Callable[[Callable[P, R]], Callable[P, R]]:
    """为同步节点增加超时护栏，超时后返回 fallback。"""

    def decorator(func: Callable[P, R]) -> Callable[P, R]:
        @wraps(func)
        def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
            pool = ThreadPoolExecutor(max_workers=1)
            try:
                future = pool.submit(func, *args, **kwargs)
                try:
                    return future.result(timeout=timeout_seconds)
                except FuturesTimeout:
                    logger.warning(
                        '节点 %s 超时（%ss），本轮降级继续',
                        node_name,
                        timeout_seconds,
                    )
                    return fallback()
            finally:
                # 不阻塞主流程，后台线程自行结束
                pool.shutdown(wait=False, cancel_futures=True)

        return wrapper

    return decorator
