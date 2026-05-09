"""数学计算工具"""
from langchain_core.tools import tool


@tool
def calculate(expression: str) -> str:
    """计算数学表达式。支持加减乘除、幂运算等。

    Args:
        expression: 数学表达式，如 "2 + 3 * 4"
    """
    try:
        # 仅允许数字与基本运算符，降低 eval 风险
        allowed_chars = set('0123456789+-*/.() ')
        if not all(c in allowed_chars for c in expression):
            return '错误：表达式包含不允许的字符'
        result = eval(expression, {'__builtins__': {}}, {})
        return f'计算结果：{expression} = {result}'
    except Exception as e:
        return f'计算错误：{e!s}'
