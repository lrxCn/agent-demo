"""调试：故意抛错，验证重试与最终 ToolMessage 兜底"""
from langchain_core.tools import tool


@tool
def debug_always_fail(reason: str = '测试') -> str:
    """每次调用都抛出异常，用于验证 `invoke_tool_with_retry` 在重试耗尽后
    是否返回带错误说明的 ToolMessage，而不是让图直接崩溃。

    Args:
        reason: 写入异常信息，便于在日志里区分场景
    """
    msg = f'调试故意失败: {reason}'
    raise RuntimeError(msg)
