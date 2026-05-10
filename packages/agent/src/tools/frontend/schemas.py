"""前端工具 Schema 定义

这些工具由 Agent 结构化输出发起调用请求，经 NestJS 转发后由前端实际执行。
Agent 端仅包含 schema（参数定义 + 描述），不执行真实业务逻辑。
"""
from typing import Literal
from langchain_core.tools import tool


@tool
def navigate_to_page(
    path: Literal["/dashboard", "/users", "/roles", "/students", "/knowledge"], 
    confirm_message: str = ""
) -> str:
    """导航到指定的系统页面。当用户要求“跳转/打开/去XXX页面”时，必须调用此工具。

    可用路径及对应页面如下：
    - /dashboard : 仪表盘 / 首页
    - /users : 用户管理
    - /roles : 角色管理
    - /students : 学生管理
    - /knowledge : 知识库

    Args:
        path: 目标页面的路径（必须是上方列出的可选值之一）
        confirm_message: 显示给用户的确认信息
    """
    return f"请求导航到 {path}"


@tool
def create_student(
    name: str,
    student_no: str,
    gender: str,
    class_name: str,
    phone: str = "",
    email: str = "",
) -> str:
    """创建新学生记录。需要用户确认。

    Args:
        name: 学生姓名
        student_no: 学号
        gender: 性别（男/女）
        class_name: 班级
        phone: 手机号（可选）
        email: 邮箱（可选）
    """
    return f"请求创建学生: {name}"


@tool
def delete_student(student_id: str, student_name: str) -> str:
    """删除学生记录。需要用户确认。

    Args:
        student_id: 学生 ID
        student_name: 学生姓名（用于确认提示）
    """
    return f"请求删除学生: {student_name}"


@tool
def query_students(keyword: str = "", page: int = 1) -> str:
    """查询学生列表。

    Args:
        keyword: 搜索关键词（姓名或学号）
        page: 页码
    """
    return f"请求查询学生: keyword={keyword}"
