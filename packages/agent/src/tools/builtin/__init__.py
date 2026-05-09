"""内置工具注册"""
from src.tools.builtin.datetime_tool import get_current_time
from src.tools.builtin.math_tool import calculate
from src.tools.registry import registry


def register_builtin_tools() -> None:
    """注册所有内置工具"""
    registry.register(calculate, category='builtin', tags=['math'])
    registry.register(get_current_time, category='builtin', tags=['utility'])
