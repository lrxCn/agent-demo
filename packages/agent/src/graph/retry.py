"""工具调用重试机制（同步，兼容 graph.invoke）"""
import logging
import time

from langchain_core.messages import ToolMessage
from langchain_core.tools import BaseTool

logger = logging.getLogger(__name__)

MAX_RETRIES = 3
BASE_DELAY = 1  # 秒


def invoke_tool_with_retry(
    tool: BaseTool,
    tool_input: dict[str, object],
    tool_call_id: str,
) -> ToolMessage:
    """带重试的工具调用（同步）

    使用指数退避：1s → 2s → 4s（在两次重试之间 sleep）
    """
    last_error: BaseException | None = None
    attempt_lines: list[str] = []

    for attempt in range(MAX_RETRIES):
        try:
            result = tool.invoke(tool_input)
            return ToolMessage(content=str(result), tool_call_id=tool_call_id)
        except Exception as e:
            last_error = e
            n = attempt + 1
            attempt_lines.append(f'第{n}次调用失败: {type(e).__name__}: {e}')
            delay = BASE_DELAY * (2**attempt)
            logger.warning(
                '工具 %s 第 %s 次调用失败: %s，%s 秒后重试...',
                tool.name,
                n,
                e,
                delay,
            )
            if attempt < MAX_RETRIES - 1:
                time.sleep(delay)

    summary = '；'.join(attempt_lines)
    error_msg = (
        f'工具 {tool.name} 调用失败（共尝试 {MAX_RETRIES} 次，每次均失败）。'
        f'明细：{summary}'
    )
    logger.error('%s | 最后一次: %s', error_msg, str(last_error))
    return ToolMessage(
        content=f'⚠️ {error_msg}',
        tool_call_id=tool_call_id,
    )
