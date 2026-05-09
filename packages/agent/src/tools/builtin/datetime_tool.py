"""日期时间工具"""
from datetime import datetime

from langchain_core.tools import tool


@tool
def get_current_time() -> str:
    """获取当前日期和时间"""
    now = datetime.now()
    weekday_cn = '一二三四五六日'[now.weekday()]
    return (
        f"当前时间：{now.strftime('%Y年%m月%d日 %H:%M:%S')}，星期{weekday_cn}"
    )
