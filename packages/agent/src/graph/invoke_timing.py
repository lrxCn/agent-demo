"""可选的 invoke 耗时分项：通过 ContextVar 累加 LLM / 工具耗时（由 CLI 在 invoke 前 reset）。"""
from __future__ import annotations

import contextvars
import time
from contextlib import contextmanager
from dataclasses import dataclass
from functools import wraps
from typing import Callable, Iterator, Literal, ParamSpec, TypeVar

P = ParamSpec('P')
R = TypeVar('R')

_Segment = Literal['llm_seconds', 'tool_seconds']


@dataclass
class InvokeTimingAccumulator:
    """单次 graph.invoke 内累计值。"""

    llm_seconds: float = 0.0
    tool_seconds: float = 0.0


_ctx: contextvars.ContextVar[InvokeTimingAccumulator | None] = contextvars.ContextVar(
    'invoke_timing_acc',
    default=None,
)


def reset_invoke_timing() -> InvokeTimingAccumulator:
    """在 graph.invoke 开始前调用，开始新一轮累计。"""
    acc = InvokeTimingAccumulator()
    _ctx.set(acc)
    return acc


def current_invoke_timing() -> InvokeTimingAccumulator | None:
    """节点内读取当前累计器；未 reset 时为 None（例如 langgraph dev）。"""
    return _ctx.get()


@contextmanager
def _track_segment(attribute: _Segment) -> Iterator[None]:
    """将块内墙钟时间累加到当前累计器的指定字段（无累计器则 no-op）。"""
    acc = current_invoke_timing()
    if acc is None:
        yield
        return
    t0 = time.perf_counter()
    try:
        yield
    finally:
        delta = time.perf_counter() - t0
        if attribute == 'llm_seconds':
            acc.llm_seconds += delta
        else:
            acc.tool_seconds += delta


@contextmanager
def track_llm_seconds() -> Iterator[None]:
    """包裹一次 LLM 调用（如 `llm.invoke`），累加到 `llm_seconds`。"""
    with _track_segment('llm_seconds'):
        yield


@contextmanager
def track_tool_seconds() -> Iterator[None]:
    """包裹一次工具等待（如 `future.result`），累加到 `tool_seconds`。"""
    with _track_segment('tool_seconds'):
        yield


def timed_llm(func: Callable[P, R]) -> Callable[P, R]:
    """装饰整段「只做 LLM 调用」的函数，等价于函数体外套 `track_llm_seconds`。"""

    @wraps(func)
    def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
        with track_llm_seconds():
            return func(*args, **kwargs)

    return wrapper


def timed_tool(func: Callable[P, R]) -> Callable[P, R]:
    """装饰整段「只做工具同步等待」的函数，等价于函数体外套 `track_tool_seconds`。"""

    @wraps(func)
    def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
        with track_tool_seconds():
            return func(*args, **kwargs)

    return wrapper
