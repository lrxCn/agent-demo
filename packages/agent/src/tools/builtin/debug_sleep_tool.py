"""调试：阻塞等待，用于验证工具总超时"""
import time

from langchain_core.tools import tool


@tool
def debug_sleep_seconds(seconds: int = 30) -> str:
    """阻塞等待指定秒数（同步 sleep），用于调试工具链与超时。

    默认等待 30 秒。当前图对单次工具执行的总超时为 30 秒；
    若要稳定触发超时，请在调用时传入大于 30 的值（例如 35）。
    """
    if seconds < 1 or seconds > 120:
        return '参数 seconds 须在 1～120 之间'
    time.sleep(float(seconds))
    return f'已阻塞等待 {seconds} 秒'
